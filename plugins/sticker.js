'use strict';

const fs      = require('fs');
const path    = require('path');
const ffmpeg  = require('fluent-ffmpeg');
const ffmpegP = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegP);

const TMP = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

const tmp = (ext) => path.join(TMP, `stk_${Date.now()}.${ext}`);
const del = (...f) => f.forEach(x => { try { if (x && fs.existsSync(x)) fs.unlinkSync(x); } catch(_){} });

// Image → WebP sticker (transparent background, no black border)
const imgSticker = (buf) => new Promise((resolve, reject) => {
  const i = tmp('jpg'), o = tmp('webp');
  fs.writeFileSync(i, buf);
  ffmpeg(i)
    .outputOptions([
      '-vf',      'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-vcodec',  'libwebp',
      '-pix_fmt', 'yuva420p',
      '-lossless','0',
      '-qscale',  '50',
      '-preset',  'default',
      '-loop',    '0',
      '-an',
    ])
    .save(o)
    .on('end', () => { const r = fs.readFileSync(o); del(i, o); resolve(r); })
    .on('error', e => { del(i, o); reject(e); });
});

// Video → animated WebP sticker (no black border)
const vidSticker = (buf) => new Promise((resolve, reject) => {
  const i = tmp('mp4'), o = tmp('webp');
  fs.writeFileSync(i, buf);
  ffmpeg(i)
    .outputOptions([
      '-vf',      'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15',
      '-vcodec',  'libwebp',
      '-pix_fmt', 'yuva420p',
      '-lossless','0',
      '-qscale',  '50',
      '-preset',  'default',
      '-loop',    '0',
      '-an',
      '-t',       '10',
    ])
    .save(o)
    .on('end', () => { const r = fs.readFileSync(o); del(i, o); resolve(r); })
    .on('error', e => { del(i, o); reject(e); });
});

module.exports = {
  command: ['sticker', 's'],
  category: 'converter',
  desc: 'Convert image or video to sticker (no black border)',
  usage: '.sticker (reply to image/video)',

  async execute(sock, m, context) {
    if (!m.quoted) return m.reply('_Reply to an image or video_');

    const mtype = m.quoted.mtype || '';
    if (!mtype.includes('image') && !mtype.includes('video'))
      return m.reply('_Reply to an image or video_');

    await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    const buf = await m.quoted.download();
    if (!buf || buf.length === 0) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return m.reply('_Failed to download media_');
    }

    try {
      const sticker = mtype.includes('video')
        ? await vidSticker(buf)
        : await imgSticker(buf);

      await sock.sendMessage(m.chat, { sticker }, { quoted: m });
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (e) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return m.reply(`_Failed: ${e.message}_`);
    }
  },
};