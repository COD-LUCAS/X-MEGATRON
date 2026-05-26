'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const PINTEREST_API = 'https://xeon-pin-api.onrender.com/pin';

const getTempPath = (filename) => path.join(TMP_DIR, `${Date.now()}_${filename}`);
const cleanTemp = (file) => {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
};

const getCleanImages = (images) => {
  if (!Array.isArray(images)) return [];
  return images.filter(url => /^https?:\/\/[^\s"')]+\.(jpg|jpeg|png|webp)/i.test(url));
};

module.exports = {
  command: ['pin', 'pinterest'],
  category: 'downloader',
  desc: 'Download Pinterest image or video from a URL',
  usage: '.pin <pinterest_url>',

  async execute(sock, m, context) {
    const { reply, args } = context;
    
    const url = args.join(' ').trim();
    
    if (!url) {
      return reply('_Please provide a Pinterest URL._\n\n_Usage: .pin <pinterest_url>_');
    }
    
    if (!/pinterest\.com|pin\.it/i.test(url)) {
      return reply('_That doesn\'t look like a valid Pinterest URL._');
    }
    
    // Send loading reaction
    await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
    
    let data;
    try {
      const response = await axios.get(PINTEREST_API, { params: { url }, timeout: 20000 });
      data = response.data;
    } catch (error) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      return reply('_Failed to reach the Pinterest API. Please try again later._');
    }
    
    if (!data?.status) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      return reply('_Could not fetch that Pinterest post. Make sure the link is valid and public._');
    }
    
    const hasVideo = Array.isArray(data.videos) && data.videos.length > 0;
    const cleanImages = getCleanImages(data.images);
    
    if (!hasVideo && cleanImages.length === 0) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      return reply('_No downloadable media found in that post._');
    }
    
    try {
      if (hasVideo) {
        const videoUrl = data.videos[0];
        const videoPath = getTempPath('pin_video.mp4');
        
        const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 30000 });
        fs.writeFileSync(videoPath, videoRes.data);
        
        await sock.sendMessage(m.chat, {
          video: fs.readFileSync(videoPath)
        }, { quoted: m });
        
        cleanTemp(videoPath);
      } else {
        const imageUrl = cleanImages[cleanImages.length - 1];
        const ext = path.extname(imageUrl.split('?')[0]) || '.jpg';
        const imagePath = getTempPath(`pin_image${ext}`);
        
        const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
        fs.writeFileSync(imagePath, imageRes.data);
        
        await sock.sendMessage(m.chat, {
          image: fs.readFileSync(imagePath)
        }, { quoted: m });
        
        cleanTemp(imagePath);
      }
      
      // Send success reaction
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
      
    } catch (error) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      return reply('_Downloaded but failed to send the media. Try again._');
    }
  }
};