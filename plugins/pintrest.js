'use strict';

const axios = require('axios');

const PIN_API = process.env.XEON_PIN_API || 'https://xeon-pin-api.onrender.com';

module.exports = {
  command:  ['pin', 'pinterest'],
  category: 'downloader',
  desc:     'Download Pinterest images or videos',
  usage:    '.pin <pinterest_url>',

  async execute(sock, m, ctx) {
    const { args, reply } = ctx;

    if (!args[0]) return reply('_usage: .pin <pinterest_url>_');

    const url = args[0].trim();

    const wait = await sock.sendMessage(m.chat, { text: '_📌 downloading..._' }, { quoted: m });

    let data;
    try {
      const res = await axios.get(`${PIN_API}/pin`, { params: { url }, timeout: 30000 });
      data = res.data;
    } catch (e) {
      await sock.sendMessage(m.chat, { delete: wait.key }).catch(() => {});
      return reply(`_API error: ${e.message}_`);
    }

    await sock.sendMessage(m.chat, { delete: wait.key }).catch(() => {});

    if (!data?.success) return reply('_failed to fetch Pinterest media_');

    const videos = data.videos || [];
    const images = data.images || [];

    try {
      if (videos.length) {
        await sock.sendMessage(m.chat, { video: { url: videos[0] } }, { quoted: m });
        return;
      }

      if (images.length === 1) {
        await sock.sendMessage(m.chat, { image: { url: images[0] } }, { quoted: m });
        return;
      }

      if (images.length > 1) {
        for (const img of images.slice(0, 10)) {
          await sock.sendMessage(m.chat, { image: { url: img } }, { quoted: m });
        }
        return;
      }

      reply('_no media found_');

    } catch (e) {
      reply(`_send error: ${e.message}_`);
    }
  }
};