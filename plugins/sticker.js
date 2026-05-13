'use strict';

const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// Clean old temp files on startup
const cleanOldFiles = () => {
  try {
    const files = fs.readdirSync(TMP_DIR);
    const now = Date.now();
    for (const file of files) {
      if (file.startsWith('stk_')) {
        const filePath = path.join(TMP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.birthtimeMs > 600000) { // 10 minutes
          try { fs.unlinkSync(filePath); } catch (_) {}
        }
      }
    }
  } catch (_) {}
};
cleanOldFiles();

const tmpFile = (ext) => path.join(TMP_DIR, `stk_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
const del = (...files) => files.forEach(f => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });

// Image to WebP sticker
const imageToSticker = (buffer) => new Promise((resolve, reject) => {
  const input = tmpFile('jpg');
  const output = tmpFile('webp');
  
  fs.writeFileSync(input, buffer);
  
  ffmpeg(input)
    .outputOptions([
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-vcodec', 'libwebp',
      '-pix_fmt', 'yuva420p',
      '-lossless', '0',
      '-qscale', '50',
      '-preset', 'default',
      '-loop', '0',
      '-an'
    ])
    .save(output)
    .on('end', () => {
      try {
        const result = fs.readFileSync(output);
        del(input, output);
        resolve(result);
      } catch (err) {
        del(input, output);
        reject(err);
      }
    })
    .on('error', (err) => {
      del(input, output);
      reject(err);
    });
});

// Video to animated WebP sticker
const videoToSticker = (buffer) => new Promise((resolve, reject) => {
  const input = tmpFile('mp4');
  const output = tmpFile('webp');
  
  fs.writeFileSync(input, buffer);
  
  ffmpeg(input)
    .outputOptions([
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15',
      '-vcodec', 'libwebp',
      '-pix_fmt', 'yuva420p',
      '-lossless', '0',
      '-qscale', '50',
      '-preset', 'default',
      '-loop', '0',
      '-an',
      '-t', '10'
    ])
    .save(output)
    .on('end', () => {
      try {
        const result = fs.readFileSync(output);
        del(input, output);
        resolve(result);
      } catch (err) {
        del(input, output);
        reject(err);
      }
    })
    .on('error', (err) => {
      del(input, output);
      reject(err);
    });
});

module.exports = {
  command: ['sticker', 's'],
  category: 'converter',
  desc: 'Convert image or video to sticker',
  usage: '.sticker (reply to image/video)',

  async execute(sock, m, context) {
    if (!m.quoted) {
      return m.reply('_Reply to an image or video_');
    }

    const mtype = m.quoted.mtype || '';
    if (!mtype.includes('image') && !mtype.includes('video')) {
      return m.reply('_Reply to an image or video_');
    }

    await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    const buffer = await m.quoted.download();
    if (!buffer || buffer.length === 0) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return m.reply('_Failed to download media_');
    }

    try {
      const stickerBuffer = mtype.includes('video')
        ? await videoToSticker(buffer)
        : await imageToSticker(buffer);

      await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      
      // Clean up old temp files
      setTimeout(() => {
        try {
          const files = fs.readdirSync(TMP_DIR);
          for (const file of files) {
            if (file.startsWith('stk_')) {
              const filePath = path.join(TMP_DIR, file);
              const stats = fs.statSync(filePath);
              if (Date.now() - stats.birthtimeMs > 60000) { // 1 minute
                try { fs.unlinkSync(filePath); } catch (_) {}
              }
            }
          }
        } catch (_) {}
      }, 5000);
      
    } catch (err) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      m.reply(`_Failed: ${err.message}_`);
    }
  }
};