'use strict';

const axios = require('axios');

const API_BASE = 'https://xeon-api.koyeb.app';

const react = (sock, m, emoji) =>
  sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {});

function getUrl(args, m) {
  // Priority: arg url → quoted message text
  if (args[0]) return args[0].trim();
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted) {
    return (
      quoted.conversation?.trim() ||
      quoted.extendedTextMessage?.text?.trim() ||
      ''
    );
  }
  return '';
}

module.exports = {
  command:  ['insta', 'pin', 'pinterest', 'fb', 'facebook'],
  category: 'downloader',
  desc:     'Download media from Instagram, Pinterest, Facebook',
  usage:    '.insta <url>  or  reply to a URL with .insta',

  async execute(sock, m, ctx) {
    const { command, args, reply } = ctx;

    const url = getUrl(args, m);
    if (!url) return reply(`_usage: .${command} <url>  or reply to a message containing the URL_`);

    await react(sock, m, '⏳');

    try {

      // ── INSTAGRAM ──────────────────────────────────────────────
      if (command === 'insta') {
        const { data } = await axios.get(`${API_BASE}/insta`, { params: { url }, timeout: 30000 });

        if (!data?.success && !data?.status) {
          await react(sock, m, '❌');
          return reply(`_${data?.error || 'failed to fetch Instagram media'}_`);
        }

        const isVideo = data.type === 'video';
        await sock.sendMessage(
          m.chat,
          isVideo ? { video: { url: data.media } } : { image: { url: data.media } },
          { quoted: m }
        );
        await react(sock, m, '✅');
      }

      // ── PINTEREST ──────────────────────────────────────────────
      else if (command === 'pin' || command === 'pinterest') {
        const { data } = await axios.get(`${API_BASE}/pin`, { params: { url }, timeout: 30000 });

        if (!data?.success && !data?.status) {
          await react(sock, m, '❌');
          return reply('_failed to fetch Pinterest media_');
        }

        const videos = data.videos || [];
        const images = data.images || [];

        if (videos.length) {
          await sock.sendMessage(m.chat, { video: { url: videos[0] } }, { quoted: m });
        } else if (images.length) {
          await sock.sendMessage(m.chat, { image: { url: images[0] } }, { quoted: m });
        } else {
          await react(sock, m, '❌');
          return reply('_no media found in that Pinterest link_');
        }
        await react(sock, m, '✅');
      }

      // ── FACEBOOK ───────────────────────────────────────────────
      else if (command === 'fb' || command === 'facebook') {
        const { data } = await axios.get(`${API_BASE}/fb`, { params: { url }, timeout: 60000 });

        if (!data?.success && !data?.status) {
          await react(sock, m, '❌');
          return reply('_failed to fetch Facebook video_');
        }

        const videoUrl =
          data?.videos?.hd?.url ||
          data?.videos?.sd?.url ||
          null;

        if (!videoUrl) {
          await react(sock, m, '❌');
          return reply('_no downloadable video found_');
        }

        await sock.sendMessage(m.chat, { video: { url: videoUrl } }, { quoted: m });
        await react(sock, m, '✅');
      }

    } catch (e) {
      await react(sock, m, '❌');
      reply(`_error: ${e.message}_`);
    }
  }
};
