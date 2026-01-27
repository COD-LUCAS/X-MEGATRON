const yts = require('yt-search')
const axios = require('axios')

module.exports = {
  command: ['play'],
  category: 'downloader',
  desc: 'Play or download YouTube audio',

  async execute(sock, m, { text, reply }) {
    try {
      if (!text) {
        return reply('_Usage:_\n.play shape of you\n.play https://youtu.be/xxxx')
      }

      let videoUrl = text.trim()

      // 🔍 If not a YouTube link → SEARCH
      if (!/^https?:\/\//.test(videoUrl)) {
        const search = await yts(videoUrl)
        if (!search.videos || !search.videos.length) {
          return reply('_No results found_')
        }
        videoUrl = search.videos[0].url
      }

      await sock.sendMessage(
        m.chat,
        { react: { text: '🎶', key: m.key } }
      )

      const api = `https://yt-dl.officialhectormanuel.workers.dev/?url=${encodeURIComponent(videoUrl)}`
      const res = await axios.get(api)
      const data = res.data

      if (!data || !data.audio) {
        return reply('_Failed to fetch audio_')
      }

      await sock.sendMessage(
        m.chat,
        {
          audio: { url: data.audio },
          mimetype: 'audio/mpeg',
          fileName: `${(data.title || 'song').slice(0, 40)}.mp3`
        },
        { quoted: m }
      )

      await sock.sendMessage(
        m.chat,
        { react: { text: '✅', key: m.key } }
      )

    } catch (e) {
      console.log('PLAY ERROR:', e)
      return reply('_Error while playing audio_')
    }
  }
}