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

// Ensure uploads and temp directories exist
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('temp_output')) fs.mkdirSync('temp_output');

const CONFIG = {
    template: path.resolve('template.mp4'),
    width: 1080,
    height: 2133,
    introDuration: 4,
    templateDuration: 20,
    fontPath: fs.existsSync('font.ttf') ? path.resolve('font.ttf') : null 
};

function wrapText(text, maxCharsPerLine) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = "";

    words.forEach(word => {
        if ((currentLine + word).length > maxCharsPerLine) {
            lines.push(currentLine.trim());
            currentLine = word + " ";
        } else {
            currentLine += word + " ";
        }
    });
    lines.push(currentLine.trim());
    return lines.join('\n');
}

app.get('/', (req, res) => {
    res.render('index');
});

app.post('/generate', upload.single('momImage'), (req, res) => {
    const userImage = req.file.path;
    const userMessage = wrapText(req.body.message || "Presenting the song for my mom...", 20);
    const outputFileName = `video_${Date.now()}.mp4`;
    const outputPath = path.join(__dirname, 'temp_output', outputFileName);

    const totalDuration = CONFIG.introDuration + CONFIG.templateDuration;

    const maxOverlayWidth = Math.floor(CONFIG.width * 0.95);
    const maxOverlayHeight = Math.floor(CONFIG.height * 0.40);
    const borderPadding = 20;

    console.log(`Generating video (Ultra-Compatible Fix) for: "${userMessage}"`);

    const drawtextOptions = {
        text: userMessage,
        fontsize: 80,
        fontcolor: 'white',
        shadowcolor: 'black@0.8',
        shadowx: 5,
        shadowy: 5,
        x: '(w-text_w)/2',
        y: '(h-text_h)/2',
        box: 1,
        boxcolor: 'black@0.4',
        boxborderw: 40,
        line_spacing: 20
    };

    if (CONFIG.fontPath) {
        drawtextOptions.fontfile = CONFIG.fontPath;
    }

    ffmpeg()
        .input(CONFIG.template) // 0:v, 0:a
        .input(userImage)       // 1:v
        .complexFilter([
            // 1. STYLISH INTRO (Uses blurred user image as background)
            {
                filter: 'scale',
                inputs: '1:v',
                outputs: 'intro_bg_scaled',
                options: { w: CONFIG.width, h: CONFIG.height, force_original_aspect_ratio: 'increase' }
            },
            {
                filter: 'crop',
                inputs: 'intro_bg_scaled',
                outputs: 'intro_bg_cropped',
                options: { w: CONFIG.width, h: CONFIG.height }
            },
            {
                filter: 'boxblur',
                inputs: 'intro_bg_cropped',
                outputs: 'intro_bg_blurred',
                options: { luma_radius: 30, luma_power: 3 }
            },
            {
                filter: 'drawbox',
                inputs: 'intro_bg_blurred',
                outputs: 'intro_bg_dimmed',
                options: { x: 0, y: 0, w: 'iw', h: 'ih', color: 'black@0.4', t: 'fill' }
            },
            {
                filter: 'drawtext',
                inputs: 'intro_bg_dimmed',
                outputs: 'intro_text',
                options: drawtextOptions
            },
            {
                filter: 'fade',
                inputs: 'intro_text',
                outputs: 'intro_final',
                options: { type: 'out', st: CONFIG.introDuration - 0.5, d: 0.5 }
            },

            // 2. MAIN VIDEO
            {
                filter: 'scale',
                inputs: '0:v',
                outputs: 'template_scaled',
                options: { w: CONFIG.width, h: CONFIG.height }
            },
            {
                filter: 'scale',
                inputs: '1:v',
                outputs: 'scaled_mom_fit',
                options: { 
                    w: maxOverlayWidth - borderPadding, 
                    h: maxOverlayHeight - borderPadding, 
                    force_original_aspect_ratio: 'decrease' 
                }
            },
            {
                filter: 'pad',
                inputs: 'scaled_mom_fit',
                outputs: 'mom_with_border',
                options: { w: 'iw+20', h: 'ih+20', x: 10, y: 10, color: 'white@0.9' }
            },
            {
                filter: 'overlay',
                inputs: ['template_scaled', 'mom_with_border'],
                outputs: 'main_with_mom',
                options: { 
                    x: '(W-w)/2', 
                    y: `(${maxOverlayHeight}-h)/2 + 50` 
                }
            },
            {
                filter: 'setpts',
                inputs: 'main_with_mom',
                outputs: 'main_delayed',
                options: `PTS+${CONFIG.introDuration}/TB`
            },

            // 3. MERGE VIDEO
            {
                filter: 'overlay',
                inputs: ['intro_final', 'main_delayed'],
                outputs: 'v',
                options: { enable: `gte(t,${CONFIG.introDuration})` }
            },

            // 4. AUDIO (Simply delay the template audio - first 4s will be silent automatically)
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
            '-crf 23',
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
            res.status(500).send("Error generating video");
            if (fs.existsSync(userImage)) fs.unlinkSync(userImage);
        })
        .save(outputPath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});
