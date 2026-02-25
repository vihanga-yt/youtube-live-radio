const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs'); // Added to check for file
const app = express();
const port = process.env.PORT || 8000;

let streamStatus = "Offline";
let lastError = "None";

function startStream() {
    const streamKey = process.env.YOUTUBE_KEY;
    
    // 1. CHECK IF STREAM KEY IS MISSING
    if (!streamKey) {
        lastError = "ERROR: YOUTUBE_KEY environment variable is missing!";
        console.error(lastError);
        return;
    }



    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

const ffmpegProcess = spawn('ffmpeg', [
    '-re',                                   // Real-time streaming
    '-f', 'lavfi', 
    '-i', 'color=c=black:s=854x480:r=24',    // 480p Background
    '-stream_loop', '-1',                    // LOOP THE SONG INFINITELY
    '-i', './song.mp3',                      // Audio file in the same folder
    '-vf', "drawtext=text='STREAMING NOW':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2",
    '-c:v', 'libx264', 
    '-preset', 'ultrafast',                  // Minimum CPU usage
    '-tune', 'stillimage', 
    '-pix_fmt', 'yuv420p', 
    '-vb', '500k',                           // Low bitrate for stability
    '-maxrate', '500k', 
    '-bufsize', '1000k', 
    '-g', '48',                              // Keyframe interval (2 seconds at 24fps)
    '-c:a', 'aac', 
    '-b:a', '96k',                           // Efficient audio bitrate
    '-f', 'flv', 
    rtmpUrl
]);
    streamStatus = "Live";

    // 3. SHOW ALL FFMPEG LOGS (Crucial for debugging)
    ffmpegProcess.stderr.on('data', (data) => {
        const message = data.toString();
        console.log(`FFmpeg Log: ${message}`);
        if (message.includes("Error")) {
            lastError = message;
        }
    });

    ffmpegProcess.on('close', (code) => {
        streamStatus = "Offline";
        console.log(`FFmpeg exited with code ${code}. Restarting in 5s...`);
        setTimeout(startStream, 5000);
    });
}

startStream();

app.get('/api/status', (req, res) => {
    res.json({ status: streamStatus, error: lastError });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Dashboard running on port ${port}`);
});
