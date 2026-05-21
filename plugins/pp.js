'use strict';

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@itsliaaa/baileys');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// Check if Jimp is installed
let Jimp;
try {
  Jimp = require("jimp");
} catch (e) {
  // Jimp not installed
}

const cleanTemp = (file) => {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
};

module.exports = {
  command: ['fullpp', 'setpp'],
  category: 'owner',
  desc: 'Update bot profile picture',
  usage: '.fullpp (reply to image)',

  async execute(sock, m, context) {
    const { reply, react, isOwner } = context;
    
    if (!isOwner) {
      return reply('_Owner only_');
    }

    if (!Jimp) {
      return reply('_Jimp not found_\n_Install: npm install jimp_');
    }

    if (!m.quoted) {
      return reply('_Reply to an image_\n_Usage: .fullpp_');
    }

    await react('⏳');

    try {
      const quotedMsg = m.quoted.message;
      
      if (!quotedMsg || !quotedMsg.imageMessage) {
        await react('❌');
        return reply('_Reply to an image file_');
      }

      // Download image
      const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
      let buffer = Buffer.alloc(0);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      if (!buffer || buffer.length === 0) {
        await react('❌');
        return reply('_Failed to download image_');
      }

      // Process with Jimp
      const image = await Jimp.read(buffer);
      const size = Math.min(image.getWidth(), image.getHeight());
      const cropped = image.crop(0, 0, size, size);
      const resized = cropped.resize(640, 640);
      const processedBuffer = await resized.getBufferAsync(Jimp.MIME_JPEG);

      // Update using query method
      await sock.query({
        tag: "iq",
        attrs: {
          to: sock.user.id,
          type: "set",
          xmlns: "w:profile:picture"
        },
        content: [
          {
            tag: "picture",
            attrs: { type: "image" },
            content: processedBuffer
          }
        ]
      });

      await react('✅');
      reply('_Profile picture updated_');

    } catch (error) {
      await react('❌');
      console.error('FullPP error:', error);
      reply(`_Failed: ${error.message}_`);
    }
  }
};