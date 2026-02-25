const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server); // WebSocket for real-time logs

const port = process.env.PORT || 8000;
const startTime = Date.now();
let streamStatus = "Offline";
let ffmpegProcess = null;

// Function to send logs to both Console and Web Dashboard instantly
function broadcastLog(message, type = 'info') {
    const logEntry = {
        time: new Date().toLocaleTimeString(),
        text: message.trim(),
        type: type
    };
    console.log(`[${logEntry.time}] ${message}`);
    io.emit('log-push', logEntry); // Push to web dashboard
}

// ==========================================
// STREAMING LOGIC
// ==========================================
function startStream() {
    const streamKey = process.env.YOUTUBE_KEY;
    if (!streamKey) {
        broadcastLog("CRITICAL: YOUTUBE_KEY is missing!", "error");
        return;
    }

    const mp3Dir = path.resolve(__dirname, 'mp3');
    const playlistPath = path.resolve(__dirname, 'playlist.txt');
    
    try {
        const files = fs.readdirSync(mp3Dir).filter(f => f.endsWith('.mp3'));
        if (files.length === 0) {
            broadcastLog("No MP3s found. Waiting...", "warn");
            setTimeout(startStream, 10000);
            return;
        }
        const listContent = files.map(f => `file '${path.join(mp3Dir, f).replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(playlistPath, listContent);
    } catch (err) {
        broadcastLog(`FS Error: ${err.message}`, "error");
        return;
    }

    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    // Improved FFmpeg args to fix "Invalid data found" (Resampling audio)
    ffmpegProcess = spawn('ffmpeg', [
        '-re',
        '-f', 'concat', 
        '-safe', '0', 
        '-stream_loop', '-1', 
        '-i', playlistPath, 
        '-f', 'lavfi', 
        '-i', 'color=c=black:s=854x480:r=24', 
        '-vf', "drawtext=text='LIVE RADIO':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2",
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '48', '-vb', '1000k',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', // Force consistent audio
        '-af', 'aresample=async=1', // Fixes sync/invalid data issues
        '-f', 'flv', 
        rtmpUrl
    ]);

    streamStatus = "Live";
    broadcastLog("Stream process started successfully.", "success");

    ffmpegProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        // Ignore progress spam, show only errors/status
        if (!msg.includes("frame=") && !msg.includes("fps=")) {
            broadcastLog(msg, msg.toLowerCase().includes("error") ? "error" : "info");
        }
    });

    ffmpegProcess.on('close', (code) => {
        streamStatus = "Offline";
        broadcastLog(`FFmpeg exited with code ${code}. Restarting...`, "warn");
        setTimeout(startStream, 5000);
    });
}

// Start everything
startStream();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (req, res) => res.status(200).send('OK'));

// API for initial state
app.get('/api/status', (req, res) => {
    res.json({ 
        status: streamStatus, 
        uptime: Math.floor((Date.now() - startTime) / 1000) 
    });
});

server.listen(port, '0.0.0.0', () => {
    broadcastLog(`Monitor Server live on port ${port}`, "success");
});
