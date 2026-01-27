const fs = require('fs')
const path = require('path')
const { downloadMediaMessage } = require('@whiskeysockets/baileys')

module.exports = {
  command: ['pp'],
  category: 'owner',
  desc: 'Change bot profile picture (reply to image)',
  owner: true,

  async execute(sock, m, { reply }) {
    const quoted =
      m.message?.extendedTextMessage?.contextInfo?.quotedMessage

    if (!quoted || !quoted.imageMessage) {
      return reply('_Reply to an image_')
    }

    await reply('_Updating profile picture..._')

    const buffer = await downloadMediaMessage(
      {
        key: {
          remoteJid: m.chat,
          id: m.message.extendedTextMessage.contextInfo.stanzaId,
          participant: m.message.extendedTextMessage.contextInfo.participant
        },
        message: quoted
      },
      'buffer',
      {},
      { logger: console }
    )

    await sock.updateProfilePicture(
      sock.user.id,
      buffer
    )
  }
}