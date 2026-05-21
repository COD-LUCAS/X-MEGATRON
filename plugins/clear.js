'use strict';

module.exports = {
  command: ['clear'],
  category: 'misc',
  desc: 'Clear chat',
  usage: '.clear',

  async execute(sock, m, context) {
    const { reply, isOwner } = context;
    
    if (!isOwner) return reply('_Owner only_');

    try {
      await sock.chatModify(
        {
          delete: true,
          lastMessages: [
            {
              key: m.key,
              messageTimestamp: m.messageTimestamp || Math.floor(Date.now() / 1000)
            }
          ]
        },
        m.chat
      );
      
      return reply('_Chat cleared!_');
    } catch (error) {
      console.error('Clear error:', error);
      return reply(`_Failed: ${error.message}_`);
    }
  }
};