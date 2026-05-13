'use strict';

const fs = require('fs');
const path = require('path');
const { Sticker } = require('wa-sticker-formatter');
const { downloadContentFromMessage } = require('@itsliaaa/baileys');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// Clean old temp files
const cleanOldFiles = () => {
  try {
    const files = fs.readdirSync(TMP_DIR);
    const now = Date.now();
    for (const file of files) {
      if (file.startsWith('take_') || file.startsWith('sticker_')) {
        const filePath = path.join(TMP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.birthtimeMs > 60000) {
          try { fs.unlinkSync(filePath); } catch (_) {}
        }
      }
    }
  } catch (_) {}
};

setInterval(cleanOldFiles, 30000);

// Download media from message
const downloadMedia = async (message, type) => {
  try {
    let stream;
    if (type === 'sticker') {
      stream = await downloadContentFromMessage(message, 'sticker');
    } else if (type === 'image') {
      stream = await downloadContentFromMessage(message, 'image');
    } else if (type === 'video') {
      stream = await downloadContentFromMessage(message, 'video');
    } else {
      return null;
    }
    
    let buffer = Buffer.alloc(0);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  } catch (err) {
    console.error('Download error:', err);
    return null;
  }
};

module.exports = {
  command: ['take'],
  category: 'converter',
  desc: 'Change sticker packname and author',
  usage: '.take <packname> or .take <packname>;<author>',

  async execute(sock, m, context) {
    const { reply, args } = context;
    
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
      let packname = parts[0].trim();
      let author = parts[1] ? parts[1].trim() : '';

      if (!packname) {
        return reply('_Packname cannot be empty_');
      }

      await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

      let mediaBuffer = null;
      let stickerBuffer = null;

      // Handle sticker
      if (quotedMsg.stickerMessage) {
        mediaBuffer = await downloadMedia(quotedMsg.stickerMessage, 'sticker');
        if (mediaBuffer) {
          const sticker = new Sticker(mediaBuffer, {
            pack: packname,
            author: author,
            quality: 80,
            type: 'full'
          });
          stickerBuffer = await sticker.toBuffer();
        }
      }
      // Handle image
      else if (quotedMsg.imageMessage) {
        mediaBuffer = await downloadMedia(quotedMsg.imageMessage, 'image');
        if (mediaBuffer) {
          const sticker = new Sticker(mediaBuffer, {
            pack: packname,
            author: author,
            quality: 80,
            type: 'full'
          });
          stickerBuffer = await sticker.toBuffer();
        }
      }
      // Handle video
      else if (quotedMsg.videoMessage) {
        mediaBuffer = await downloadMedia(quotedMsg.videoMessage, 'video');
        if (mediaBuffer) {
          const sticker = new Sticker(mediaBuffer, {
            pack: packname,
            author: author,
            quality: 80,
            type: 'full',
            process: 'smart'
          });
          stickerBuffer = await sticker.toBuffer();
        }
      }
      else {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_Reply to a sticker, image, or video_');
      }

      if (!mediaBuffer || !stickerBuffer) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_Failed to process media_');
      }

      // Send the sticker
      await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

      // Cleanup
      mediaBuffer = null;
      stickerBuffer = null;

    } catch (err) {
      console.error('Take error:', err);
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      
      let errorMsg = err.message;
      if (errorMsg.includes('constant')) {
        errorMsg = 'Internal error';
      }
      reply(`_Failed: ${errorMsg}_`);
    }
  }
};