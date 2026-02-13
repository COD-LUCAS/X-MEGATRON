const { Sticker } = require('wa-sticker-formatter')
const { downloadContentFromMessage } = require('@whiskeysockets/baileys')

async function getMediaBuffer(msg) {
  const type = Object.keys(msg)[0]
  const stream = await downloadContentFromMessage(
    msg[type],
    type.replace('Message', '')
  )
  let buffer = Buffer.alloc(0)
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
  return buffer
}

module.exports = {
  command: ['sticker', 's'],
  category: 'converter',
  desc: 'Convert image or short video to sticker',
  usage: '.sticker (reply to image/video)',
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, { reply }) {
    try {
      const ctx = m.message?.extendedTextMessage?.contextInfo
      const quotedMsg = ctx?.quotedMessage || null

      if (!quotedMsg) return reply('❌ Reply to an image or short video')

      const mime =
        quotedMsg.imageMessage?.mimetype ||
        quotedMsg.videoMessage?.mimetype ||
        ''

      if (!/image|video/.test(mime)) return reply('❌ Reply to an image or short video')

      if (quotedMsg.videoMessage?.seconds > 10) return reply('❌ Video must be under 10 seconds')

      const buffer = await getMediaBuffer(quotedMsg)
      if (!buffer || !buffer.length) return reply('❌ Failed to read media')

      const name = m.pushName || 'User'

      const sticker = new Sticker(buffer, {
        pack: name,
        author: name,
        quality: 80,
        type: 'full'
      })

      const out = await sticker.toBuffer()

      await sock.sendMessage(m.chat, { sticker: out }, { quoted: m })

    } catch (e) {
      console.error('Sticker plugin error:', e)
      reply('❌ Failed to create sticker')
    }
  }
}
