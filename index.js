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
    '-re',                                   // Read in real-time
    '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30', // Solid black background, 720p, 30fps
    '-f', 'lavfi', '-i', 'anullsrc=cl=stereo:r=44100',    // Required silent audio
    '-vf', "drawtext=text='YOUR STREAM TEXT HERE':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2", 
    '-c:v', 'libx264', 
    '-preset', 'veryfast', 
    '-tune', 'stillimage', 
    '-pix_fmt', 'yuv420p', 
    '-g', '60',                              // Keyframe every 2 seconds
    '-c:a', 'aac', 
    '-b:a', '128k', 
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
