const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = {
  command: ['yta', 'ytaudio', 'ytmp3', 'song'],
  category: 'downloader',
  description: 'Download YouTube audio/MP3',
  
  async execute(sock, m, { text, reply }) {
    if (!text) {
      return reply('_❌ Please provide a YouTube URL_\n\n_Example:_ `.yta https://youtube.com/watch?v=xxxxx`');
    }

    // Validate YouTube URL
    const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    if (!ytRegex.test(text)) {
      return reply('_❌ Invalid YouTube URL_');
    }

    await reply('_⏳ Fetching audio info..._');

    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `yt_audio_${timestamp}.mp3`);

    try {
      // Get audio info and download link
      const apiUrl = `https://api-aswin-sparky.koyeb.app/api/downloader/yta?url=${encodeURIComponent(text)}`;
      
      const response = await axios.get(apiUrl, { timeout: 40000 });

      if (!response.data || !response.data.status || !response.data.data) {
        throw new Error('Unable to fetch audio');
      }

      const data = response.data.data;
      const title = data.title || 'YouTube Audio';
      const audioUrl = data.url;
      const thumbnail = data.thumbnail || '';
      const duration = data.duration || '';
      const channel = data.channel || '';

      if (!audioUrl) {
        throw new Error('No download link found');
      }

      await sock.sendMessage(m.chat, {
        text: `_🎵 ${title}_\n\n_👤 Channel: ${channel}_\n_⏱️ Duration: ${duration}_\n\n_⬇️ Downloading audio..._`
      }, { quoted: m });

      // Download audio
      const audioResponse = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        maxContentLength: 50 * 1024 * 1024, // 50MB for audio
        timeout: 120000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      fs.writeFileSync(outputPath, audioResponse.data);

      const fileSize = fs.statSync(outputPath).size;
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

      if (fileSize < 50 * 1024) {
        fs.unlinkSync(outputPath);
        throw new Error('Downloaded file too small - possibly invalid');
      }

      if (fileSize > 50 * 1024 * 1024) {
        fs.unlinkSync(outputPath);
        return reply(`_❌ Audio is too large (${fileSizeMB} MB)_\n_WhatsApp limit is 50 MB for audio_`);
      }

      await sock.sendMessage(m.chat, {
        text: '_📤 Uploading audio..._'
      }, { quoted: m });

      // Send audio
      await sock.sendMessage(m.chat, {
        audio: fs.readFileSync(outputPath),
        mimetype: 'audio/mpeg',
        ptt: false,
        contextInfo: {
          externalAdReply: {
            title: title,
            body: channel,
            thumbnail: thumbnail ? await axios.get(thumbnail, { responseType: 'arraybuffer' }).then(r => r.data).catch(() => null) : null,
            mediaType: 2,
            mediaUrl: text,
            sourceUrl: text
          }
        }
      }, { quoted: m });

      // Also send as document for better quality
      await sock.sendMessage(m.chat, {
        document: fs.readFileSync(outputPath),
        mimetype: 'audio/mpeg',
        fileName: `${title}.mp3`,
        caption: `_✅ YouTube Audio Downloaded_\n\n_🎵 ${title}_\n_👤 ${channel}_\n_📦 Size: ${fileSizeMB} MB_`
      }, { quoted: m });

      // Cleanup
      fs.unlinkSync(outputPath);

    } catch (error) {
      console.error('YouTube audio download error:', error);
      
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }

      let errorMsg = '_❌ Failed to download YouTube audio_\n\n';
      
      if (error.message.includes('timeout')) {
        errorMsg += '_⏱️ Download timeout - Audio too large or slow connection_';
      } else if (error.message.includes('Unable to fetch')) {
        errorMsg += '_🚫 Unable to fetch audio info_';
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