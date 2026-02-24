FROM node:18-slim

# Install FFmpeg inside the container
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install

# Copy the rest of your files (including your video.mp4)
COPY . .

# Match the port in index.js
EXPOSE 8080

CMD ["npm", "start"]
