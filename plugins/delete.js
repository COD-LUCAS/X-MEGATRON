module.exports = {
  command: ['delete', 'del', 'dlt'],
  category: 'owner',
  desc: 'Delete bot messages or any message (if bot is admin)',
  usage: '.delete (reply to message)',
  group: false,

  async execute(sock, m, context) {
    if (!m.quoted) {
      return m.reply('_Reply to a message_');
    }

    const key = m.quoted.fakeObj?.key || {
      remoteJid: m.chat,
      fromMe: m.quoted.fromMe,
      id: m.quoted.id,
      participant: m.quoted.sender
    };

    if (key.fromMe) {
      try {
        await sock.sendMessage(m.chat, { delete: key });
        return;
      } catch (e) {
        return m.reply('_Failed to delete_');
      }
    }

    if (m.isGroup) {
      if (!context.isBotAdmin) {
        return m.reply('_Bot must be admin to delete others messages_');
      }

      try {
        await sock.sendMessage(m.chat, { delete: key });
        return;
      } catch (e) {
        return m.reply('_Failed to delete_');
      }
    }

    return m.reply('_Can only delete bot messages in PM_');
  }
};
