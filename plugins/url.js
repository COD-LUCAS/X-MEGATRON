'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const CATBOX_UPLOAD = 'https://catbox.moe/user/api.php';

const getTempPath = (filename) => path.join(TMP_DIR, `${Date.now()}_${filename}`);
const cleanTemp = (file) => {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
};

module.exports = {
  command: ['url'],
  category: 'tools',
  desc: 'Upload media to Catbox and get URL',
  usage: '.url (reply to image/video/audio/document)',

  async execute(sock, m, context) {
    const { reply, react, isOwner, isSudo } = context;
    const mode = (process.env.MODE || 'public').toLowerCase();
    const uid = m.sender.split('@')[0];
    
    // Permission check
    if (mode === 'private') {
      const ownerNum = (process.env.OWNER || '').split(',')[0];
      if (uid !== ownerNum && !isSudo && !isOwner) {
        return reply('_Owner only_');
      }
    }

    // Check reply
    if (!m.quoted) {
      return reply('_Reply to an image, video, audio, or document_');
    }

    const quotedMsg = m.quoted.message;
    if (!quotedMsg) {
      return reply('_Could not find quoted message_');
    }

    // Check for media
    const isImage = quotedMsg.imageMessage;
    const isVideo = quotedMsg.videoMessage;
    const isAudio = quotedMsg.audioMessage;
    const isDocument = quotedMsg.documentMessage;

    if (!isImage && !isVideo && !isAudio && !isDocument) {
      return reply('_Reply to an image, video, audio, or document_');
    }

    await react('⏳');

    try {
      // Download media
      const mediaBuffer = await m.quoted.download();
      if (!mediaBuffer) {
        await react('❌');
        return reply('_Failed to download media_');
      }

      // Save temp file
      const ext = isImage ? 'jpg' : (isVideo ? 'mp4' : (isAudio ? 'mp3' : 'bin'));
      const tempFile = getTempPath(`upload.${ext}`);
      fs.writeFileSync(tempFile, mediaBuffer);

      // Upload to Catbox
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', fs.createReadStream(tempFile));

      const response = await axios.post(CATBOX_UPLOAD, form, {
        headers: { ...form.getHeaders() },
        timeout: 60000
      });

      const url = response.data.trim();

      // Clean temp file immediately
      cleanTemp(tempFile);
      mediaBuffer = null;

      // Check if upload was successful
      if (!url.includes('catbox.moe')) {
        await react('❌');
        return reply('_Upload failed_');
      }

      await react('✅');
      await reply(`_Uploaded_\n\n${url}`);

    } catch (err) {
      await react('❌');
      reply(`_Failed: ${err.message}_`);
    }
  }
};