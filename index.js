const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

const CONFIG = {
    template: path.resolve('template.mp4'),
    image: path.resolve('mom.jpg'),
    output: path.resolve('test_output.mp4'),
    momName: "Sita",
    introDuration: 3,
    templateDuration: 20,
    width: 1440,
    height: 2848
};

const totalDuration = CONFIG.introDuration + CONFIG.templateDuration;

console.log('--- Starting Render ---');
console.time('RenderTime');

ffmpeg()
    .input(CONFIG.template) // 0:v, 0:a
    .input(CONFIG.image)    // 1:v
    // Generate black background with fixed duration
    .input(`color=c=black:s=${CONFIG.width}x${CONFIG.height}:r=30:d=${totalDuration}`) // 2:v
    .inputOptions(['-f lavfi'])
    // Silent audio with fixed duration
    .input(`anullsrc=r=44100:cl=stereo:d=${totalDuration}`) // 3:a
    .inputOptions(['-f lavfi'])

    .complexFilter([
        // 1. Prepare Intro Video: Black background + Text + Fade Out
        {
            filter: 'drawtext',
            inputs: '2:v',
            outputs: 'intro_text',
            options: {
                text: 'Presenting the song for my mom...',
                fontsize: 80,
                fontcolor: 'white',
                x: '(w-text_w)/2',
                y: '(h-text_h)/2',
            }
        },
        {
            filter: 'fade',
            inputs: 'intro_text',
            outputs: 'intro_final',
            options: {
                type: 'out',
                st: CONFIG.introDuration - 0.5,
                d: 0.5
            }
        },

        // 2. Prepare Main Video: Scale image and overlay on template
        {
            filter: 'scale',
            inputs: '1:v',
            outputs: 'scaled_mom',
            options: {
                w: CONFIG.width * 0.8,
                h: -1 // Maintain aspect ratio
            }
        },
        {
            filter: 'overlay',
            inputs: ['0:v', 'scaled_mom'],
            outputs: 'main_with_mom',
            options: {
                x: '(W-w)/2',
                y: 100 // Top portion
            }
        },
        // Delay main video by introDuration
        {
            filter: 'setpts',
            inputs: 'main_with_mom',
            outputs: 'main_delayed',
            options: `PTS+${CONFIG.introDuration}/TB`
        },

        // 3. Combine Intro and Main Video
        // Use overlay with the intro_final (capped) as the base
        {
            filter: 'overlay',
            inputs: ['intro_final', 'main_delayed'],
            outputs: 'v',
            options: {
                enable: `gte(t,${CONFIG.introDuration})`
            }
        },

        // 4. Prepare Audio: Silent intro + Delayed main audio
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
            options: {
                inputs: 2,
                duration: 'first' // End when the first input (anullsrc with duration) ends
            }
        }
    ])
    .outputOptions([
        '-map [v]',
        '-map [a]',
        '-c:v libx264',
        '-c:a aac',
        '-pix_fmt yuv420p',
        '-t', totalDuration.toString() // Safety cap
    ])
    .on('start', cmd => console.log('\nFFmpeg Command:\n', cmd))
    .on('progress', progress => {
        if (progress.percent) {
            console.log(`Processing: ${Math.floor(progress.percent)}% done`);
        }
    })
    .on('error', err => {
        console.error('Error:', err.message);
    })
    .on('end', () => {
        console.timeEnd('RenderTime');
        console.log('--- Render Complete ---');
    })
    .save(CONFIG.output);
