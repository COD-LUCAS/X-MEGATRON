'use strict';

const { facebookdl } = require('@bochilteam/scraper-facebook');
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
  command: ['fb'],
  category: 'downloader',
  desc: 'Download Facebook videos',
  usage: '.fb <Facebook URL>',

  async execute(sock, m, context) {
    const { reply, args, react } = context;
    
    // Check if message has already been processed
    if (processedMessages.has(m.key.id)) {
      return;
    }
    
    // Add message ID to processed set
    processedMessages.add(m.key.id);
    
    // Clean up old message IDs after 5 minutes
    setTimeout(() => {
      processedMessages.delete(m.key.id);
    }, 5 * 60 * 1000);
    
    const url = args.join(' ').trim();
    
    if (!url) {
      return reply('_Please provide a Facebook link_\n\n_Example: .fb https://www.facebook.com/watch/?v=123456789_');
    }
    
    // Check for various Facebook URL formats
    const facebookPatterns = [
      /https?:\/\/(?:www\.|m\.)?facebook\.com\//,
      /https?:\/\/(?:www\.|m\.)?fb\.com\//,
      /https?:\/\/fb\.watch\//,
      /https?:\/\/(?:www\.)?facebook\.com\/watch/,
      /https?:\/\/(?:www\.)?facebook\.com\/.*\/videos\//
    ];
    
    const isValidUrl = facebookPatterns.some(pattern => pattern.test(url));
    
    if (!isValidUrl) {
      return reply('_Invalid Facebook link_\n_Please provide a valid Facebook video link._');
    }
    
    await react('⏳');
    
    try {
      // Use @bochilteam/scraper-facebook
      const data = await facebookdl(url);
      
      if (!data || !data.video || !Array.isArray(data.video) || data.video.length === 0) {
        throw new Error('No video data found');
      }
      
      // Get the highest quality video
      const videoOption = data.video[0];
      if (!videoOption || !videoOption.url) {
        throw new Error('No video download URL found');
      }
      
      const videoUrl = videoOption.url;
      const quality = videoOption.quality || 'HD';
      
      await react('⬇️');
      
      // Download video
      const videoPath = getTempPath('fb_video.mp4');
      const videoRes = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: 200 * 1024 * 1024,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.facebook.com/'
        }
      });
      
      fs.writeFileSync(videoPath, videoRes.data);
      
      // Send video
      await sock.sendMessage(m.chat, {
        video: fs.readFileSync(videoPath),
        mimetype: 'video/mp4',
        caption: `_Facebook Video_\n_Quality: ${quality}_`
      }, { quoted: m });
      
      cleanTemp(videoPath);
      await react('✅');
      
    } catch (error) {
      console.error('Facebook download error:', error);
      await react('❌');
      
      if (error.message.includes('No video data')) {
        return reply('_Could not find video in that link_\n_Make sure the link is public and contains a video._');
      }
      
      return reply(`_Failed to download Facebook video_\n_Error: ${error.message}_`);
    }
  }
};