const axios = require('axios');

const BING_URL = 'https://www.bing.com/images/search';

// Extract image URLs from Bing HTML
function extractImages(html) {
  const regex = /murl&quot;:&quot;(https?:\/\/[^&]+)&quot;/g;
  const matches = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    matches.push(match[1]);
  }

  return matches;
}

module.exports = {
  command: ['img', 'image'],
  category: 'downloader',
  desc: 'Search and download real photos from Bing',
  usage: '.img <query> | .img <query> <count>',

  async execute(sock, m, context) {
    const { args, reply } = context;

    if (!args.length) {
      return reply('_Usage:_\n_.img cat_\n_.img cat 5_');
    }

    let count = 5;
    let query = args.join(' ');

    // Check if last arg is a number
    if (!isNaN(args[args.length - 1])) {
      count = Math.min(Math.max(parseInt(args[args.length - 1]), 1), 8);
      query = args.slice(0, -1).join(' ');
    }

    if (!query) {
      return reply('_Please provide a search query_');
    }

    await reply('_🔍 Searching real photos only..._');
    await sock.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });

    try {
      // Clean query to exclude cartoons/anime/illustrations
      const cleanQuery = `${query} -cartoon -anime -illustration -drawing -art -vector -clipart`;

      const params = {
        q: cleanQuery,
        form: 'HDRSC2',
        first: '1',
        qft: '+filterui:photo-photo'
      };

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      };

      const { data: html } = await axios.get(BING_URL, {
        params,
        headers,
        timeout: 15000
      });

      const images = extractImages(html);
      const results = images.slice(0, count);

      if (!results || results.length === 0) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_No real photos found_');
      }

      let successCount = 0;

      for (let i = 0; i < results.length; i++) {
        try {
          await sock.sendMessage(
            m.chat,
            {
              image: { url: results[i] },
              caption: `_${i + 1}/${results.length}_`
            },
            { quoted: m }
          );

          successCount++;

          // Delay between sends
          if (i < results.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        } catch (e) {
          console.log(`Failed to send image ${i + 1}:`, e.message);
          continue;
        }
      }

      if (successCount === 0) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_Failed to send images_');
      }

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
      console.error('Image search error:', error.message);
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return reply(`_❌ Error while fetching images:_\n\`${error.message}\``);
    }
  }
};
