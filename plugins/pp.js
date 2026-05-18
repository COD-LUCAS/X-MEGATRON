'use strict';

// Full screen PP using raw WhatsApp IQ stanza (same method as Sparky/Asena bots)
// sock.query() sends directly to WhatsApp — bypasses Baileys' square crop entirely

const generatePP = async (buffer) => {
  const { Jimp } = require('jimp');
  const jimp     = await Jimp.fromBuffer(buffer);
  jimp.crop({ x: 0, y: 0, w: jimp.bitmap.width, h: jimp.bitmap.height });
  jimp.scaleToFit({ w: 324, h: 720 });
  const img     = await jimp.getBuffer('image/jpeg');
  jimp.normalize();
  const preview = await jimp.getBuffer('image/jpeg');
  return { img, preview };
};

const updateFullPP = async (sock, jid, buffer) => {
  const { img } = await generatePP(buffer);
  // Raw IQ stanza — exactly like Sparky's updatefullpp
  // sock.query = sock.ws.query in @whiskeysockets/baileys
  await sock.query({
    tag:   'iq',
    attrs: { to: jid, type: 'set', xmlns: 'w:profile:picture' },
    content: [{
      tag:     'picture',
      attrs:   { type: 'image' },
      content: img,
    }],
  });
};

module.exports = {
  command: ['pp', 'gpp', 'setpp', 'setbotpp'],
  category: 'owner',
  desc: 'Set/get profile picture — full screen no crop',
  usage: '.pp (reply image = set bot PP) | .pp (reply msg = get user PP) | .gpp (group icon)',
  owner: true,

  async execute(sock, m, context) {
    const { command, reply } = context;

    // ── .PP / .SETPP / .SETBOTPP ─────────────────────────────
    if (['pp', 'setpp', 'setbotpp'].includes(command)) {

      // Set bot PP — reply to image
      if (m.quoted?.mtype === 'imageMessage') {
        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
        const raw = await m.quoted.download();
        if (!raw?.length) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('_Failed to download image_');
        }
        try {
          const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          await updateFullPP(sock, botJid, raw);
          await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
          return reply('_Bot DP updated ✅ (full screen)_');
        } catch (e) {
          // Fallback to standard updateProfilePicture if query not available
          try {
            const { Jimp } = require('jimp');
            const jimp = await Jimp.fromBuffer(raw);
            jimp.scaleToFit({ w: 324, h: 720 });
            const buf    = await jimp.getBuffer('image/jpeg');
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            await sock.updateProfilePicture(botJid, buf);
            await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            return reply('_Bot DP updated ✅_');
          } catch (e2) {
            await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply(`_Failed: ${e2.message}_`);
          }
        }
      }

      // Get user PP — reply to any message
      if (m.quoted) {
        const targetJid = m.quoted.sender;
        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
        try {
          const url = await sock.profilePictureUrl(targetJid, 'image');
          await sock.sendMessage(m.chat, {
            image:    { url },
            caption:  `_@${targetJid.split('@')[0]}_`,
            mentions: [targetJid],
          }, { quoted: m });
          await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        } catch (_) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('_Profile picture not found or hidden_');
        }
        return;
      }

      return reply(
        `_Reply to image → set bot DP (full screen)_\n` +
        `_Reply to any message → get that user's DP_`
      );
    }

    // ── .GPP ─────────────────────────────────────────────────
    if (command === 'gpp') {
      if (!m.isGroup) return reply('_Groups only_');

      // Set group icon
      if (m.quoted?.mtype === 'imageMessage') {
        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
        const raw = await m.quoted.download();
        if (!raw?.length) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('_Failed to download image_');
        }
        try {
          await updateFullPP(sock, m.chat, raw);
          await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
          return reply('_Group icon updated ✅ (full screen)_');
        } catch (e) {
          try {
            const { Jimp } = require('jimp');
            const jimp = await Jimp.fromBuffer(raw);
            jimp.scaleToFit({ w: 324, h: 720 });
            const buf = await jimp.getBuffer('image/jpeg');
            await sock.updateProfilePicture(m.chat, buf);
            await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            return reply('_Group icon updated ✅_');
          } catch (e2) {
            await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply(`_Failed: ${e2.message}_`);
          }
        }
      }

      // Get group icon
      try {
        const url = await sock.profilePictureUrl(m.chat, 'image');
        await sock.sendMessage(m.chat, { image: { url } }, { quoted: m });
        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      } catch (_) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_Group icon not found_');
      }
    }
  },
};