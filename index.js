const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const app = express();
const port = process.env.PORT || 8000;

let streamStatus = "Offline";
let lastError = "None";
let ffmpegProcess = null;
let logs = []; // To store recent logs for the web UI
const startTime = Date.now(); // To track uptime

// Helper to add logs
function addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] ${message}`;
    logs.push(logLine);
    if (logs.length > 20) logs.shift(); // Keep only last 20 lines
    console.log(logLine);
}

// ==========================================
// 1. ANTI-CRASH LOGIC
// ==========================================
process.on('uncaughtException', (err) => {
    addLog(`CRITICAL ERROR: ${err.message}`);
    lastError = err.message;
});

process.on('unhandledRejection', (reason) => {
    addLog(`REJECTION: ${reason}`);
    lastError = String(reason);
});

// ==========================================
// 2. STREAMING LOGIC
// ==========================================
function startStream() {
    const streamKey = process.env.YOUTUBE_KEY;
    
    if (!streamKey) {
        lastError = "ERROR: YOUTUBE_KEY missing!";
        addLog(lastError);
        return;
    }

    const mp3Dir = path.resolve(__dirname, 'mp3');
    const playlistPath = path.resolve(__dirname, 'playlist.txt');
    
    try {
        if (!fs.existsSync(mp3Dir)) fs.mkdirSync(mp3Dir);
        const files = fs.readdirSync(mp3Dir).filter(f => f.endsWith('.mp3'));
        
        if (files.length === 0) {
            addLog("WARNING: No MP3 files found. Retrying in 10s...");
            setTimeout(startStream, 10000);
            return;
        }
        
        const listContent = files.map(f => `file '${path.join(mp3Dir, f).replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(playlistPath, listContent);
    } catch (err) {
        addLog(`Directory Error: ${err.message}`);
        return;
    }

    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    ffmpegProcess = spawn('ffmpeg', [
        '-f', 'lavfi', 
        '-i', 'color=c=black:s=854x480:r=24', 
        '-re', 
        '-f', 'concat', 
        '-safe', '0', 
        '-stream_loop', '-1', 
        '-i', playlistPath, 
        '-vf', "drawtext=text='RADIO STREAMING':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2",
        '-af', 'aresample=async=1', 
        '-c:v', 'libx264', 
        '-preset', 'ultrafast', 
        '-tune', 'stillimage', 
        '-pix_fmt', 'yuv420p', 
        '-vb', '800k', 
        '-maxrate', '800k', 
        '-bufsize', '1600k', 
        '-g', '48', 
        '-c:a', 'aac', 
        '-b:a', '128k', 
        '-ar', '44100', 
        '-f', 'flv', 
        rtmpUrl
    ]);

    streamStatus = "Live";
    addLog("Stream started successfully!");

    ffmpegProcess.stderr.on('data', (data) => {
        const message = data.toString();
        // Capture only useful info to avoid flooding the logs array
        if (message.includes("frame=") || message.includes("size=")) {
            // This is just FFmpeg progress, optional to log
        } else {
            addLog(`FFmpeg: ${message.substring(0, 100)}...`);
            lastError = message.substring(0, 200);
        }
    });

    ffmpegProcess.on('close', (code) => {
        streamStatus = "Offline";
        addLog(`FFmpeg exited with code ${code}. Restarting in 5s...`);
        ffmpegProcess = null;
        setTimeout(startStream, 5000);
    });
}

startStream();

// ==========================================
// 3. KOYEB HEALTH & WEB ROUTES
// ==========================================

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/api/status', (req, res) => {
    res.json({ 
        status: streamStatus, 
        error: lastError,
        uptime: Math.floor((Date.now() - startTime) / 1000), // Seconds since start
        logs: logs // Array of recent logs
    });
});

app.get('/', (req, res) => {
    if (fs.existsSync(path.join(__dirname, 'index.html'))) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        res.send(`<h1>Stream: ${streamStatus}</h1><p>Logs: ${logs.join('<br>')}</p>`);
    }
});

// ==========================================
// 4. SELF-PINGER
// ==========================================
function keepAlive() {
    const url = `https://${process.env.KOYEB_APP_NAME}.koyeb.app/health`; 
    setInterval(() => {
        http.get(url, (res) => {
            console.log(`[Keep-Alive] Status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('[Keep-Alive] Failed');
        });
    }, 5 * 60 * 1000);
}

app.listen(port, '0.0.0.0', () => {
    addLog(`Server running on port ${port}`);
    keepAlive();
});

process.on('SIGTERM', () => {
    if (ffmpegProcess) ffmpegProcess.kill('SIGTERM');
    process.exit();
});
