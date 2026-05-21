'use strict';

const { downloadContentFromMessage } = require('@itsliaaa/baileys');
const { updatefullpp } = require('../library/profile');

module.exports = {
  command: ["fullpp"],
  category: "owner",
  desc: "Update profile picture",
  owner: true,

  async execute(sock, m, context) {
    const { reply, react, isOwner } = context;
    
    if (!isOwner) {
      return reply("_Owner only_");
    }

    if (!m.quoted) {
      return reply("_Reply to an image_\n_Usage: .fullpp_");
    }

    await react('⏳');

    try {
      const quotedMsg = m.quoted.message;
      
      if (!quotedMsg || !quotedMsg.imageMessage) {
        await react('❌');
        return reply("_Reply to an image file_");
      }

      // Download image
      const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
      let buffer = Buffer.alloc(0);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      if (!buffer || buffer.length === 0) {
        await react('❌');
        return reply("_Failed to download image_");
      }

      // Update profile picture
      const botJid = sock.user.id;
      const success = await updatefullpp(botJid, buffer, sock);

      if (success) {
        await react('✅');
        return reply("_Profile picture updated_");
      } else {
        await react('❌');
        return reply("_Failed to update profile picture_");
      }

    } catch (error) {
      await react('❌');
      console.error("FullPP error:", error);
      return reply(`_Failed: ${error.message}_`);
    }
  }
};