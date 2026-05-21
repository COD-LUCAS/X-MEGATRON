'use strict';

module.exports = {
  command: ['add'],
  category: 'group',
  desc: 'Add a member to group',
  usage: '.add 919876543210',
  group: true,

  async execute(sock, m, context) {
    const { reply, args, isOwner, isAdmin, isBotAdmin } = context;
    
    if (!isBotAdmin) return reply('_Make me admin first_');
    if (!isOwner && !isAdmin) return reply('_Admin or owner only_');

    let input = args.join(' ');
    
    // Get from reply or args
    if (!input && m.quoted?.sender) {
      input = m.quoted.sender.split('@')[0];
    }
    
    if (!input) return reply('_Usage: .add 919876543210_');

    // Clean the number
    let number = input
      .replace(/\+/g, '')
      .replace(/\s/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .replace(/-/g, '');
    
    // Add @s.whatsapp.net if not present
    if (!number.includes('@')) {
      number = number + '@s.whatsapp.net';
    }
    
    try {
      await sock.groupParticipantsUpdate(m.chat, [number], 'add');
      const num = number.split('@')[0];
      await reply(`_Added @${num}_`);
    } catch (error) {
      console.error('Add error:', error);
      
      if (error.message.includes('405')) {
        reply('_Cannot add number. User may have privacy settings enabled._');
      } else if (error.message.includes('403')) {
        reply('_Bot is not admin or user cannot be added_');
      } else {
        reply(`_Failed: ${error.message}_`);
      }
    }
  }
};