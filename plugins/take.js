'use strict';

const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { Sticker } = require('wa-sticker-formatter');
const { downloadContentFromMessage } = require('@itsliaaa/baileys');

ffmpeg.setFfmpegPath(ffmpegPath);

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// Clean old temp files on startup
const cleanOldFiles = () => {
  try {
    const files = fs.readdirSync(TMP_DIR);
    const now = Date.now();
    for (const file of files) {
      if (file.startsWith('take_')) {
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

const tmpFile = (ext) => path.join(TMP_DIR, `take_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
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

// Get quoted message
const getQuotedMessage = (m) => {
  const ctx = m.message?.extendedTextMessage?.contextInfo;
  if (!ctx || !ctx.quotedMessage) return null;
  return ctx.quotedMessage;
};

// Get media buffer from quoted message
const getMediaBuffer = async (quotedMsg) => {
  if (!quotedMsg) return { buffer: null, type: null };
  
  let stream;
  let type;
  
  if (quotedMsg.stickerMessage) {
    stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
    type = 'sticker';
  } else if (quotedMsg.imageMessage) {
    stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
    type = 'image';
  } else if (quotedMsg.videoMessage) {
    stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
    type = 'video';
  } else {
    return { buffer: null, type: null };
  }
  
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  
  return { buffer, type };
};

module.exports = {
  command: ['take'],
  category: 'converter',
  desc: 'Change sticker packname and author (works with sticker, image, or video)',
  usage: '.take <packname> or .take <packname>;<author>',

  async execute(sock, m, { reply, args, react }) {
    try {
      await react('⏳');
      
      const quotedMsg = getQuotedMessage(m);
      if (!quotedMsg) {
        await react('❌');
        return reply('_Reply to a sticker, image, or video_');
      }

      const input = args.join(' ');
      if (!input) {
        await react('❌');
        return reply('_Usage:_\n_`.take packname`_\n_`.take packname;author`_');
      }

      const parts = input.split(';');
      const newPackname = parts[0].trim();
      const newAuthor = parts[1] ? parts[1].trim() : '';

      if (!newPackname) {
        await react('❌');
        return reply('_Packname cannot be empty_');
      }

      // Get media
      const { buffer, type } = await getMediaBuffer(quotedMsg);
      if (!buffer) {
        await react('❌');
        return reply('_Failed to download media_');
      }

      let stickerBuffer;

      // Process based on type
      if (type === 'sticker') {
        stickerBuffer = buffer;
      } else if (type === 'image') {
        stickerBuffer = await imageToSticker(buffer);
      } else if (type === 'video') {
        stickerBuffer = await videoToSticker(buffer);
      } else {
        await react('❌');
        return reply('_Unsupported media type_');
      }

      // Apply packname/author
      const sticker = new Sticker(stickerBuffer, {
        pack: newPackname,
        author: newAuthor,
        quality: 80,
        type: 'full'
      });

      const outputSticker = await sticker.toBuffer();
      
      // Send the sticker
      await sock.sendMessage(m.chat, { sticker: outputSticker }, { quoted: m });
      await react('✅');

      // Clean up old temp files
      setTimeout(() => {
        try {
          const files = fs.readdirSync(TMP_DIR);
          for (const file of files) {
            if (file.startsWith('take_')) {
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
      console.error('Take plugin error:', err);
      await react('❌');
      reply(`_Failed: ${err.message}_`);
      
      // Emergency cleanup
      try {
        const files = fs.readdirSync(TMP_DIR);
        for (const file of files) {
          if (file.startsWith('take_')) {
            try { fs.unlinkSync(path.join(TMP_DIR, file)); } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }
};