
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const getRandom = (ext) => {
  return path.join(__dirname, '..', 'temp', `${Date.now()}${ext}`);
};

const ensureTempDir = () => {
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
};

module.exports = {
  command: ['photo', 'video'],
  category: 'converter',
  desc: 'Convert stickers to photo/video',
  usage: '.photo (reply to sticker) / .video (reply to animated sticker)',

  async execute(sock, m, context) {
    const { command } = context;

    ensureTempDir();

    if (command === 'photo') {
      if (!m.quoted || m.quoted.mtype !== 'stickerMessage') {
        return m.reply('_Reply to a non-animated sticker_');
      }

      try {
        await sock.sendMessage(m.chat, { react: { text: '🔄', key: m.key } });

        const media = await m.quoted.download();
        const inputPath = getRandom('.webp');
        const outputPath = getRandom('.png');

        fs.writeFileSync(inputPath, media);

        exec(`ffmpeg -i "${inputPath}" "${outputPath}"`, async (err) => {
          try {
            if (err) {
              fs.unlinkSync(inputPath);
              await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
              return m.reply('_Conversion failed_');
            }

            const buffer = fs.readFileSync(outputPath);

            await sock.sendMessage(m.chat, {
              image: buffer
            }, { quoted: m });

            await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

            fs.unlinkSync(inputPath);
            fs.unlinkSync(outputPath);
          } catch (e) {
            await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          }
        });

      } catch (e) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return m.reply('_Failed to convert_');
      }
    }

    if (command === 'video') {
      if (!m.quoted || m.quoted.mtype !== 'stickerMessage') {
        return m.reply('_Reply to an animated sticker_');
      }

      try {
        await sock.sendMessage(m.chat, { react: { text: '🔄', key: m.key } });

        const media = await m.quoted.download();
        const inputPath = getRandom('.webp');
        const outputPath = getRandom('.mp4');

        fs.writeFileSync(inputPath, media);

        exec(`ffmpeg -i "${inputPath}" -c:v copy "${outputPath}"`, async (err) => {
          if (err) {
            exec(`ffmpeg -i "${inputPath}" -c:v libx264 -preset ultrafast "${outputPath}"`, async (err2) => {
              try {
                if (err2) {
                  fs.unlinkSync(inputPath);
                  await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                  return m.reply('_Conversion failed_');
                }

                const buffer = fs.readFileSync(outputPath);

                await sock.sendMessage(m.chat, {
                  video: buffer,
                  gifPlayback: true
                }, { quoted: m });

                await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
              } catch (e) {
                await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
              }
            });
          } else {
            try {
              const buffer = fs.readFileSync(outputPath);

              await sock.sendMessage(m.chat, {
                video: buffer,
                gifPlayback: true
              }, { quoted: m });

              await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

              fs.unlinkSync(inputPath);
              fs.unlinkSync(outputPath);
            } catch (e) {
              await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            }
          }
        });

      } catch (e) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return m.reply('_Failed to convert_');
      }
    }
  }
};
