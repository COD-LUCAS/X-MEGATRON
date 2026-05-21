'use strict';

const { updatefullpp } = require('../library/profile');

module.exports = {
  command: ["fullpp"],
  category: "sudo",
  desc: "update profile in fullpp",
  owner: true,
  sudo: true,

  async execute(sock, m, context) {
    const { reply, react, isOwner, isSudo } = context;
    
    // Allow owner and sudo users
    if (!isOwner && !isSudo) {
      return reply("_Owner and sudo only_");
    }

    try {
      if (!m.quoted || !m.quoted.message?.imageMessage) {
        return reply("_Reply to an Image_");
      }

      await react('⏳');
      
      let media = await m.quoted.download();
      await updatefullpp(m.user || sock.user.id, media, sock);
      
      await react('✅');
      return reply("_Profile Picture Updated_");
      
    } catch (e) {
      console.log(e);
      await react('❌');
      return reply(`_Failed: ${e.message}_`);
    }
  }
};