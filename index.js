const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs'); // Added to check for file
const app = express();
const port = process.env.PORT || 8000;

let streamStatus = "Offline";
let lastError = "None";
const mp3Dir = './mp3'; // Your folder name
const files = fs.readdirSync(mp3Dir).filter(f => f.endsWith('.mp3'));
const listContent = files.map(f => `file '${path.join(mp3Dir, f)}'`).join('\n');

fs.writeFileSync('playlist.txt', listContent);
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
    // 1. Generate Video Background
    '-f', 'lavfi', 
    '-i', 'color=c=black:s=854x480:r=24', 

    // 2. Loop the Playlist (The Fix for All Songs)
    '-f', 'concat', 
    '-safe', '0', 
    '-stream_loop', '-1', 
    '-i', 'playlist.txt', 

    // 3. Filters (Text + Audio Sync)
    '-vf', "drawtext=text='RADIO STREAMING':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2",
    '-af', 'aresample=async=1', 

    // 4. Encoding (Optimized for Low Quality/High Stability)
    '-c:v', 'libx264', 
    '-preset', 'ultrafast', 
    '-tune', 'stillimage', 
    '-pix_fmt', 'yuv420p', 
    '-vb', '800k', 
    '-maxrate', '800k', 
    '-bufsize', '1600k', 
    '-g', '48', 

    // 5. Audio Encoding
    '-c:a', 'aac', 
    '-b:a', '128k', 
    '-ar', '44100', 

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
