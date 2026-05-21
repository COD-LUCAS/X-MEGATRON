'use strict';

module.exports = {
  command: ['kick'],
  category: 'group',
  desc: 'Kick members from group',
  usage: '.kick @user | .kick all | .kick 91',
  group: true,

  async execute(sock, m, context) {
    const { reply, args, isOwner, isAdmin, isBotAdmin, participants } = context;
    
    if (!isBotAdmin) return reply('_Make me admin first_');
    if (!isOwner && !isAdmin) return reply('_Admin or owner only_');

    const input = args.join(' ').toLowerCase();
    const match = input;

    // Kick all members
    if (match === 'all') {
      const users = participants.filter(member => !member.admin);
      if (users.length === 0) return reply('_No non-admin members to kick_');
      
      await reply(`_❗ Kicking ${users.length} members from ${m.chat.split('@')[0]}. This will take a moment..._`);
      
      for (const member of users) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          await sock.groupParticipantsUpdate(m.chat, [member.id], 'remove');
        } catch (e) {}
      }
      
      return reply(`_Kicked ${users.length} members_`);
    }

    // Kick by number prefix
    if (/^\d+$/.test(match)) {
      const users = participants.filter(member => 
        member.id.startsWith(match) && !member.admin
      );
      
      if (users.length === 0) return reply(`_No members starting with ${match}_`);
      
      await reply(`_❗ Kicking ${users.length} members with prefix ${match}_`);
      
      for (const member of users) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          await sock.groupParticipantsUpdate(m.chat, [member.id], 'remove');
        } catch (e) {}
      }
      
      return reply(`_Kicked ${users.length} members_`);
    }

    // Kick mentioned or replied user
    let user = null;
    
    // From mentions
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      user = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    // From reply
    else if (m.quoted?.sender) {
      user = m.quoted.sender;
    }
    
    if (!user) return reply('_Mention or reply to a user_\n_Usage: .kick @user_');

    const isTargetAdmin = participants.some(p => 
      p.id === user && (p.admin === 'admin' || p.admin === 'superadmin')
    );
    
    if (isTargetAdmin && !isOwner) {
      return reply('_Cannot kick an admin_');
    }

    const userNum = user.split('@')[0];
    await sock.sendMessage(m.chat, {
      text: `_Kicked @${userNum}_`,
      mentions: [user]
    });
    
    await sock.groupParticipantsUpdate(m.chat, [user], 'remove');
  }
};