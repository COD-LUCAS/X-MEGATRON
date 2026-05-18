
'use strict';

const fs       = require('fs');
const path     = require('path');
const axios    = require('axios');
const FormData = require('form-data');

const TMP = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

const react = async (sock, m, e) => {
  try { await sock.sendMessage(m.chat, { react: { text: e, key: m.key } }); } catch (_) {}
};

module.exports = {
  command: ['url', 'upload', 'tourl'],
  category: 'tools',
  desc: 'Upload media to Catbox and get URL',
  usage: '.url (reply to image/video/audio/document)',

  async execute(sock, m, context) {
    const { reply } = context;

    if (!m.quoted) return reply('_Reply to an image, video, audio, or document_');

    const mtype = m.quoted.mtype || '';
    if (!mtype.includes('image') && !mtype.includes('video') && !mtype.includes('audio') && !mtype.includes('document')) {
      return reply('_Reply to an image, video, audio, or document_');
    }

    await react(sock, m, '⏳');

    const ext      = mtype.includes('image') ? 'jpg' : mtype.includes('video') ? 'mp4' : mtype.includes('audio') ? 'mp3' : 'bin';
    const tmpFile  = path.join(TMP, `${Date.now()}.${ext}`);

    try {
      const buf = await m.quoted.download();
      if (!buf?.length) { await react(sock, m, '❌'); return reply('_Download failed_'); }

      fs.writeFileSync(tmpFile, buf);

      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', fs.createReadStream(tmpFile));

      const res = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders(),
        timeout: 60000,
      });

      try { fs.unlinkSync(tmpFile); } catch (_) {}

      const url = (res.data || '').trim();
      if (!url.includes('catbox.moe')) { await react(sock, m, '❌'); return reply('_Upload failed_'); }

      await react(sock, m, '✅');
      return reply(url);

    } catch (e) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      await react(sock, m, '❌');
      return reply(`_Failed: ${e.message}_`);
    }
  },
};