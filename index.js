const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const app = express();
const port = process.env.PORT || 8000;

const startTime = Date.now();
let streamStatus = "Offline";
let lastError = "None";
let ffmpegProcess = null;
let logs = [];

// Helper to format seconds to HH:MM:SS
function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
}

function addLog(message) {
    const time = new Date().toLocaleTimeString();
    // Keep logs clean: filter out the specific MP3 overread spam
    const lowerMsg = message.toLowerCase();
    const isSpam = lowerMsg.includes("overread") || 
                   lowerMsg.includes("last message repeated") || 
                   lowerMsg.includes("skip");

    if (!isSpam) {
        logs.push(`[${time}] ${message.trim()}`);
        if (logs.length > 20) logs.shift();
        console.log(message);
    }
}

// ==========================================
// 1. ANTI-CRASH LOGIC
// ==========================================
process.on('uncaughtException', (err) => {
    addLog(`CRITICAL ERROR: ${err.message}`);
    lastError = err.message;
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
        const files = fs.readdirSync(mp3Dir).filter(f => f.endsWith('.mp3'));
        if (files.length === 0) {
            addLog("Waiting for MP3 files...");
            setTimeout(startStream, 10000);
            return;
        }
        const listContent = files.map(f => `file '${path.join(mp3Dir, f).replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(playlistPath, listContent);
    } catch (err) {
        addLog(`File Error: ${err.message}`);
        return;
    }

    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    // Added '-fflags +genpts' to help with MP3 sync issues
    ffmpegProcess = spawn('ffmpeg', [
        '-re',
        '-f', 'lavfi', 
        '-i', 'color=c=black:s=854x480:r=24', 
        '-f', 'concat', 
        '-safe', '0', 
        '-stream_loop', '-1', 
        '-i', playlistPath, 
        '-vf', "drawtext=text='RADIO STREAMING LIVE':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2",
        '-c:v', 'libx264', 
        '-preset', 'ultrafast', 
        '-tune', 'stillimage', 
        '-pix_fmt', 'yuv420p', 
        '-vb', '1000k', 
        '-g', '48', 
        '-c:a', 'aac', 
        '-b:a', '128k', 
        '-ar', '44100', 
        '-f', 'flv', 
        rtmpUrl
    ]);

    streamStatus = "Live";
    addLog("Stream started.");

    ffmpegProcess.stderr.on('data', (data) => {
        const message = data.toString();
        const lowerMsg = message.toLowerCase();

        // Only record as "Last Error" if it's NOT the common MP3 warnings
        if (lowerMsg.includes("error") || lowerMsg.includes("warning")) {
            if (!lowerMsg.includes("overread") && !lowerMsg.includes("skip")) {
                lastError = message.substring(0, 100);
                addLog(`FFmpeg: ${message}`);
            }
        }
    });

    ffmpegProcess.on('close', (code) => {
        streamStatus = "Offline";
        addLog(`FFmpeg exited (${code}). Restarting...`);
        setTimeout(startStream, 5000);
    });
}

startStream();

// ==========================================
// 3. API ROUTES
// ==========================================
app.get('/api/status', (req, res) => {
    const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
    res.json({ 
        status: streamStatus, 
        error: lastError,
        uptime: formatUptime(totalSeconds), // Sends formatted string "00:00:26"
        logs: logs 
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(port, '0.0.0.0', () => {
    console.log(`Server on port ${port}`);
});
