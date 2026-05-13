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

// Simple image to sticker using wa-sticker-formatter
const imageToSticker = async (buffer, packname, author) => {
  const sticker = new Sticker(buffer, {
    pack: packname,
    author: author,
    quality: 80,
    type: 'full'
  });
  return await sticker.toBuffer();
};

module.exports = {
  command: ['take'],
  category: 'converter',
  desc: 'Change sticker packname and author',
  usage: '.take <packname> or .take <packname>;<author>',

  async execute(sock, m, context) {
    const { reply, args } = context;
    
    try {
      // Check if replying to a message
      if (!m.quoted) {
        return reply('_Reply to a sticker, image, or video_');
      }

      const quotedMsg = m.quoted.message;
      if (!quotedMsg) {
        return reply('_Could not find quoted message_');
      }

      // Get input
      const input = args.join(' ');
      if (!input) {
        return reply('_Usage:_\n_`.take packname`_\n_`.take packname;author`_');
      }

      const parts = input.split(';');
      const packname = parts[0].trim();
      const author = parts[1] ? parts[1].trim() : '';

      if (!packname) {
        return reply('_Packname cannot be empty_');
      }

      await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

      let mediaBuffer = null;
      let mediaType = null;

      // Detect media type and download
      if (quotedMsg.stickerMessage) {
        mediaBuffer = await downloadMedia(quotedMsg.stickerMessage, 'sticker');
        mediaType = 'sticker';
      } else if (quotedMsg.imageMessage) {
        mediaBuffer = await downloadMedia(quotedMsg.imageMessage, 'image');
        mediaType = 'image';
      } else if (quotedMsg.videoMessage) {
        mediaBuffer = await downloadMedia(quotedMsg.videoMessage, 'video');
        mediaType = 'video';
      } else {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_Reply to a sticker, image, or video_');
      }

      if (!mediaBuffer) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_Failed to download media_');
      }

      let stickerBuffer;

      // If it's already a sticker, just change metadata
      if (mediaType === 'sticker') {
        stickerBuffer = mediaBuffer;
      } 
      // If it's image or video, convert using wa-sticker-formatter
      else {
        stickerBuffer = await imageToSticker(mediaBuffer, packname, author);
      }

      // Apply packname/author to sticker
      const finalSticker = new Sticker(stickerBuffer, {
        pack: packname,
        author: author,
        quality: 80,
        type: 'full'
      });

      const outputBuffer = await finalSticker.toBuffer();

      // Send the sticker
      await sock.sendMessage(m.chat, { sticker: outputBuffer }, { quoted: m });
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

      // Cleanup
      mediaBuffer = null;
      stickerBuffer = null;
      outputBuffer = null;

    } catch (err) {
      console.error('Take error:', err);
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      reply(`_Failed: ${err.message}_`);
    }
  }
};