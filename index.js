const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 8000;
const startTime = Date.now();
let streamStatus = "Offline";
let ffmpegProcess = null;

// Function to send logs ONLY if they are useful
function broadcastLog(message, type = 'info') {
    const msg = message.trim();
    if (!msg) return;

    // STRICT FILTER: Ignore the "overread" and decoder spam
    const isSpam = msg.toLowerCase().includes("overread") || 
                   msg.toLowerCase().includes("skip -") ||
                   msg.toLowerCase().includes("last message repeated") ||
                   msg.toLowerCase().includes("mp3float");

    if (isSpam) return; // Do nothing if it's junk logs

    const logEntry = {
        time: new Date().toLocaleTimeString(),
        text: msg,
        type: type
    };

    console.log(`[${logEntry.time}] ${msg}`);
    io.emit('log-push', logEntry);
}

function startStream() {
    const streamKey = process.env.YOUTUBE_KEY;
    if (!streamKey) {
        broadcastLog("YOUTUBE_KEY is missing!", "error");
        return;
    }

    const mp3Dir = path.resolve(__dirname, 'mp3');
    const playlistPath = path.resolve(__dirname, 'playlist.txt');
    
    try {
        const files = fs.readdirSync(mp3Dir).filter(f => f.endsWith('.mp3'));
        if (files.length === 0) {
            broadcastLog("No MP3 files found in /mp3 folder.", "warn");
            setTimeout(startStream, 10000);
            return;
        }
        const listContent = files.map(f => `file '${path.join(mp3Dir, f).replace(/\\/g, '/')}'`).join('\n');
        fs.writeFileSync(playlistPath, listContent);
    } catch (err) {
        broadcastLog(`Setup Error: ${err.message}`, "error");
        return;
    }

    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    // Added -loglevel error to reduce noise at the source
    ffmpegProcess = spawn('ffmpeg', [
        '-loglevel', 'info', // Changed from repeat+info to info
        '-re',
        '-f', 'concat', 
        '-safe', '0', 
        '-stream_loop', '-1', 
        '-i', playlistPath, 
        '-f', 'lavfi', 
        '-i', 'color=c=black:s=854x480:r=24', 
        '-vf', "drawtext=text='LIVE RADIO STREAM':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2",
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '48', '-vb', '1000k',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-af', 'aresample=async=1', 
        '-f', 'flv', 
        rtmpUrl
    ]);

    streamStatus = "Live";
    broadcastLog(">>> Stream is now LIVE on YouTube", "success");

    ffmpegProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            // Ignore the frame/fps status lines to keep log clean
            if (line.includes("frame=") || line.includes("fps=")) return;
            
            if (line.toLowerCase().includes("error")) {
                broadcastLog(line, "error");
            } else if (line.trim().length > 0) {
                broadcastLog(line, "info");
            }
        });
    });

    ffmpegProcess.on('close', (code) => {
        streamStatus = "Offline";
        broadcastLog(`FFmpeg stopped (Code: ${code}). Restarting in 5s...`, "warn");
        setTimeout(startStream, 5000);
    });
}

startStream();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/status', (req, res) => {
    res.json({ status: streamStatus, uptime: Math.floor((Date.now() - startTime) / 1000) });
});

server.listen(port, '0.0.0.0', () => {
    broadcastLog(`Monitor Server active on port ${port}`, "success");
});
