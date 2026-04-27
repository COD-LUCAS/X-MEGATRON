/**
 * pp.js
 * .pp  — set bot PP or get user PP (full size, no autocrop)
 * .gpp — set group icon or get group icon (full size)
 *
 * Full-size trick: WhatsApp crops to square when you send a raw buffer.
 * To prevent cropping, send as a "sticker" format (WebP 512x512) — but for PP
 * the real trick is to use updateProfilePicture with the raw JPEG buffer directly
 * and set it as { img: buffer } not { url: ... }. Baileys handles the resize.
 * For GETTING pp: use 'image' not 'preview' — preview is low-res thumbnail.
 */

module.exports = {
  command: ['pp', 'gpp'],
  category: 'owner',
  desc: 'Set/get bot or group profile picture (full size)',
  usage: '.pp (reply image = set bot PP) | .pp (reply user = get their PP) | .gpp (reply image = set group icon)',
  owner: true,

  async execute(sock, m, context) {
    const { command, reply } = context;

    // ── .PP ──────────────────────────────────────────────────────
    if (command === 'pp') {

      // Set bot PP — reply to an image
      if (m.quoted?.mtype === 'imageMessage') {
        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });

        const buf = await m.quoted.download();
        if (!buf || buf.length === 0) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('_Failed to download image_');
        }

        try {
          const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          // Pass buffer directly — Baileys handles JPEG resize internally
          // This preserves aspect ratio better than sending via URL
          await sock.updateProfilePicture(botJid, buf);
          await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
          return reply('_Bot profile picture updated ✅_');
        } catch (e) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('_Failed — check if bot number has permission_');
        }
      }

      // Get user PP — reply to any message from that user
      if (m.quoted) {
        const targetJid = m.quoted.sender;
        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });

        try {
          // 'image' = full size original, 'preview' = low-res thumbnail
          const ppUrl = await sock.profilePictureUrl(targetJid, 'image');
          await sock.sendMessage(m.chat, {
            image:    { url: ppUrl },
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
        `_Usage:_\n` +
        `  _Reply to an image → sets bot PP_\n` +
        `  _Reply to any message → gets that user's PP_`
      );
    }

    // ── .GPP ─────────────────────────────────────────────────────
    if (command === 'gpp') {
      if (!m.isGroup) return reply('_Groups only_');

      // Set group icon — reply to image
      if (m.quoted?.mtype === 'imageMessage') {
        if (!context.isBotAdmin) return reply('_Make me admin first_');

        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });

        const buf = await m.quoted.download();
        if (!buf || buf.length === 0) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('_Failed to download image_');
        }

        try {
          await sock.updateProfilePicture(m.chat, buf);
          await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
          return reply('_Group icon updated ✅_');
        } catch (e) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('_Failed to update group icon_');
        }
      }

      // Get group icon
      await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
      try {
        const ppUrl = await sock.profilePictureUrl(m.chat, 'image');
        await sock.sendMessage(m.chat, {
          image: { url: ppUrl },
        }, { quoted: m });
        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      } catch (_) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_Group icon not found_');
      }
    }
  },
};
