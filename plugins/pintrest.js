'use strict';

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const TMP = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

const tmpFile = (name) => path.join(TMP, `pin_${Date.now()}_${name}`);
const cleanup = (...files) => { for (const f of files) try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} };

const PINTEREST_API = 'https://xeon-pin-api.onrender.com/pin';

const getCleanImages = (images) =>
  images.filter(url => /^https?:\/\/[^\s"')]+\.(jpg|jpeg|png|webp)/i.test(url));

module.exports = {
  command:  ['pin'],
  category: 'downloader',
  desc:     'Download Pinterest image or video from a URL',
  usage:    '.pin <pinterest_url>',

  async execute(sock, m, ctx) {
    const { text, reply } = ctx;
    const url = text?.trim();

    if (!url)
      return reply('_Please provide a Pinterest URL_\n_Example: .pin https://pinterest.com/..._');

    if (!/pinterest\.com|pin\.it/i.test(url))
      return reply('_That doesn\'t look like a valid Pinterest URL_');

    await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    let data;
    try {
      const res = await axios.get(PINTEREST_API, { params: { url }, timeout: 20000 });
      data = res.data;
    } catch {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return reply('_Failed to reach the Pinterest API. Please try again later_');
    }

    if (!data?.status) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return reply('_Could not fetch that Pinterest post. Make sure the link is valid and public_');
    }

    const hasVideo    = Array.isArray(data.videos) && data.videos.length > 0;
    const cleanImages = getCleanImages(data.images || []);

    if (!hasVideo && cleanImages.length === 0) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return reply('_No downloadable media found in that post_');
    }

    const caption = data.resolvedUrl ? `_Pinterest_ | ${data.resolvedUrl}` : '_Pinterest_';

    try {
      if (hasVideo) {
        const videoUrl  = data.videos[0];
        const videoPath = tmpFile('video.mp4');

        const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 30000 });
        fs.writeFileSync(videoPath, videoRes.data);

        await sock.sendMessage(m.chat, {
          video:   fs.readFileSync(videoPath),
          caption,
          mimetype: 'video/mp4'
        }, { quoted: m });

        cleanup(videoPath);
      } else {
        const imageUrl  = cleanImages[cleanImages.length - 1];
        const ext       = path.extname(imageUrl.split('?')[0]) || '.jpg';
        const imagePath = tmpFile(`image${ext}`);

        const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
        fs.writeFileSync(imagePath, imageRes.data);

        await sock.sendMessage(m.chat, {
          image:   fs.readFileSync(imagePath),
          caption,
          mimetype: 'image/jpeg'
        }, { quoted: m });

        cleanup(imagePath);
      }

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return reply('_Downloaded the info but failed to send the media. Try again_');
    }
  }
};