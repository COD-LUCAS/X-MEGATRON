module.exports = {
  command: ["mp3", "photo"],
  category: "media",
  desc: "Convert video to mp3 or sticker to photo",
  usage: ".mp3 [name] | .photo",
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, context) {
    const { reply, quoted, text } = context;

    try {
      // MP3 - Convert video/audio to MP3
      if (context.command === "mp3") {
        if (!quoted) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('Reply to a video or audio message');
        }

        const mediaMsg = quoted.message?.videoMessage || quoted.message?.audioMessage;

        if (!mediaMsg) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('Reply to a video or audio message');
        }

        await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

        // Proper way to download media
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(
          {
            key: quoted.key,
            message: quoted.message
          },
          'buffer',
          {},
          {
            logger: console,
            reuploadRequest: sock.updateMediaMessage
          }
        );
        
        let filename = "audio";
        if (text && text.trim()) {
          filename = text.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        }
        filename = `${filename}.mp3`;

        await sock.sendMessage(m.chat, {
          audio: buffer,
          mimetype: 'audio/mpeg',
          fileName: filename,
          ptt: false
        }, { quoted: m });

        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        return;
      }

      // PHOTO - Convert sticker to photo
      if (context.command === "photo") {
        if (!quoted) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('Reply to a sticker');
        }

        const stickerMsg = quoted.message?.stickerMessage;

        if (!stickerMsg) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply('Reply to a sticker message');
        }

        await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

        // Proper way to download media
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(
          {
            key: quoted.key,
            message: quoted.message
          },
          'buffer',
          {},
          {
            logger: console,
            reuploadRequest: sock.updateMediaMessage
          }
        );

        await sock.sendMessage(m.chat, {
          image: buffer
        }, { quoted: m });

        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        return;
      }

    } catch (e) {
      console.log('Media error:', e);
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return reply(`Failed: ${e.message}`);
    }
  }
};
