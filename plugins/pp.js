'use strict';

const { updateFullPP } = require('../library/misc');

module.exports = {
  command: ['fullpp', 'setpp', 'profilepic'],
  category: 'owner',
  desc: 'Update bot profile picture',
  usage: '.fullpp (reply to image)',

  async execute(sock, m, context) {
    const { reply, react, isOwner } = context;
    
    if (!isOwner) {
      return reply('_Owner only_');
    }

    if (!m.quoted) {
      return reply('_Reply to an image_\n_Usage: .fullpp_');
    }

    await react('⏳');

    try {
      const mediaBuffer = await m.quoted.download();
      
      if (!mediaBuffer || mediaBuffer.length === 0) {
        await react('❌');
        return reply('_Failed to download image_');
      }

      const botJid = sock.user.id;
      const success = await updateFullPP(botJid, mediaBuffer, sock);

      if (success) {
        await react('✅');
        reply('_Profile picture updated_');
      } else {
        await react('❌');
        reply('_Failed to update profile picture_');
      }

    } catch (error) {
      await react('❌');
      console.error('FullPP error:', error);
      reply(`_Failed: ${error.message}_`);
    }
  }
};