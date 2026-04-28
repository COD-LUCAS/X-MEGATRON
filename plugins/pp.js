const sharp = require('sharp');

const toPortrait = async (buf) => {
  return sharp(buf)
    .resize(720, 1080, {
      fit:        'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
      position:   'centre',
    })
    .jpeg({ quality: 95 })
    .toBuffer();
};

module.exports = {
  command: ['pp', 'gpp', 'setpp', 'setbotpp'],
  category: 'owner',
  desc: 'Set/get profile picture — full screen, no crop',
  usage: '.pp (reply image = set bot PP) | .pp (reply user msg = get their PP) | .gpp (reply image = set group icon)',
  owner: true,

  async execute(sock, m, context) {
    const { command, reply } = context;

    if (['pp', 'setpp', 'setbotpp'].includes(command)) {

      if (m.quoted?.mtype === 'imageMessage') {
        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
        const raw = await m.quoted.download();
        if (!raw || raw.length === 0) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('_Failed to download image_');
        }
        try {
          const buf    = await toPortrait(raw);
          const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          await sock.updateProfilePicture(botJid, buf);
          await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
          return reply('_Profile picture updated ✅ (full screen)_');
        } catch (e) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply(`_Failed: ${e.message}_`);
        }
      }

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
        `_Reply to an image → sets bot PP (full screen)_\n` +
        `_Reply to any message → gets that user's PP_`
      );
    }

    if (command === 'gpp') {
      if (!m.isGroup) return reply('_Groups only_');

      if (m.quoted?.mtype === 'imageMessage') {
        if (!context.isBotAdmin) return reply('_Make me admin first_');
        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
        const raw = await m.quoted.download();
        if (!raw || raw.length === 0) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('_Failed to download image_');
        }
        try {
          const buf = await toPortrait(raw);
          await sock.updateProfilePicture(m.chat, buf);
          await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
          return reply('_Group icon updated ✅ (full screen)_');
        } catch (e) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply(`_Failed: ${e.message}_`);
        }
      }

      await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
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