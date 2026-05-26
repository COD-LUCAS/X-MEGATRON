'use strict';

const axios = require('axios');

module.exports = {
  command: ['pin', 'pinterest'],
  category: 'downloader',
  desc: 'Download Pinterest images/videos',
  usage: '.pin <pinterest_url>',

  async execute(sock, m, context) {
    const { reply, args } = context;
    
    let url = args.join('');
    
    if (!url) {
      return reply('_Please provide a Pinterest URL_\n\n_Example: .pin https://pin.it/1T5P5nBvl_');
    }
    
    try {
      const apiUrl = `https://xeon-pin-api.onrender.com/pin?url=${encodeURIComponent(url)}`;
      const response = await axios.get(apiUrl, { timeout: 30000 });
      const data = response.data;
      
      if (!data || data.status !== true) {
        return reply('_Failed to fetch Pinterest content_\n_Make sure the URL is valid_');
      }
      
      const images = data.images || [];
      const videos = data.videos || [];
      
      if (images.length === 0 && videos.length === 0) {
        return reply('_No media found in this pin_');
      }
      
      // Send images
      for (const img of images) {
        if (img && img.startsWith('http')) {
          await sock.sendMessage(m.chat, { image: { url: img }, caption: '_Pinterest Download_' }, { quoted: m });
        }
      }
      
      // Send videos
      for (const video of videos) {
        if (video && video.startsWith('http')) {
          await sock.sendMessage(m.chat, { video: { url: video }, caption: '_Pinterest Download_' }, { quoted: m });
        }
      }
      
      if (images.length === 0 && videos.length > 0) {
        // Already sent videos above
      } else if (images.length === 1 && videos.length === 0) {
        await reply('_Image sent above_');
      } else if (images.length > 1) {
        await reply(`_Sent ${images.length} images_`);
      }
      
    } catch (error) {
      console.error('Pinterest error:', error);
      return reply('_Failed to fetch Pinterest content_\n_Please try again later_');
    }
  }
};
