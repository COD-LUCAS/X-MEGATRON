const { igdl } = require('../library/api')

module.exports = {
  command: ['insta', 'ig'],
  category: 'downloader',
  desc: 'Download Instagram reel',
  usage: '.insta <instagram link>',
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, { text, reply, sender, isOwner, isSudo }) {
    if (!text || !text.includes('instagram.com')) {
      return reply('_Usage: .insta <instagram link>_')
    }

    const mode = (process.env.MODE || 'public').toLowerCase()
    if (mode === 'private' && !isOwner && !isSudo) return

    try {
      const data = await igdl(text)

      if (!data || !Array.isArray(data) || data.length === 0) {
        return reply('_Failed to fetch media_')
      }

      for (const media of data) {
        if (!media.url) continue

        if (media.type === 'video') {
          await sock.sendMessage(
            m.chat,
            { video: { url: media.url } },
            { quoted: m }
          )
        }
      }

    } catch (e) {
      console.log('Insta error:', e.message)
      reply('_Error while downloading reel_')
    }
  }
}