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

function broadcastLog(message, type = 'info') {
    const msg = message.trim();
    if (!msg) return;

    // Filter out FFmpeg startup headers and repetitive noise
    const ignoredPatterns = [
        "libavutil", "libavcodec", "libavformat", "libavdevice", 
        "libavfilter", "libswscale", "libswresample", "libpostproc",
        "metadata", "encoder", "duration", "bitrate", "mapped", 
        "press [q] to stop", "using /usr/share/fonts", "cpb:", "frame=",
        "overread", "skip -", "last message repeated", "mp3float"
    ];

    const isSpam = ignoredPatterns.some(p => msg.toLowerCase().includes(p));
    if (isSpam) return;

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
            broadcastLog("No MP3 files found in /mp3.", "warn");
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

    // FFmpeg arguments fixed for proper mapping and clean output
    ffmpegProcess = spawn('ffmpeg', [
        '-hide_banner',           // Hides the library versions in logs
        '-re',                    // Read input in real time
        '-f', 'concat', 
        '-safe', '0', 
        '-i', playlistPath,       // Input 0 (Audio)
        '-f', 'lavfi', 
        '-i', 'color=c=black:s=854x480:r=24', // Input 1 (Video)
        
        '-filter_complex', "[1:v]drawtext=text='LIVE RADIO':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2[outv]",
        
        '-map', '[outv]',         // Force video from the color input
        '-map', '0:a',            // Force audio from the playlist
        
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '48', '-vb', '1000k',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-af', 'aresample=async=1', 
        '-f', 'flv', 
        rtmpUrl
    ]);

    streamStatus = "Live";
    broadcastLog(">>> STREAM CONNECTED TO YOUTUBE", "success");

    ffmpegProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.toLowerCase().includes("error")) {
                broadcastLog(line, "error");
            } else {
                broadcastLog(line, "info");
            }
        });
    });

    ffmpegProcess.on('close', (code) => {
        streamStatus = "Offline";
        broadcastLog(`FFmpeg stopped (Code: ${code}). Reconnecting...`, "warn");
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
    broadcastLog(`Monitor dashboard active on port ${port}`, "success");
});
