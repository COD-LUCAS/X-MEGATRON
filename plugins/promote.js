module.exports = {
  command: ['promote'],
  category: 'group',
  desc: 'Promote user to admin',
  usage: '.promote @user or reply to user',
  group: true,

  async execute(sock, m, context) {
    if (!context.isOwner && !context.isAdmin) {
      return;
    }

    if (!context.isBotAdmin) {
      return m.reply('_Make me admin first_');
    }

    let target = null;

    if (m.quoted) {
      target = m.quoted.sender;
    } else if (context.text) {
      const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      }
    }

    if (!target) {
      return m.reply('_Reply to user or mention @user_');
    }

    try {
      await sock.groupParticipantsUpdate(
        m.chat,
        [target],
        'promote'
      );

      return m.reply('_Promoted to admin_');
    } catch (e) {
      return m.reply('_Failed to promote_');
    }
  }
};
