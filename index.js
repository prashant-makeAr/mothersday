const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

const CONFIG = {
    template: path.resolve('template.mp4'),
    image: path.resolve('mom.jpg'),
    output: path.resolve('test_output.mp4'),
    momName: "Sita",
    introDuration: 4,
    templateDuration: 20,
    width: 1080, // Optimized from 1440 for scale
    height: 2133 // Aspect ratio preserved
};

const totalDuration = CONFIG.introDuration + CONFIG.templateDuration;

console.log('--- Starting Optimized Render ---');
console.time('RenderTime');

ffmpeg()
    .input(CONFIG.template) // 0:v, 0:a
    .input(CONFIG.image)    // 1:v
    .input(`color=c=0x1a0a2e:s=${CONFIG.width}x${CONFIG.height}:r=30:d=${CONFIG.introDuration}`) 
    .inputOptions(['-f lavfi'])
    .input(`anullsrc=r=44100:cl=stereo:d=${totalDuration}`) 
    .inputOptions(['-f lavfi'])

    .complexFilter([
        // --- 1. STYLISH INTRO ---
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
            options: {
                text: 'Presenting the song\nfor my mom...',
                fontsize: 100, // Adjusted for 1080p
                fontcolor: 'white',
                shadowcolor: 'black@0.8',
                shadowx: 5,
                shadowy: 5,
                x: '(w-text_w)/2',
                y: '(h-text_h)/2',
                line_spacing: 30,
                box: 1,
                boxcolor: 'black@0.3',
                boxborderw: 40
            }
        },
        {
            filter: 'fade',
            inputs: 'intro_text',
            outputs: 'intro_final',
            options: { type: 'out', st: CONFIG.introDuration - 0.5, d: 0.5 }
        },

        // --- 2. MAIN VIDEO ---
        // Resize template to 1080 width to match intro
        {
            filter: 'scale',
            inputs: '0:v',
            outputs: 'template_scaled',
            options: { w: CONFIG.width, h: CONFIG.height }
        },
        {
            filter: 'scale',
            inputs: '1:v',
            outputs: 'scaled_mom',
            options: { w: CONFIG.width * 0.7, h: -1 }
        },
        {
            filter: 'pad',
            inputs: 'scaled_mom',
            outputs: 'mom_with_border',
            options: { w: 'iw+20', h: 'ih+20', x: 10, y: 10, color: 'white@0.9' }
        },
        {
            filter: 'overlay',
            inputs: ['template_scaled', 'mom_with_border'],
            outputs: 'main_with_mom',
            options: { x: '(W-w)/2', y: 150 }
        },
        {
            filter: 'setpts',
            inputs: 'main_with_mom',
            outputs: 'main_delayed',
            options: `PTS+${CONFIG.introDuration}/TB`
        },

        // --- 3. MERGE ---
        {
            filter: 'overlay',
            inputs: ['intro_final', 'main_delayed'],
            outputs: 'v',
            options: { enable: `gte(t,${CONFIG.introDuration})` }
        },

        // --- 4. AUDIO ---
        {
            filter: 'adelay',
            inputs: '0:a',
            outputs: 'main_a_delayed',
            options: `${CONFIG.introDuration * 1000}|${CONFIG.introDuration * 1000}`
        },
        {
            filter: 'amix',
            inputs: ['3:a', 'main_a_delayed'],
            outputs: 'a',
            options: { inputs: 2, duration: 'first' }
        }
    ])
    .outputOptions([
        '-map [v]',
        '-map [a]',
        '-c:v libx264',
        '-preset ultrafast', // MAX SPEED
        '-crf 23',
        '-c:a aac',
        '-pix_fmt yuv420p',
        '-t', totalDuration.toString()
    ])
    .on('progress', p => {
        if (p.percent) console.log(`Progress: ${Math.floor(p.percent)}%`);
    })
    .on('error', err => console.error('Error:', err.message))
    .on('end', () => {
        console.timeEnd('RenderTime');
        console.log('--- Optimized Render Complete ---');
    })
    .save(CONFIG.output);
