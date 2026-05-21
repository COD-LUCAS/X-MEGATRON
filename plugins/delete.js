'use strict';

module.exports = {
  command: ['del', 'delete'],
  category: 'owner',
  desc: 'Delete replied message',
  usage: '.del (reply to message)',

  async execute(sock, m, context) {
    const { reply, isOwner } = context;
    
    // Only owner can use
    if (!isOwner) {
      return reply('_Owner only_');
    }

    if (!m.quoted) {
      return reply('_Reply to a message to delete_');
    }

    try {
      // Get the quoted message key
      const quotedKey = m.quoted.key;
      
      if (!quotedKey) {
        return reply('_Could not find quoted message_');
      }

      // Build delete key
      const deleteKey = {
        remoteJid: m.chat,
        id: quotedKey.id,
        fromMe: quotedKey.fromMe || false
      };

      // Add participant for groups
      if (m.isGroup) {
        deleteKey.participant = quotedKey.participant || m.quoted.sender;
      }

      // Send delete command
      await sock.sendMessage(m.chat, { delete: deleteKey });

    } catch (error) {
      console.error('Delete error:', error);
      
      // Alternative method
      try {
        const altKey = {
          remoteJid: m.chat,
          id: m.quoted.id,
          fromMe: false
        };
        
        if (m.isGroup) {
          altKey.participant = m.quoted.sender;
        }
        
        await sock.sendMessage(m.chat, { delete: altKey });
      } catch (err) {
        reply(`_Failed: ${err.message}_`);
      }
    }
  }
};