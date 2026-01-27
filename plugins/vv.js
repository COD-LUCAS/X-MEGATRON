module.exports = {
  command: ["mp3", "photo", "vv"],
  category: "converter",
  description: "Convert media: mp3, photo, viewonce",

  async execute(sock, m, { reply, quoted, text, command }) {
    
    // ============ MP3 CONVERTER ============
    if (command === "mp3") {
      
      if (!quoted) {
        return reply('_❌ Reply to a video or audio message_');
      }

      const mtype = quoted.mtype;
      
      if (mtype !== 'videoMessage' && mtype !== 'audioMessage') {
        return reply('_❌ Reply to a video or audio message_');
      }

      await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

      try {
        const buffer = await quoted.download();
        const filename = (text && text.trim()) ? text.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'audio';

        await sock.sendMessage(m.chat, {
          audio: buffer,
          mimetype: 'audio/mpeg',
          fileName: `${filename}.mp3`,
          ptt: false
        }, { quoted: m });

        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
      } catch (error) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_❌ Conversion failed_');
      }
      
      return;
    }

    // ============ PHOTO CONVERTER ============
    if (command === "photo") {
      
      if (!quoted) {
        return reply('_❌ Reply to a sticker_');
      }

      const mtype = quoted.mtype;
      
      if (mtype !== 'stickerMessage') {
        return reply('_❌ Reply to a sticker message_');
      }

      await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

      try {
        const buffer = await quoted.download();

        await sock.sendMessage(m.chat, {
          image: buffer,
          caption: '_✅ Sticker converted to photo_'
        }, { quoted: m });

        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
      } catch (error) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_❌ Conversion failed_');
      }
      
      return;
    }

    // ============ VIEW ONCE REVEALER ============
    if (command === "vv") {
      
      if (!quoted) {
        return reply('_❌ Reply to a view once message_');
      }

      const msg = quoted.message;
      const mtype = quoted.mtype;
      
      // Check if it's marked as view once
      if (!quoted.isViewOnce) {
        return reply('_❌ This is not a view once message_\n\n_Reply to an unopened view once photo or video_');
      }

      await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

      try {
        const buffer = await quoted.download();

        // Check for view once message structure
        let viewOnceContent = null;
        
        if (msg.viewOnceMessageV2?.message) {
          viewOnceContent = msg.viewOnceMessageV2.message;
        } else if (msg.viewOnceMessage?.message) {
          viewOnceContent = msg.viewOnceMessage.message;
        }

        // If we have view once structure, use it
        if (viewOnceContent) {
          if (viewOnceContent.imageMessage) {
            const caption = viewOnceContent.imageMessage.caption || '';
            await sock.sendMessage(m.chat, {
              image: buffer,
              caption: `_🔓 View Once Revealed_${caption ? '\n\n' + caption : ''}`
            }, { quoted: m });
          } 
          else if (viewOnceContent.videoMessage) {
            const caption = viewOnceContent.videoMessage.caption || '';
            await sock.sendMessage(m.chat, {
              video: buffer,
              caption: `_🔓 View Once Revealed_${caption ? '\n\n' + caption : ''}`
            }, { quoted: m });
          }
          else if (viewOnceContent.audioMessage) {
            await sock.sendMessage(m.chat, {
              audio: buffer,
              mimetype: 'audio/mpeg'
            }, { quoted: m });
          }
        }
        // Fallback: use mtype (for already viewed messages)
        else {
          const caption = quoted.msg?.caption || '';
          
          if (mtype === 'imageMessage') {
            await sock.sendMessage(m.chat, {
              image: buffer,
              caption: `_🔓 View Once Revealed_${caption ? '\n\n' + caption : ''}`
            }, { quoted: m });
          } 
          else if (mtype === 'videoMessage') {
            await sock.sendMessage(m.chat, {
              video: buffer,
              caption: `_🔓 View Once Revealed_${caption ? '\n\n' + caption : ''}`
            }, { quoted: m });
          }
          else if (mtype === 'audioMessage') {
            await sock.sendMessage(m.chat, {
              audio: buffer,
              mimetype: 'audio/mpeg'
            }, { quoted: m });
          }
          else {
            return reply('_❌ Unsupported media type_');
          }
        }

        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
      } catch (error) {
        console.error('VV error:', error);
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply('_❌ Failed to reveal_');
      }
      
      return;
    }
  }
};