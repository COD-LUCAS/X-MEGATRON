const { Sticker } = require('wa-sticker-formatter');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function getMediaBuffer(msg) {
  const type = Object.keys(msg)[0];
  const stream = await downloadContentFromMessage(
    msg[type],
    type.replace('Message', '')
  );
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return buffer;
}

function cleanupTempFiles() {
  try {
    const tempDir = os.tmpdir();
    const files = fs.readdirSync(tempDir);
    
    for (const file of files) {
      if (file.startsWith('sticker_') || file.includes('wa-sticker')) {
        try {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);
          const now = Date.now();
          const fileAge = now - stats.mtimeMs;
          
          if (fileAge > 60000) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

module.exports = {
  command: ['sticker', 's'],
  category: 'converter',
  desc: 'Convert image or short video to sticker',
  usage: '.sticker (reply to image/video)',

  async execute(sock, m, context) {
    try {
      cleanupTempFiles();

      const quotedMsg = m.quoted?.message;

      if (!quotedMsg) {
        return m.reply('_Reply to image or video_');
      }

      const mime =
        quotedMsg.imageMessage?.mimetype ||
        quotedMsg.videoMessage?.mimetype ||
        '';

      if (!/image|video/.test(mime)) {
        return m.reply('_Reply to image or video_');
      }

      if (quotedMsg.videoMessage?.seconds > 10) {
        return m.reply('_Video must be under 10 seconds_');
      }

      const buffer = await getMediaBuffer(quotedMsg);
      if (!buffer || !buffer.length) {
        return m.reply('_Failed to download media_');
      }

      const name = m.sender?.split('@')[0] || 'User';

      const sticker = new Sticker(buffer, {
        pack: 'X-MEGATRON',
        author: name,
        quality: 50,
        type: 'full'
      });

      const out = await sticker.toBuffer();

      await sock.sendMessage(m.chat, { sticker: out }, { quoted: m });

      setImmediate(() => {
        buffer.fill(0);
        out.fill(0);
        cleanupTempFiles();
      });

    } catch (e) {
      return m.reply('_Failed to create sticker_');
    }
  }
};
