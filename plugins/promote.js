module.exports = {
  command: ['promote', 'demote'],
  category: 'group',
  desc: 'Promote or demote users',
  usage: '.promote @user or reply / .demote @user or reply',
  group: true,

  async execute(sock, m, context) {
    const { command, isOwner, isAdmin } = context;

    if (!isOwner && !isAdmin) {
      return;
    }

    let target = null;

    if (m.quoted) {
      target = m.quoted.sender;
    } else if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
      const mentioned = m.message.extendedTextMessage.contextInfo.mentionedJid;
      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      }
    }

    if (!target) {
      return m.reply('_Tag or reply to user_');
    }

    try {
      const action = command === 'promote' ? 'promote' : 'demote';
      
      await sock.groupParticipantsUpdate(m.chat, [target], action);

      const targetNum = target.split('@')[0];
      const text = command === 'promote' 
        ? `_@${targetNum} promoted to admin_`
        : `_@${targetNum} demoted to member_`;

      return sock.sendMessage(m.chat, {
        text: text,
        mentions: [target]
      }, { quoted: m });

    } catch (e) {
      return m.reply('_Bot is not admin_');
    }
  }
};
