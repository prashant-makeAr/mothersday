const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

const CONFIG = {
    template: path.resolve('template.mp4'),
    image: path.resolve('mom.jpg'),
    output: path.resolve('test_output.mp4'),
    momName: "Sita",
};

console.log('--- Starting Render ---');
console.time('RenderTime');

ffmpeg()
    .input(CONFIG.template)
    .input(CONFIG.image)
    .complexFilter([

        // Scale image
        {
            filter: 'scale',
            options: 'iw*0.3:-1',
            inputs: '1:v',
            outputs: 'scaled_mom'
        },

        // Text (fixed fade)
        {
            filter: 'drawtext',
            options: {
                text: `Special Song for ${CONFIG.momName}`,
                fontsize: 60,
                fontcolor: 'white',
                alpha: 'if(lt(t,1), t, 1)', // FIXED

                box: 1,
                boxcolor: 'black@0.4',
                boxborderw: 20,

                x: '(w-text_w)/2',
                y: 'if(lt(t,1), -text_h + t*200, h*0.15)',

                enable: 'between(t,0,3)'
            },
            inputs: '0:v',
            outputs: 'v_text'
        },

        // Image overlay
        {
            filter: 'overlay',
            options: {
                x: '(W-w)/2',
                y: 'if(gt(t,3), H-h-80 - 200*exp(-3*(t-3)), H)',
                enable: 'gt(t,3)'
            },
            inputs: ['v_text', 'scaled_mom'],
            outputs: 'final_video'
        }

    ], 'final_video')

    .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 23',
        '-pix_fmt yuv420p',
        '-movflags +faststart'
    ])

    .on('start', cmd => console.log('\nFFmpeg Command:\n', cmd))
    .on('progress', p => p.percent && console.log(`Processing: ${p.percent.toFixed(2)}%`))
    .on('error', err => console.error('Error:', err.message))
    .on('end', () => {
        console.timeEnd('RenderTime');
        console.log('--- Render Complete ---');
    })

    .save(CONFIG.output);