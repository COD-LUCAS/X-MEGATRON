/**
 * mp3.js — plugins/mp3.js
 * Commands: .mp3, .takemp3
 *
 * .mp3     — convert audio/video to mp3
 * .takemp3 — steal audio as tagged mp3
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const ffmpeg  = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const config  = require('../config');

ffmpeg.setFfmpegPath(ffmpegPath);

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const tmp   = (ext) => path.join(TMP_DIR, `mp3_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
const clean = (...files) => files.forEach(f => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
const react = (sock, m, e) => sock.sendMessage(m.chat, { react: { text: e, key: m.key } }).catch(() => {});

async function toMp3(buffer) {
  const inPath  = tmp('input');
  const outPath = tmp('mp3');
  fs.writeFileSync(inPath, buffer);

  await new Promise((resolve, reject) => {
    ffmpeg(inPath)
      .toFormat('mp3')
      .audioCodec('libmp3lame')
      .audioQuality(2)
      .save(outPath)
      .on('end', resolve)
      .on('error', reject);
  });

  const result = fs.readFileSync(outPath);
  clean(inPath, outPath);
  return result;
}

module.exports = {
  command:  ['mp3', 'takemp3'],
  category: 'converter',
  desc:     'mp3: convert audio/video to mp3 | takemp3: steal audio as mp3',
  usage:    '.mp3 (reply audio/video) | .takemp3 (reply audio)',

  async execute(sock, m, ctx) {
    const { command, reply } = ctx;

    if (!m.quoted) return reply('_reply to an audio or video_');

    const mtype = m.quoted.mtype;
    const validMp3    = ['audioMessage', 'videoMessage', 'documentMessage'];
    const validTakeMp3 = ['audioMessage'];

    if (command === 'mp3') {
      if (!validMp3.includes(mtype)) return reply('_reply to an audio or video_');
      if (mtype === 'documentMessage') {
        const mime = m.quoted.message?.documentMessage?.mimetype || '';
        if (!mime.includes('video') && !mime.includes('audio')) return reply('_reply to a video or audio file_');
      }
    }

    if (command === 'takemp3') {
      if (!validTakeMp3.includes(mtype)) return reply('_reply to an audio_');
    }

    await react(sock, m, '⏫');

    try {
      const buffer = await m.quoted.download().catch(() => null);
      if (!buffer) { await react(sock, m, '❌'); return reply('_failed to download_'); }

      const mp3 = await toMp3(buffer);

      await sock.sendMessage(m.chat, {
        audio:    mp3,
        mimetype: 'audio/mpeg',
        ptt:      false
      }, { quoted: m });

      await react(sock, m, '✅');
    } catch (err) {
      console.error(`${command} error:`, err.message);
      await react(sock, m, '❌');
      return reply('_failed to convert_');
    }
  }
};
