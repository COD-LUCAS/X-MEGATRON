'use strict';

const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const getTempPath = (ext) => path.join(TMP_DIR, `${Date.now()}${ext}`);
const cleanTemp = (file) => {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
};

module.exports = {
  command: ['photo', 'video'],
  category: 'converter',
  desc: 'Convert stickers to photo/video',
  usage: '.photo (reply to non-animated sticker) | .video (reply to animated sticker)',

  async execute(sock, m, context) {
    const { command, reply, react } = context;

    if (command === 'photo') {
      if (!m.quoted || m.quoted.mtype !== 'stickerMessage') {
        return reply('_Reply to a non-animated sticker_');
      }

      try {
        await react('🔄');

        const media = await m.quoted.download();
        const inputPath = getTempPath('.webp');
        const outputPath = getTempPath('.png');

        fs.writeFileSync(inputPath, media);

        exec(`ffmpeg -i "${inputPath}" "${outputPath}"`, async (err) => {
          try {
            if (err) {
              cleanTemp(inputPath);
              await react('❌');
              return reply('_Conversion failed_');
            }

            const buffer = fs.readFileSync(outputPath);

            await sock.sendMessage(m.chat, {
              image: buffer
            }, { quoted: m });

            await react('✅');

            cleanTemp(inputPath);
            cleanTemp(outputPath);
          } catch (e) {
            await react('❌');
            cleanTemp(inputPath);
            cleanTemp(outputPath);
          }
        });

      } catch (e) {
        await react('❌');
        return reply('_Failed to convert_');
      }
    }

    if (command === 'video') {
      if (!m.quoted || m.quoted.mtype !== 'stickerMessage') {
        return reply('_Reply to an animated sticker_');
      }

      try {
        await react('🔄');

        const media = await m.quoted.download();
        const inputPath = getTempPath('.webp');
        const outputPath = getTempPath('.mp4');

        fs.writeFileSync(inputPath, media);

        exec(`ffmpeg -i "${inputPath}" -c:v copy "${outputPath}"`, async (err) => {
          if (err) {
            exec(`ffmpeg -i "${inputPath}" -c:v libx264 -preset ultrafast "${outputPath}"`, async (err2) => {
              try {
                if (err2) {
                  cleanTemp(inputPath);
                  await react('❌');
                  return reply('_Conversion failed_');
                }

                const buffer = fs.readFileSync(outputPath);

                await sock.sendMessage(m.chat, {
                  video: buffer,
                  gifPlayback: true
                }, { quoted: m });

                await react('✅');

                cleanTemp(inputPath);
                cleanTemp(outputPath);
              } catch (e) {
                await react('❌');
                cleanTemp(inputPath);
                cleanTemp(outputPath);
              }
            });
          } else {
            try {
              const buffer = fs.readFileSync(outputPath);

              await sock.sendMessage(m.chat, {
                video: buffer,
                gifPlayback: true
              }, { quoted: m });

              await react('✅');

              cleanTemp(inputPath);
              cleanTemp(outputPath);
            } catch (e) {
              await react('❌');
              cleanTemp(inputPath);
              cleanTemp(outputPath);
            }
          }
        });

      } catch (e) {
        await react('❌');
        return reply('_Failed to convert_');
      }
    }
  }
};