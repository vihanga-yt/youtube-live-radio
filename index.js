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
    '-re',                      // READ IN REAL-TIME (Crucial for live streams)
    '-loop', '1',               // Loop the image
    '-i', 'bg.png', 
    '-f', 'lavfi', 
    '-i', 'anullsrc',           // YouTube requires an audio track
    '-c:v', 'libx264', 
    '-preset', 'veryfast', 
    '-tune', 'stillimage', 
    '-pix_fmt', 'yuv420p', 
    '-g', '60',                 // Keyframe every 2 seconds (YouTube standard)
    '-vb', '2500k',             // Slightly higher bitrate for stability
    '-maxrate', '2500k', 
    '-bufsize', '5000k', 
    '-r', '30',                 // Force 30 FPS
    '-c:a', 'aac', 
    '-b:a', '128k', 
    '-ar', '44100', 
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
