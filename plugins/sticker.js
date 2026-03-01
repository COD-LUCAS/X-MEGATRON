const { Sticker } = require('wa-sticker-formatter');
const fs = require('fs');
const path = require('path');

function cleanupTempFiles() {
  try {
    const tempDir = path.join(__dirname, '..');
    if (!fs.existsSync(tempDir)) return;
    
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      if (file.startsWith('temp_sticker_') || file.includes('.webp.')) {
        try {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);
          const now = Date.now();
          const fileAge = now - stats.mtimeMs;
          
          if (fileAge > 120000) {
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

      if (!m.quoted) {
        return m.reply('_Reply to image or video_');
      }

      const quoted = m.quoted;
      const mtype = quoted.mtype;

      if (!mtype || (!mtype.includes('image') && !mtype.includes('video'))) {
        return m.reply('_Reply to image or video_');
      }

      if (mtype.includes('video')) {
        const videoMsg = quoted.msg || quoted.message?.videoMessage;
        if (videoMsg?.seconds > 10) {
          return m.reply('_Video must be under 10 seconds_');
        }
      }

      const buffer = await m.quoted.download();
      
      if (!buffer || buffer.length === 0) {
        return m.reply('_Failed to download media_');
      }

      const name = context.senderNum || 'User';

      const sticker = new Sticker(buffer, {
        pack: 'X-MEGATRON',
        author: name,
        quality: 50,
        type: 'full'
      });

      const stickerBuffer = await sticker.toBuffer();

      await sock.sendMessage(m.chat, { 
        sticker: stickerBuffer 
      }, { quoted: m });

      setTimeout(() => {
        try {
          if (buffer) buffer.fill(0);
          if (stickerBuffer) stickerBuffer.fill(0);
          cleanupTempFiles();
        } catch (e) {}
      }, 3000);

    } catch (e) {
      return m.reply('_Failed to create sticker_');
    }
  }
};
