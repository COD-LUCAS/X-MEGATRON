
const fs      = require('fs')
const path    = require('path')
const ffmpeg  = require('fluent-ffmpeg')
const ffmpegPath = require('ffmpeg-static')
const googleTTS  = require('google-tts-api')

ffmpeg.setFfmpegPath(ffmpegPath)

// ── Helpers ───────────────────────────────────────────────────────────

/** Download one URL → buffer */
async function fetchBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TTS fetch failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Concatenate multiple MP3 files into one using ffmpeg concat demuxer.
 * More reliable than merging raw buffers (avoids header conflicts).
 */
function concatMp3s(inputs, output) {
  return new Promise((resolve, reject) => {
    // Build a concat list file
    const listPath = output + '.txt'
    const lines    = inputs.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
    fs.writeFileSync(listPath, lines)

    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .audioCodec('copy')
      .save(output)
      .on('end', () => { try { fs.unlinkSync(listPath) } catch (_) {}; resolve() })
      .on('error', (e) => { try { fs.unlinkSync(listPath) } catch (_) {}; reject(e) })
  })
}

/** Convert any audio file → opus PTT */
function toOpus(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .audioCodec('libopus')
      .format('opus')
      .save(output)
      .on('end', resolve)
      .on('error', reject)
  })
}

/** Clean up a list of file paths silently */
function cleanup(...files) {
  for (const f of files) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch (_) {}
  }
}

// ── Plugin ────────────────────────────────────────────────────────────

module.exports = {
  command:  ['tts'],
  category: 'utility',
  desc:     'Convert text to voice message (supports long text & line breaks)',
  group:    false,
  admin:    false,
  owner:    false,

  async execute(sock, m, context) {
    const { text, quoted, reply } = context

    let input = text
    if (!input && quoted?.text) input = quoted.text

    if (!input) {
      return reply(
        '_Usage:_\n' +
        '*.tts hello world*\n' +
        '*.tts hello world | hi* (hi = Hindi)\n' +
        '_.tts supports long text and line breaks_'
      )
    }

    // ── Parse language ────────────────────────────────────────────────
    let lang = 'en'
    if (input.includes('|')) {
      const parts = input.split('|')
      input = parts[0].trim()
      lang  = parts[1]?.trim() || 'en'
    }

    // ── Normalise: collapse line breaks & extra spaces ────────────────
    // google TTS chokes on newlines — replace with a pause (comma + space)
    input = input
      .replace(/\r\n|\r|\n/g, ', ')   // line breaks → comma pause
      .replace(/\s{2,}/g, ' ')         // multiple spaces → one
      .trim()

    if (!input) return reply('_no text to convert_')

    // ── Paths ─────────────────────────────────────────────────────────
    const tmpDir = path.join(__dirname, '../temp')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

    const ts        = Date.now()
    const opusPath  = path.join(tmpDir, `${ts}.opus`)
    const chunkPaths = []  // mp3 chunks
    let   mergedMp3 = ''

    try {
      // ── Get chunked URLs (handles any text length) ─────────────────
      // getAllAudioUrls splits at word boundaries under 200 chars each
      const urls = googleTTS.getAllAudioUrls(input, {
        lang,
        slow:  false,
        host:  'https://translate.google.com',
        splitPunct: ',.?!',
      })

      if (!urls?.length) throw new Error('No TTS URLs returned')

      // ── Download each chunk ────────────────────────────────────────
      for (let i = 0; i < urls.length; i++) {
        const chunkPath = path.join(tmpDir, `${ts}_chunk${i}.mp3`)
        const buf = await fetchBuffer(urls[i].url)
        fs.writeFileSync(chunkPath, buf)
        chunkPaths.push(chunkPath)
      }

      // ── Merge chunks if more than one ──────────────────────────────
      let sourceForOpus

      if (chunkPaths.length === 1) {
        sourceForOpus = chunkPaths[0]
      } else {
        mergedMp3     = path.join(tmpDir, `${ts}_merged.mp3`)
        await concatMp3s(chunkPaths, mergedMp3)
        sourceForOpus = mergedMp3
      }

      // ── Convert to opus PTT ────────────────────────────────────────
      await toOpus(sourceForOpus, opusPath)

      // ── Send ───────────────────────────────────────────────────────
      const audio = fs.readFileSync(opusPath)
      await sock.sendMessage(
        m.chat,
        { audio, mimetype: 'audio/ogg; codecs=opus', ptt: true },
        { quoted: m }
      )

    } catch (e) {
      console.error('[TTS]', e.message)
      reply('_TTS failed — check language code or try shorter text_')
    } finally {
      cleanup(...chunkPaths, mergedMp3, opusPath)
    }
  }
}
