module.exports = {
  command: ['jid'],
  category: 'utility',
  desc: 'Get JID of chat, replied user, or mentioned user',
  owner: true,

  async execute(sock, m, { reply }) {
    if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      const jid =
        m.message.extendedTextMessage.contextInfo.participant ||
        m.chat
      return reply(jid)
    }

    const mentions =
      m.message?.extendedTextMessage?.contextInfo?.mentionedJid

    if (mentions && mentions.length) {
      for (const jid of mentions) {
        await reply(jid)
      }
      return
    }

    return reply(m.chat)
  }
}