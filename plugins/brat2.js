'use strict';

const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');
const ffmpeg  = require('fluent-ffmpeg');
const ffmpegP = require('ffmpeg-static');
const { writeExif } = require('../library/exif');

ffmpeg.setFfmpegPath(ffmpegP);

const TMP = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

const tmpFile = (ext) => path.join(TMP, `bratb_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
const cleanup = (...files) => { for (const f of files) try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch(_){} };

const toSticker = (buf) => new Promise((resolve, reject) => {
  const inp = tmpFile('png');
  const out = tmpFile('webp');
  fs.writeFileSync(inp, buf);

  ffmpeg(inp)
    .outputOptions([
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black,negate',
      '-vcodec', 'libwebp',
      '-lossless', '0',
      '-qscale', '50',
      '-preset', 'default',
      '-loop', '0',
      '-an',
    ])
    .toFormat('webp')
    .save(out)
    .on('end', () => { const r = fs.readFileSync(out); cleanup(inp, out); resolve(r); })
    .on('error', (e) => { cleanup(inp, out); reject(e); });
});

const APIS = [
  (t) => `https://brat.caliphdev.com/api/brat?text=${encodeURIComponent(t)}`,
  (t) => `https://aqul-brat.hf.space/?text=${encodeURIComponent(t)}`,
];

module.exports = {
  command: ['bratb'],
  category: 'converter',
  desc: 'Create brat style text sticker with black background',
  usage: '.bratb <text>',

  async execute(sock, m, context) {
    const { text, reply, prefix, command } = context;
    const bratText = text || m.quoted?.body || '';

    if (!bratText.trim()) {
      return reply(`_Send text with the command_\n_Example: ${prefix}${command} hello_`);
    }

    await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    let lastErr;
    for (const apiFn of APIS) {
      try {
        const res = await axios.get(apiFn(bratText), {
          responseType: 'arraybuffer',
          timeout: 15000,
        });
        const buf = Buffer.from(res.data);
        const sticker = await toSticker(buf);
        const stickerWithExif = await writeExif(sticker, {
          packname: 'X-MEGATRON',
          author: 'COD-LUCAS',
        });
        await sock.sendMessage(m.chat, { sticker: stickerWithExif }, { quoted: m });
        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    return reply(`_Failed: ${lastErr?.message || 'API error'}_`);
  },
};