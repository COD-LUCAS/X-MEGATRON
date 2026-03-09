module.exports = {
  command: ['pp', 'gpp'],
  category: 'owner',
  desc: 'Change/Get profile picture or group icon (full HD)',
  usage: '.pp (reply to image) or .pp (reply to user) / .gpp (reply to image)',
  owner: true,

  async execute(sock, m, context) {
    const { command } = context;

    if (command === 'pp') {
      if (m.quoted && m.quoted.mtype === 'imageMessage') {
        const image = await m.quoted.download();
        const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        try {
          await sock.updateProfilePicture(botJid, image);
          return m.reply('_Profile picture updated ✅_');
        } catch (e) {
          return m.reply('_Failed to update profile picture_');
        }
      }

      if (m.quoted) {
        const targetJid = m.quoted.sender;

        try {
          const ppUrl = await sock.profilePictureUrl(targetJid, 'preview');
          return sock.sendMessage(m.chat, {
            image: { url: ppUrl },
            caption: `_@${targetJid.split('@')[0]}_`,
            mentions: [targetJid]
          }, { quoted: m });
        } catch (e) {
          return m.reply('_Profile picture not found_');
        }
      }

      return m.reply('_Reply to image to set PP or reply to user to get their PP_');
    }

    if (command === 'gpp') {
      if (!m.isGroup) {
        return m.reply('_This command is for groups only_');
      }

      if (m.quoted && m.quoted.mtype === 'imageMessage') {
        if (!context.isBotAdmin) {
          return m.reply('_Bot must be admin_');
        }

        const image = await m.quoted.download();

        try {
          await sock.updateProfilePicture(m.chat, image);
          return m.reply('_Group icon updated ✅_');
        } catch (e) {
          return m.reply('_Failed to update group icon_');
        }
      }

      try {
        const ppUrl = await sock.profilePictureUrl(m.chat, 'preview');
        return sock.sendMessage(m.chat, {
          image: { url: ppUrl }
        }, { quoted: m });
      } catch (e) {
        return m.reply('_Group icon not found_');
      }
    }
  }
};
