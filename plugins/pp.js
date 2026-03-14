module.exports = {
  command: ['pp', 'gpp'],
  category: 'owner',
  desc: 'Change/Get profile picture or group icon (full screen)',
  usage: '.pp (reply to image) or .pp (reply to user) / .gpp (reply to image)',
  owner: true,

  async execute(sock, m, context) {
    const { command } = context;

    if (command === 'pp') {
      if (m.quoted && m.quoted.mtype === 'imageMessage') {
        try {
          await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
          
          const image = await m.quoted.download();
          const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

          await sock.updateProfilePicture(botJid, image);
          
          await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
          return m.reply('_Profile picture updated ✅_');
        } catch (e) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return m.reply('_Failed to update profile picture_');
        }
      }

      if (m.quoted) {
        const targetJid = m.quoted.sender;

        try {
          await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
          
          const ppUrl = await sock.profilePictureUrl(targetJid, 'preview');
          
          await sock.sendMessage(m.chat, {
            image: { url: ppUrl },
            caption: `_@${targetJid.split('@')[0]}_`,
            mentions: [targetJid]
          }, { quoted: m });
          
          await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        } catch (e) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return m.reply('_Profile picture not found_');
        }
        return;
      }

      return m.reply('_Reply to image to set PP or reply to user to get their PP_');
    }

    if (command === 'gpp') {
      if (!m.isGroup) {
        return m.reply('_This command is for groups only_');
      }

      if (m.quoted && m.quoted.mtype === 'imageMessage') {
        try {
          await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
          
          const image = await m.quoted.download();

          await sock.updateProfilePicture(m.chat, image);
          
          await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
          return m.reply('_Group icon updated ✅_');
          
        } catch (e) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return m.reply('_Bot must be admin_');
        }
      }

      try {
        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
        
        const ppUrl = await sock.profilePictureUrl(m.chat, 'preview');
        
        await sock.sendMessage(m.chat, {
          image: { url: ppUrl }
        }, { quoted: m });
        
        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      } catch (e) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return m.reply('_Group icon not found_');
      }
    }
  }
};
