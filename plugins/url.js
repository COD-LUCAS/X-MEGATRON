const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

const CATBOX_UPLOAD = "https://catbox.moe/user/api.php";

const getRandom = (ext) => {
  return path.join(__dirname, '..', 'temp', `${Date.now()}${ext}`);
};

const ensureTempDir = () => {
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
};

const getExtension = (mtype) => {
  const map = {
    imageMessage: '.jpg',
    videoMessage: '.mp4',
    audioMessage: '.mp3',
    documentMessage: '.pdf',
    stickerMessage: '.webp'
  };
  return map[mtype] || '.bin';
};

module.exports = {
  command: ['url', 'tourl', 'upload'],
  category: 'utility',
  desc: 'Upload media to Catbox and get URL',
  usage: '.url (reply to media)',

  async execute(sock, m, context) {
    if (!m.quoted || !m.quoted.msg) {
      return m.reply('_📌 Reply to a media file (photo, video, audio, document, sticker)_');
    }

    const validTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    if (!validTypes.includes(m.quoted.mtype)) {
      return m.reply('_❌ No media found! Reply to an image/video/audio/document/sticker_');
    }

    ensureTempDir();

    let statusMsg;
    try {
      statusMsg = await m.reply('_⬆️ Uploading to Catbox… Please wait._');
    } catch (e) {
      statusMsg = null;
    }

    try {
      const media = await m.quoted.download();
      
      if (!media) {
        if (statusMsg) {
          await sock.sendMessage(m.chat, { 
            text: '_❌ Failed to download media_',
            edit: statusMsg.key 
          });
        }
        return m.reply('_❌ Failed to download media_');
      }

      const ext = getExtension(m.quoted.mtype);
      const filePath = getRandom(ext);

      fs.writeFileSync(filePath, media);

      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', fs.createReadStream(filePath));

      const response = await axios.post(CATBOX_UPLOAD, form, {
        headers: form.getHeaders(),
        timeout: 40000
      });

      const url = response.data.trim();

      fs.unlinkSync(filePath);

      if (!url.includes('catbox')) {
        if (statusMsg) {
          await sock.sendMessage(m.chat, { 
            text: '_❌ Upload failed. Catbox returned an error_',
            edit: statusMsg.key 
          });
        }
        return m.reply('_❌ Upload failed. Catbox returned an error_');
      }

      const successMsg = `_✅ *Uploaded Successfully!*_\n\n_📎 *URL:*_\n\`${url}\``;

      if (statusMsg) {
        await sock.sendMessage(m.chat, { 
          text: successMsg,
          edit: statusMsg.key 
        });
      } else {
        await m.reply(successMsg);
      }

    } catch (error) {
      const errorMsg = `_❌ Error:_\n\`${error.message}\``;
      
      if (statusMsg) {
        await sock.sendMessage(m.chat, { 
          text: errorMsg,
          edit: statusMsg.key 
        });
      } else {
        await m.reply(errorMsg);
      }
    }
  }
};
