/**
 * url.js — plugins/url.js
 * Command: .url (reply to image/video/audio)
 * Uploads media to a free host — no API key needed.
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const axios    = require('axios');
const FormData = require('form-data');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Free upload hosts (tried in order until one works) ─────────────────
const UPLOAD_HOSTS = [
  {
    name: 'ar-hosting',
    upload: async (buffer, mime, filename) => {
      const form = new FormData();
      form.append('file', buffer, { filename, contentType: mime });
      const res = await axios.post('https://ar-hosting.pages.dev/upload', form, {
        headers: { ...form.getHeaders() },
        timeout: 30000,
        maxBodyLength: Infinity
      });
      return res.data?.url || res.data?.data || null;
    }
  },
  {
    name: 'telegra.ph',
    upload: async (buffer, mime, filename) => {
      const form = new FormData();
      form.append('file', buffer, { filename, contentType: mime });
      const res = await axios.post('https://telegra.ph/upload', form, {
        headers: { ...form.getHeaders() },
        timeout: 30000,
        maxBodyLength: Infinity
      });
      const data = res.data;
      if (Array.isArray(data) && data[0]?.src) return `https://telegra.ph${data[0].src}`;
      return null;
    }
  },
  {
    name: 'tmpfiles',
    upload: async (buffer, mime, filename) => {
      const form = new FormData();
      form.append('file', buffer, { filename, contentType: mime });
      const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
        headers: { ...form.getHeaders() },
        timeout: 30000,
        maxBodyLength: Infinity
      });
      return res.data?.data?.url?.replace('tmpfiles.org/', 'tmpfiles.org/dl/') || null;
    }
  }
];

async function uploadBuffer(buffer, mime, filename) {
  for (const host of UPLOAD_HOSTS) {
    try {
      const url = await host.upload(buffer, mime, filename);
      if (url) return url;
    } catch (e) {
      console.error(`[url] ${host.name} failed:`, e.message);
    }
  }
  throw new Error('all upload hosts failed');
}

function getMimeAndExt(mtype, msg) {
  if (mtype === 'imageMessage')    return { mime: 'image/jpeg',  ext: 'jpg'  };
  if (mtype === 'videoMessage')    return { mime: 'video/mp4',   ext: 'mp4'  };
  if (mtype === 'stickerMessage')  return { mime: 'image/webp',  ext: 'webp' };
  if (mtype === 'documentMessage') {
    const mt = msg?.documentMessage?.mimetype || 'application/octet-stream';
    const fn = msg?.documentMessage?.fileName || 'file';
    const ex = fn.includes('.') ? fn.split('.').pop() : 'bin';
    return { mime: mt, ext: ex };
  }
  if (mtype === 'audioMessage') {
    const mt = msg?.audioMessage?.mimetype || 'audio/mpeg';
    return { mime: mt, ext: mt.includes('ogg') ? 'ogg' : 'mp3' };
  }
  return { mime: 'application/octet-stream', ext: 'bin' };
}

module.exports = {
  command:  ['url'],
  category: 'media',
  desc:     'Upload media and get a URL — no API key needed',
  usage:    '.url (reply to any media)',

  async execute(sock, m, ctx) {
    const { reply } = ctx;

    if (!m.quoted) return reply('_reply to an image, video, audio or document_');

    const mtype = m.quoted.mtype;
    const supported = ['imageMessage','videoMessage','audioMessage','stickerMessage','documentMessage'];
    if (!supported.includes(mtype)) return reply('_reply to an image, video, audio or document_');

    await reply('_uploading_');

    try {
      const buffer = await m.quoted.download().catch(() => null);
      if (!buffer || buffer.length === 0) return reply('_failed to download media_');

      const { mime, ext } = getMimeAndExt(mtype, m.quoted.message);
      const filename = `upload_${Date.now()}.${ext}`;

      const url = await uploadBuffer(buffer, mime, filename);
      return reply(`_${url}_`);

    } catch (err) {
      console.error('url error:', err.message);
      return reply('_failed to upload - all hosts unavailable_');
    }
  }
};
