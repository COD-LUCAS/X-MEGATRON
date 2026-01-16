const axios = require('axios')
const { Sticker, StickerTypes } = require('wa-sticker-formatter')

module.exports = {
  command: ['brat'],
  category: 'basic',
  desc: 'Create brat style stickers from text',
  usage: '.brat <text> or reply to message',
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, context) {
    const { reply, quoted, text, prefix, command } = context

    if (!text && (!quoted || !quoted.text)) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
      return reply(`Send or reply text\n${prefix}${command} your_text`)
    }

    const bratText = text || quoted.text
    const packName = m.pushName || 'Brat'
    const authorName = 'Bot'

    try {
      await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

      const makeSticker = async (url) => {
        const res = await axios.get(url, { responseType: 'arraybuffer' })
        const buffer = Buffer.from(res.data)

        const sticker = new Sticker(buffer, {
          pack: packName,
          author: authorName,
          type: StickerTypes.FULL,
          quality: 50
        })

        return await sticker.toBuffer()
      }

      try {
        const url1 = 'https://brat.caliphdev.com/api/brat?text=' + encodeURIComponent(bratText)
        const stickerBuffer = await makeSticker(url1)
        await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m })
        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
      } catch {
        const url2 = 'https://aqul-brat.hf.space/?text=' + encodeURIComponent(bratText)
        const stickerBuffer = await makeSticker(url2)
        await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m })
        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
      }

    } catch (err) {
      console.log('Brat error:', err)
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
      reply('Failed to create brat sticker')
    }
  }
}
