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
  command: ['photo', 'video', 'mp3'],
  category: 'converter',
  desc: 'Convert stickers to photo/video or audio to mp3',
  usage: '.photo (reply to sticker) / .video (reply to animated sticker) / .mp3 (reply to audio)',

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

        // Super simple conversion - just convert format, no re-encoding
        exec(`ffmpeg -i "${inputPath}" -c:v copy "${outputPath}"`, async (err) => {
          if (err) {
            // Fallback: if copy fails, do quick encode
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

    if (command === 'mp3') {
      if (!m.quoted || (m.quoted.mtype !== 'audioMessage' && m.quoted.mtype !== 'videoMessage')) {
        return m.reply('_Reply to an audio or video_');
      }

      try {
        await sock.sendMessage(m.chat, { react: { text: '🔄', key: m.key } });

        const media = await m.quoted.download();
        const inputPath = getRandom(m.quoted.mtype === 'videoMessage' ? '.mp4' : '.ogg');
        const outputPath = getRandom('.mp3');

        fs.writeFileSync(inputPath, media);

        // ULTRA FAST - copy audio stream if possible, no re-encoding
        exec(`ffmpeg -i "${inputPath}" -vn -c:a copy "${outputPath}"`, async (err) => {
          if (err) {
            // Fallback: quick encode if copy fails
            exec(`ffmpeg -i "${inputPath}" -vn -c:a libmp3lame -b:a 128k "${outputPath}"`, async (err2) => {
              try {
                if (err2) {
                  fs.unlinkSync(inputPath);
                  await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                  return m.reply('_Conversion failed_');
                }

                const buffer = fs.readFileSync(outputPath);

                await sock.sendMessage(m.chat, {
                  audio: buffer,
                  mimetype: 'audio/mpeg'
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
                audio: buffer,
                mimetype: 'audio/mpeg'
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
