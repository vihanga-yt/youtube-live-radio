const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http'); // Used for the self-ping
const app = express();
const port = process.env.PORT || 8000;

let streamStatus = "Offline";
let lastError = "None";
let ffmpegProcess = null;

// ==========================================
// 1. ANTI-CRASH LOGIC (Crucial for 24/7 uptime)
// ==========================================
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Uncaught Exception):', err);
    lastError = err.message;
    // We don't exit the process; we let it keep running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
    lastError = String(reason);
});

// ==========================================
// 2. STREAMING LOGIC
// ==========================================
function startStream() {
    const streamKey = process.env.YOUTUBE_KEY;
    
    if (!streamKey) {
        lastError = "ERROR: YOUTUBE_KEY environment variable is missing!";
        console.error(lastError);
        return;
    }

    const mp3Dir = path.resolve(__dirname, 'mp3');
    const playlistPath = path.resolve(__dirname, 'playlist.txt');
    
    try {
        if (!fs.existsSync(mp3Dir)) {
            fs.mkdirSync(mp3Dir); // Create folder if it doesn't exist to prevent crashes
        }

        const files = fs.readdirSync(mp3Dir).filter(f => f.endsWith('.mp3'));
        if (files.length === 0) {
            console.error("WARNING: No MP3 files found in the 'mp3' directory. Waiting to start...");
            setTimeout(startStream, 10000); // Check again in 10 seconds
            return;
        }
        
        const listContent = files.map(f => {
            const safePath = path.join(mp3Dir, f).replace(/\\/g, '/');
            return `file '${safePath}'`;
        }).join('\n');
        
        fs.writeFileSync(playlistPath, listContent);
    } catch (err) {
        console.error("ERROR reading mp3 directory:", err);
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
    console.log("Stream started successfully!");

    ffmpegProcess.stderr.on('data', (data) => {
        const message = data.toString();
        if (message.toLowerCase().includes("error") || message.toLowerCase().includes("warning")) {
            console.error(`FFmpeg Log: ${message}`);
            lastError = message;
        }
    });

    ffmpegProcess.on('close', (code) => {
        streamStatus = "Offline";
        console.log(`FFmpeg exited with code ${code}. Auto-restarting in 5 seconds...`);
        ffmpegProcess = null;
        setTimeout(startStream, 5000); // 24/7 Loop
    });
}

startStream();

// ==========================================
// 3. KOYEB HEALTH & WEB ROUTES
// ==========================================

// This is the specific route Koyeb needs to verify your app isn't dead
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/api/status', (req, res) => {
    res.json({ status: streamStatus, error: lastError });
});

app.get('/', (req, res) => {
    // Failsafe if index.html is missing
    if (fs.existsSync(path.join(__dirname, 'index.html'))) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        res.send(`<h1>Stream Status: ${streamStatus}</h1><p>Last Error: ${lastError}</p>`);
    }
});

// ==========================================
// 4. SELF-PINGER (Keeps network active)
// ==========================================
function keepAlive() {
    // If you add a custom domain in Koyeb later, replace this URL
    const url = `https://alleged-venita-estedtgz-fa534a79.koyeb.app/health`; 
    setInterval(() => {
        http.get(url, (res) => {
            console.log(`[Keep-Alive] Pinged self, status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('[Keep-Alive] Ping failed:', err.message);
        });
    }, 5 * 60 * 1000); // Pings every 5 minutes
}

app.listen(port, '0.0.0.0', () => { // 0.0.0.0 is strictly required by Koyeb
    console.log(`Server running on port ${port}`);
    keepAlive();
});

// Clean up on exit
process.on('SIGTERM', () => { // Koyeb uses SIGTERM to stop containers
    if (ffmpegProcess) ffmpegProcess.kill('SIGTERM');
    process.exit();
});
