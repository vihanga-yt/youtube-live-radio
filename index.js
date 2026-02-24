const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;

let ffmpegProcess = null;
let streamStatus = "Offline";
let startTime = null;
let lastError = "";

// 1. FUNCTION TO START STREAM
function startStream() {
    const streamKey = process.env.YOUTUBE_KEY;
    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    // FFmpeg settings (optimized for Koyeb Nano)
    ffmpegProcess = spawn('ffmpeg', [
        '-re', '-stream_loop', '-1',
        '-i', 'video.mp4',
        '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '1000k',
        '-maxrate', '1000k', '-bufsize', '2000k',
        '-pix_fmt', 'yuv420p', '-g', '50',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
        '-f', 'flv', rtmpUrl
    ]);

    streamStatus = "Live";
    startTime = new Date();

    ffmpegProcess.stderr.on('data', (data) => {
        // Log only errors to console to save memory
        if (data.toString().includes("Error")) {
            lastError = data.toString();
            console.error(`FFmpeg Error: ${data}`);
        }
    });

    ffmpegProcess.on('close', (code) => {
        streamStatus = "Offline";
        startTime = null;
        console.log(`FFmpeg exited with code ${code}. Restarting in 5s...`);
        // Auto-restart if it crashes
        setTimeout(startStream, 5000);
    });
}

// Start the stream immediately
startStream();

// 2. API ENDPOINT FOR STATUS
app.get('/api/status', (req, res) => {
    res.json({
        status: streamStatus,
        uptime: startTime ? Math.floor((new Date() - startTime) / 1000) : 0,
        error: lastError || "None"
    });
});

// 3. SERVE THE DASHBOARD
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Dashboard running on port ${port}`);
});
