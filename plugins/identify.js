'use strict';

const fs        = require('fs');
const path      = require('path');
const axios     = require('axios');
const FormData  = require('form-data');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const getTempPath = (filename) => path.join(TMP_DIR, `${Date.now()}_${filename}`);
const cleanTemp   = (file) => {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
};

module.exports = {
  command:  ['identify'],
  category: 'tools',
  desc:     'Identify a song from audio, video, or media URL',
  usage:    '.identify <url> | reply to audio/video',

  async execute(sock, m, ctx) {
    const { reply, args } = ctx;

    const inputUrl   = args.join(' ').trim();
    const quotedText = m.quoted?.body?.trim() || m.quoted?.text?.trim() || '';
    let mediaUrl     = null;
    let filePath     = null;

    try {

      // ── Case 1: Reply to audio or video ───────────────────────
      const isAudio = m.quoted?.mtype === 'audioMessage';
      const isVideo = m.quoted?.mtype === 'videoMessage';

      if (m.quoted && (isAudio || isVideo)) {
        await reply('_identifying song from media_');

        const buffer = await m.quoted.download().catch(() => null);
        if (!buffer || buffer.length === 0) return reply('_failed to download media_');

        const ext = isAudio ? 'mp3' : 'mp4';
        filePath  = getTempPath(`identify.${ext}`);
        fs.writeFileSync(filePath, buffer);

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), {
          filename:    `identify.${ext}`,
          contentType: isAudio ? 'audio/mpeg' : 'video/mp4'
        });

        const uploadRes = await axios.post('https://ar-hosting.pages.dev/upload', form, {
          headers:          { ...form.getHeaders() },
          timeout:          40000,
          maxContentLength: Infinity,
          maxBodyLength:    Infinity
        });

        cleanTemp(filePath);
        filePath = null;

        mediaUrl = uploadRes.data?.url || uploadRes.data?.data || null;
        if (!mediaUrl) return reply('_upload failed, no url returned_');
      }

      // ── Case 2: URL from command args ─────────────────────────
      else if (inputUrl && inputUrl.startsWith('http')) {
        await reply('_identifying song from link_');
        mediaUrl = inputUrl;
      }

      // ── Case 3: URL inside quoted text message ────────────────
      else if (quotedText && quotedText.startsWith('http')) {
        await reply('_identifying song from replied link_');
        mediaUrl = quotedText;
      }

      // ── No valid input ────────────────────────────────────────
      else {
        return reply(
          '_usage_\n\n' +
          '_.identify <url>_\n' +
          '_or reply to an audio or video message_'
        );
      }

      // ── Identify via API ──────────────────────────────────────
      const res = await axios.get(
        `https://jerrycoder.oggyapi.workers.dev/tool/identify?url=${encodeURIComponent(mediaUrl)}`,
        { timeout: 30000 }
      );

      const data = res.data;

      if (data.status !== 'success' || !data.result) {
        return reply('_no song found_');
      }

      const { title, artist, image, shazam_url } = data.result;
      const fallbackImg = 'https://ar-hosting.pages.dev/1751890521453.jpg';

      const caption =
        `_song identified_\n\n` +
        `_title  : ${title}_\n` +
        `_artist : ${artist}_\n\n` +
        `_${shazam_url}_`;

      await sock.sendMessage(m.chat, {
        image:   { url: image || fallbackImg },
        caption: caption
      }, { quoted: m });

    } catch (err) {
      cleanTemp(filePath);
      console.error('identify error:', err.message);
      return reply('_failed to identify song_');
    }
  }
};
