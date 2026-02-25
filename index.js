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
    // 1. Generate the background at a fixed rate
    '-f', 'lavfi', 
    '-i', 'color=c=black:s=854x480:r=24', 
    
    // 2. Loop the song correctly (without -re here to avoid sync issues)
    '-stream_loop', '-1', 
    '-i', './song.mp3', 
    
    // 3. The Filter (Text + Video)
    '-vf', "drawtext=text='Saragaye Looop':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2",
    
    // 4. Encoding Settings (Reduced Quality for Stability)
    '-c:v', 'libx264', 
    '-preset', 'ultrafast', 
    '-tune', 'stillimage', 
    '-pix_fmt', 'yuv420p', 
    '-vb', '800k',            // Slightly higher than 500k to prevent "stutter"
    '-maxrate', '800k', 
    '-bufsize', '1600k', 
    '-g', '48',               // Keyframe every 2 seconds
    
    // 5. Audio Settings (Crucial for fixing the "doubling" sound)
    '-c:a', 'aac', 
    '-b:a', '128k', 
    '-ar', '44100', 
    '-af', 'aresample=async=1', // Syncs audio samples to video clock
    
    // 6. Output
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
