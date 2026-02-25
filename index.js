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
    '-loop', '1',               // Loop the input image
    '-i', 'bg.png',             // Your source image
    '-f', 'lavfi',              // Use a virtual audio source
    '-i', 'anullsrc',           // Generate silent audio
    '-c:v', 'libx264', 
    '-preset', 'veryfast', 
    '-tune', 'stillimage',      // Optimization for static images
    '-pix_fmt', 'yuv420p', 
    '-s', '1280x720',           // Ensure a standard broadcast resolution
    '-vb', '1000k', 
    '-maxrate', '1000k', 
    '-bufsize', '2000k',
    '-g', '50',                 // Keyframe interval
    '-c:a', 'aac', 
    '-b:a', '128k', 
    '-ar', '44100',
    '-shortest',                // Finish if one stream ends (prevents runaway)
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
