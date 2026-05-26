'use strict';

const { ttdl } = require('ruhend-scraper');
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

// TikTok API
const TIKTOK_API = 'https://tikdownloader-api.vercel.app/api/download';

module.exports = {
  command: ['tiktok'],
  category: 'downloader',
  desc: 'Download TikTok videos',
  usage: '.tt <TikTok URL>',

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
      return reply('_Please provide a TikTok link_\n\n_Example: .tt https://www.tiktok.com/@username/video/123456789_');
    }
    
    // Check for TikTok URL formats
    const tiktokPatterns = [
      /https?:\/\/(?:www\.)?tiktok\.com\//,
      /https?:\/\/(?:vm\.)?tiktok\.com\//,
      /https?:\/\/(?:vt\.)?tiktok\.com\//,
      /https?:\/\/(?:www\.)?tiktok\.com\/@/,
      /https?:\/\/(?:www\.)?tiktok\.com\/t\//
    ];
    
    const isValidUrl = tiktokPatterns.some(pattern => pattern.test(url));
    
    if (!isValidUrl) {
      return reply('_Invalid TikTok link_\n_Please provide a valid TikTok video link._');
    }
    
    await react('⏳');
    
    try {
      // Try API first
      let videoUrl = null;
      let title = null;
      
      try {
        const apiRes = await axios.get(TIKTOK_API, {
          params: { url: url },
          timeout: 15000
        });
        
        if (apiRes.data && apiRes.data.status === 'success') {
          videoUrl = apiRes.data.video_url || apiRes.data.data?.play;
          title = apiRes.data.title || apiRes.data.data?.title;
        }
      } catch (apiError) {
        console.error('TikTok API failed:', apiError.message);
      }
      
      // If API failed, try ruhend-scraper
      if (!videoUrl) {
        try {
          const downloadData = await ttdl(url);
          
          if (downloadData && downloadData.data && downloadData.data.length > 0) {
            for (const media of downloadData.data) {
              const mediaUrl = media.url;
              const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || media.type === 'video';
              
              if (isVideo) {
                videoUrl = mediaUrl;
                break;
              }
            }
          }
        } catch (ttdlError) {
          console.error('ttdl error:', ttdlError.message);
        }
      }
      
      if (!videoUrl) {
        await react('❌');
        return reply('_Could not find video in that link_\n_Make sure the link is valid and public._');
      }
      
      await react('⬇️');
      
      // Download video
      const videoPath = getTempPath('tt_video.mp4');
      const videoRes = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.tiktok.com/'
        }
      });
      
      fs.writeFileSync(videoPath, videoRes.data);
      
      // Send video
      const caption = title ? `_TikTok Video_\n_${title}_` : '_TikTok Video_';
      
      await sock.sendMessage(m.chat, {
        video: fs.readFileSync(videoPath),
        mimetype: 'video/mp4',
        caption: caption
      }, { quoted: m });
      
      cleanTemp(videoPath);
      await react('✅');
      
    } catch (error) {
      console.error('TikTok download error:', error);
      await react('❌');
      return reply('_Failed to download TikTok video_\n_Please try again with a different link._');
    }
  }
};