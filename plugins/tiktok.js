'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const getTempPath = (filename) => path.join(TMP_DIR, `${Date.now()}_${filename}`);
const cleanTemp = (file) => {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
};

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

module.exports = {
  command: ['tt', 'tiktok'],
  category: 'downloader',
  desc: 'Download TikTok videos',
  usage: '.tt <TikTok URL>',

  async execute(sock, m, context) {
    const { reply, args } = context;

    // Check if message has already been processed
    if (processedMessages.has(m.key.id)) {
      return;
    }

    processedMessages.add(m.key.id);
    setTimeout(() => {
      processedMessages.delete(m.key.id);
    }, 5 * 60 * 1000);

    const url = args.join(' ').trim();

    if (!url) {
      return reply('_Please provide a TikTok link_\n\n_Example: .tt https://www.tiktok.com/@username/video/123456789_');
    }

    // Check for TikTok URL
    if (!/tiktok\.com/i.test(url)) {
      return reply('_Invalid TikTok link_');
    }

    try {
      // Use working TikTok API
      const apiUrl = `https://tikdownloader-api.vercel.app/api/download?url=${encodeURIComponent(url)}`;
      const response = await axios.get(apiUrl, { timeout: 20000 });
      const data = response.data;

      const videoUrl = data?.video_url || data?.data?.play;

      if (!videoUrl) {
        throw new Error('No video found');
      }

      // Download video
      const videoPath = getTempPath('tt_video.mp4');
      const videoRes = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      fs.writeFileSync(videoPath, videoRes.data);

      // Send video
      await sock.sendMessage(m.chat, {
        video: fs.readFileSync(videoPath),
        mimetype: 'video/mp4'
      }, { quoted: m });

      cleanTemp(videoPath);

    } catch (error) {
      console.error('TikTok error:', error);
      
      // Try alternative API
      try {
        const altApi = `https://api.ryzendesu.vip/api/download/tiktok?url=${encodeURIComponent(url)}`;
        const altRes = await axios.get(altApi, { timeout: 20000 });
        
        if (altRes.data && altRes.data.url) {
          const videoPath = getTempPath('tt_video.mp4');
          const videoRes = await axios.get(altRes.data.url, { responseType: 'arraybuffer', timeout: 60000 });
          fs.writeFileSync(videoPath, videoRes.data);
          
          await sock.sendMessage(m.chat, {
            video: fs.readFileSync(videoPath),
            mimetype: 'video/mp4'
          }, { quoted: m });
          
          cleanTemp(videoPath);
          return;
        }
      } catch (altError) {
        console.error('Alternative API failed:', altError.message);
      }
      
      return reply('_Failed to download TikTok video_\n_Please try again._');
    }
  }
};