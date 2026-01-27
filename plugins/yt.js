const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = {
  command: ['yt', 'ytv', 'youtube', 'ytvideo'],
  category: 'downloader',
  description: 'Download YouTube videos',
  
  async execute(sock, m, { text, reply }) {
    if (!text) {
      return reply('_❌ Please provide a YouTube URL_\n\n_Example:_ `.yt https://youtube.com/watch?v=xxxxx`');
    }

    // Validate YouTube URL
    const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    if (!ytRegex.test(text)) {
      return reply('_❌ Invalid YouTube URL_');
    }

    const msg = await reply('_⏳ Fetching video info..._');

    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `yt_${timestamp}.mp4`);

    try {
      // Get video info and download link
      const apiUrl = `https://api-aswin-sparky.koyeb.app/api/downloader/ytv?url=${encodeURIComponent(text)}`;
      
      const response = await axios.get(apiUrl, { timeout: 40000 });

      if (!response.data || !response.data.status || !response.data.data) {
        throw new Error('Unable to fetch video');
      }

      const data = response.data.data;
      const title = data.title || 'YouTube Video';
      const videoUrl = data.url;
      const thumbnail = data.thumbnail || '';
      const duration = data.duration || '';
      const views = data.views || '';
      const channel = data.channel || '';

      if (!videoUrl) {
        throw new Error('No download link found');
      }

      await sock.sendMessage(m.chat, {
        text: `_📹 ${title}_\n\n_👤 Channel: ${channel}_\n_⏱️ Duration: ${duration}_\n_👁️ Views: ${views}_\n\n_⬇️ Downloading video..._`
      }, { quoted: m });

      // Download video
      const videoResponse = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        maxContentLength: 100 * 1024 * 1024, // 100MB
        timeout: 120000, // 2 minutes
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      fs.writeFileSync(outputPath, videoResponse.data);

      const fileSize = fs.statSync(outputPath).size;
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

      // Check file size
      if (fileSize < 100 * 1024) {
        fs.unlinkSync(outputPath);
        throw new Error('Downloaded file too small - possibly invalid');
      }

      if (fileSize > 100 * 1024 * 1024) {
        fs.unlinkSync(outputPath);
        return reply(`_❌ Video is too large (${fileSizeMB} MB)_\n_WhatsApp limit is 100 MB_\n\n_Try using .yta for audio only_`);
      }

      await sock.sendMessage(m.chat, {
        text: '_📤 Uploading video..._'
      }, { quoted: m });

      // Send video
      await sock.sendMessage(m.chat, {
        video: fs.readFileSync(outputPath),
        caption: `_✅ YouTube Video Downloaded_\n\n_🎬 ${title}_\n_👤 ${channel}_\n_📦 Size: ${fileSizeMB} MB_`,
        mimetype: 'video/mp4'
      }, { quoted: m });

      // Cleanup
      fs.unlinkSync(outputPath);

    } catch (error) {
      console.error('YouTube download error:', error);
      
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }

      let errorMsg = '_❌ Failed to download YouTube video_\n\n';
      
      if (error.message.includes('timeout')) {
        errorMsg += '_⏱️ Download timeout - Video too large or slow connection_';
      } else if (error.message.includes('Unable to fetch')) {
        errorMsg += '_🚫 Unable to fetch video info_';
      } else if (error.message.includes('No download link')) {
        errorMsg += '_🔗 No download link available_';
      } else if (error.message.includes('429')) {
        errorMsg += '_⚠️ Too many requests - Please try again later_';
      } else if (error.message.includes('403')) {
        errorMsg += '_🔒 Video is age-restricted or private_';
      } else {
        errorMsg += `_Error: ${error.message}_`;
      }

      return reply(errorMsg);
    }
  }
};