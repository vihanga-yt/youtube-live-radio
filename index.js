const express = require('express');
const { spawn } = require('child_process');
const app = express();
const port = process.env.PORT || 8080;

// 1. DUMMY WEB SERVER (Required for Koyeb Free Tier)
app.get('/', (req, res) => {
  res.send('Stream is active! Use UptimeRobot to ping this URL every 5 mins.');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// 2. FFmpeg STREAM LOGIC
const streamKey = process.env.YOUTUBE_KEY;
const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

// Change 'video.mp4' to your filename. Use -stream_loop -1 to loop forever.
const ffmpeg = spawn('ffmpeg', [
  '-re',
  '-stream_loop', '-1',
  '-i', 'video.mp4', 
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-b:v', '1000k', // Keep bitrate low for the Nano instance
  '-maxrate', '1000k',
  '-bufsize', '2000k',
  '-pix_fmt', 'yuv420p',
  '-g', '50',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-ar', '44100',
  '-f', 'flv',
  rtmpUrl
]);

ffmpeg.stderr.on('data', (data) => {
  console.log(`FFmpeg: ${data}`);
});

ffmpeg.on('close', (code) => {
  console.log(`FFmpeg process exited with code ${code}`);
});
