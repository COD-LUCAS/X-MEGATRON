const fs = require('fs')
const path = require('path')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('ffmpeg-static')
const googleTTS = require('google-tts-api')

ffmpeg.setFfmpegPath(ffmpegPath)

module.exports = {
  command: ['tts'],
  category: 'utility',
  desc: 'Convert text to voice message',
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, context) {
    const { text, quoted, reply } = context

    let input = text
    if (!input && quoted?.text) input = quoted.text

    if (!input) {
      return reply(
        'Usage:\n.tts hello world\n.tts hello world | en'
      )
    }

    let lang = 'en'

    if (input.includes('|')) {
      const split = input.split('|')
      input = split[0].trim()
      lang = split[1]?.trim() || 'en'
    }

    const tmpDir = path.join(__dirname, '../temp')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir)

    const mp3Path = path.join(tmpDir, `${Date.now()}.mp3`)
    const opusPath = mp3Path.replace('.mp3', '.opus')

    try {
      const url = googleTTS.getAudioUrl(input, {
        lang,
        slow: false,
        host: 'https://translate.google.com'
      })

      const res = await fetch(url)
      const buffer = Buffer.from(await res.arrayBuffer())
      fs.writeFileSync(mp3Path, buffer)

      await new Promise((resolve, reject) => {
        ffmpeg(mp3Path)
          .audioCodec('libopus')
          .format('opus')
          .save(opusPath)
          .on('end', resolve)
          .on('error', reject)
      })

      const audio = fs.readFileSync(opusPath)

      await sock.sendMessage(
        m.chat,
        {
          audio,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        },
        { quoted: m }
      )

    } catch (e) {
      reply('TTS failed')
    } finally {
      if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path)
      if (fs.existsSync(opusPath)) fs.unlinkSync(opusPath)
    }
  }
}