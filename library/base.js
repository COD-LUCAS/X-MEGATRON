/**
 * library/base.js
 * Shared utilities: profile picture (full screen), admin check
 */

'use strict';

const sharp = require('sharp');

/**
 * Convert any image to portrait JPEG (640x800) for full-screen WhatsApp DP.
 * Baileys generateProfilePicture() receives this and keeps the portrait ratio.
 * Result: WhatsApp displays it full-screen, no square crop.
 */
const toFullScreenBuf = async (input) => {
  let buf = input;

  // If it's a URL object or string, fetch it first
  if (typeof input === 'string' || input?.url) {
    const url = typeof input === 'string' ? input : input.url;
    const axios = require('axios');
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    buf = Buffer.from(res.data);
  }

  // Get original dimensions first
  const meta = await sharp(buf).metadata();
  const isPortrait = meta.height >= meta.width;

  // Target: 640x800 (4:5) — tall enough for full screen, compatible with all WhatsApp versions
  // 'contain' preserves the image inside the frame — no cropping, adds black bars if needed
  return sharp(buf)
    .resize(640, 800, {
      fit: isPortrait ? 'cover' : 'contain',
      position: 'center',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .jpeg({ quality: 95 })
    .toBuffer();
};

/**
 * Get live admin status from group metadata.
 * Never use cached context.isBotAdmin — always call this during enforcement.
 * Returns { botIsAdmin, senderIsAdmin }
 */
const getAdminStatus = async (sock, jid, senderJid) => {
  try {
    const meta       = await sock.groupMetadata(jid);
    const botNum     = sock.user?.id?.split(':')[0] || '';
    const senderNum  = (senderJid || '').split('@')[0];

    const isAdminJid = (p) =>
      p.admin === 'admin' || p.admin === 'superadmin';

    const botIsAdmin    = meta.participants.some(p => p.id.split('@')[0] === botNum    && isAdminJid(p));
    const senderIsAdmin = meta.participants.some(p => p.id.split('@')[0] === senderNum && isAdminJid(p));

    return { botIsAdmin, senderIsAdmin, participants: meta.participants };
  } catch (_) {
    return { botIsAdmin: false, senderIsAdmin: false, participants: [] };
  }
};

module.exports = { toFullScreenBuf, getAdminStatus };