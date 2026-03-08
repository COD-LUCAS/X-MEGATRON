
module.exports = {
  command: ['del'],
  category: 'whatsapp',
  desc: 'Delete replied message',
  usage: '.del (reply to message)',

  async execute(sock, m) {
    if (!m.quoted) return;

    // Method 1: Try direct key from message
    if (m.message?.extendedTextMessage?.contextInfo?.stanzaId) {
      const ctx = m.message.extendedTextMessage.contextInfo;
      const key = {
        remoteJid: m.chat,
        id: ctx.stanzaId,
        participant: ctx.participant,
        fromMe: false
      };

      try {
        await sock.sendMessage(m.chat, { delete: key });
        return;
      } catch (e) {}
    }

    // Method 2: Construct from quoted
    const key2 = {
      remoteJid: m.chat,
      id: m.quoted.id,
      participant: m.isGroup ? m.quoted.sender : undefined,
      fromMe: m.quoted.fromMe
    };

    try {
      await sock.sendMessage(m.chat, { delete: key2 });
      return;
    } catch (e) {}

    // Method 3: Try without participant
    const key3 = {
      remoteJid: m.chat,
      id: m.quoted.id,
      fromMe: m.quoted.fromMe
    };

    try {
      await sock.sendMessage(m.chat, { delete: key3 });
    } catch (e) {
      console.log('All delete methods failed');
    }
  }
};
