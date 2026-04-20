const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const upload = multer({ dest: 'uploads/' });

app.set('view engine', 'ejs');
app.use(express.static('public'));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('temp_output')) fs.mkdirSync('temp_output');

const CONFIG = {
    template: path.resolve('template.mp4'),
    width: 1080,
    height: 1920, // Standard 1080p Portrait
    introDuration: 4,
    templateDuration: 20
};

app.get('/', (req, res) => {
    res.render('index');
});

app.post('/generate', upload.single('momImage'), (req, res) => {
    const userImage = req.file.path;
    const outputFileName = `video_${Date.now()}.mp4`;
    const outputPath = path.join(__dirname, 'temp_output', outputFileName);
    const totalDuration = CONFIG.introDuration + CONFIG.templateDuration;

    console.log("Generating video (Concat Mode for Render)");

    ffmpeg()
        .input(CONFIG.template) // 0:v, 0:a
        .input(userImage)       // 1:v
        .complexFilter([
            // 1. Prepare Intro Segment
            `color=s=${CONFIG.width}x${CONFIG.height}:c=0x1a0a2e:d=${CONFIG.introDuration}:r=30[intro_bg]`,
            {
                filter: 'scale',
                inputs: '1:v',
                outputs: 'intro_img_scaled',
                options: { w: Math.floor(CONFIG.width * 0.8), h: -1 }
            },
            {
                filter: 'overlay',
                inputs: ['intro_bg', 'intro_img_scaled'],
                outputs: 'v_intro',
                options: { x: '(W-w)/2', y: '(H-h)/2' }
            },

            // 2. Prepare Main Segment
            {
                filter: 'scale',
                inputs: '0:v',
                outputs: 'main_template_scaled',
                options: { w: CONFIG.width, h: CONFIG.height }
            },
            {
                filter: 'fps',
                inputs: 'main_template_scaled',
                outputs: 'main_template_fps',
                options: { fps: 30 }
            },
            {
                filter: 'scale',
                inputs: '1:v',
                outputs: 'main_mom_scaled',
                options: { 
                    w: Math.floor(CONFIG.width * 0.9), 
                    h: Math.floor(CONFIG.height * 0.35), 
                    force_original_aspect_ratio: 'decrease' 
                }
            },
            {
                filter: 'overlay',
                inputs: ['main_template_fps', 'main_mom_scaled'],
                outputs: 'v_main',
                options: { x: '(W-w)/2', y: 150 }
            },

            // 3. Concat Video
            {
                filter: 'concat',
                inputs: ['v_intro', 'v_main'],
                outputs: 'v',
                options: { n: 2, v: 1, a: 0 }
            },

            // 4. Audio: Delay template audio by 4s
            {
                filter: 'adelay',
                inputs: '0:a',
                outputs: 'a',
                options: `${CONFIG.introDuration * 1000}|${CONFIG.introDuration * 1000}`
            }
        ])
        .outputOptions([
            '-map [v]',
            '-map [a]',
            '-c:v libx264',
            '-preset ultrafast',
            '-crf 28', // Slightly lower quality for much faster encoding on Render
            '-c:a aac',
            '-pix_fmt yuv420p',
            '-t', totalDuration.toString()
        ])
        .on('end', () => {
            res.download(outputPath, (err) => {
                if (fs.existsSync(userImage)) fs.unlinkSync(userImage);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            });
        })
        .on('error', (err) => {
            console.error(err);
            res.status(500).send("Error generating video: " + err.message);
            if (fs.existsSync(userImage)) fs.unlinkSync(userImage);
        })
        .save(outputPath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});
