
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

// Clean all old temp files on startup
const cleanAllTempFiles = () => {
  try {
    const files = fs.readdirSync(TMP_DIR);
    let deleted = 0;
    for (const file of files) {
      const filePath = path.join(TMP_DIR, file);
      try {
        fs.unlinkSync(filePath);
        deleted++;
      } catch (_) {}
    }
    if (deleted > 0) {
      console.log(`Cleaned ${deleted} temp files`);
    }
  } catch (_) {}
};

// Run cleanup on startup
cleanAllTempFiles();

// Clean temp files older than 1 minute
const cleanOldTempFiles = () => {
  try {
    const files = fs.readdirSync(TMP_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(TMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.birthtimeMs > 60000) { // 1 minute
          fs.unlinkSync(filePath);
        }
      } catch (_) {}
    }
  } catch (_) {}
};

// Run cleanup every 30 seconds
setInterval(cleanOldTempFiles, 30000);

const tmpFile = (ext) => path.join(TMP_DIR, `take_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
const del = (...files) => {
  for (const f of files) {
    try {
      if (f && fs.existsSync(f)) fs.unlinkSync(f);
    } catch (_) {}
  }
};

// Image to WebP sticker
const imageToSticker = (buffer) => new Promise((resolve, reject) => {
  const input = tmpFile('jpg');
  const output = tmpFile('webp');
  
  try {
    fs.writeFileSync(input, buffer);
  } catch (err) {
    return reject(err);
  }
  
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
  
  try {
    fs.writeFileSync(input, buffer);
  } catch (err) {
    return reject(err);
  }
  
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
  command: ['take'],
  category: 'converter',
  desc: 'Change sticker packname and author',
  usage: '.take <packname> or .take <packname>;<author>',

  async execute(sock, m, context) {
    const { reply, args } = context;
    
    // Check disk space before starting
    try {
      const stats = fs.statfsSync(TMP_DIR);
      const freeBytes = stats.bavail * stats.bsize;
      const freeMB = freeBytes / (1024 * 1024);
      if (freeMB < 50) {
        // Critical: clean all temp files
        cleanAllTempFiles();
        const newStats = fs.statfsSync(TMP_DIR);
        const newFreeMB = (newStats.bavail * newStats.bsize) / (1024 * 1024);
        if (newFreeMB < 50) {
          return reply('_Low disk space, cannot process_');
        }
      }
    } catch (_) {}
    
    try {
      if (!m.quoted) {
        return reply('_Reply to a sticker, image, or video_');
      }

      const quotedMsg = m.quoted.message;
      if (!quotedMsg) {
        return reply('_Could not find quoted message_');
      }

      const input = args.join(' ');
      if (!input) {
        return reply('_Usage:_\n_`.take packname`_\n_`.take packname;author`_');
      }

      const parts = input.split(';');
      const newPackname = parts[0].trim();
      const newAuthor = parts[1] ? parts[1].trim() : '';

      if (!newPackname) {
        return reply('_Packname cannot be empty_');
      }

      await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

      let stickerBuffer;
      let mediaBuffer = null;
      let stream = null;

      // Handle sticker message
      if (quotedMsg.stickerMessage) {
        stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
        let buffer = Buffer.alloc(0);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }
        mediaBuffer = buffer;
        stickerBuffer = mediaBuffer;
      }
      // Handle image message
      else if (quotedMsg.imageMessage) {
        stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
        let buffer = Buffer.alloc(0);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }
        mediaBuffer = buffer;
        stickerBuffer = await imageToSticker(mediaBuffer);
      }
      // Handle video message
      else if (quotedMsg.videoMessage) {
        stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
        let buffer = Buffer.alloc(0);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }
        mediaBuffer = buffer;
        stickerBuffer = await videoToSticker(mediaBuffer);
      }
      else {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_Reply to a sticker, image, or video_');
      }

      if (!stickerBuffer || stickerBuffer.length === 0) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_Failed to process media_');
      }

      // Apply new packname and author
      const sticker = new Sticker(stickerBuffer, {
        pack: newPackname,
        author: newAuthor,
        quality: 80,
        type: 'full'
      });

      const finalSticker = await sticker.toBuffer();

      // Send the new sticker
      await sock.sendMessage(m.chat, { sticker: finalSticker }, { quoted: m });
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

      // Immediate cleanup of media buffer
      mediaBuffer = null;
      stickerBuffer = null;
      
      // Force garbage collection if possible
      if (global.gc) {
        global.gc();
      }

    } catch (err) {
      console.error('Take plugin error:', err);
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      
      if (err.message.includes('ENOSPC')) {
        // Clean all temp files on disk full error
        cleanAllTempFiles();
        reply('_Disk full. Temp files cleaned. Try again_'');
      } else {
        reply(`_Failed: ${err.message}_`);
      }
    }
  },
};