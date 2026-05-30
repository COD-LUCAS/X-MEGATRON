
/**
 * sticker.js — plugins/sticker.js
 * Commands: .sticker .s .setstickerpackname
 *
 * .sticker / .s          — convert image/video to sticker with pack name from DB
 * .setstickerpackname    — set custom pack name for this sender (owner only)
 */

'use strict';

const fs          = require('fs');
const path        = require('path');
const ffmpeg      = require('fluent-ffmpeg');
const ffmpegPath  = require('ffmpeg-static');
const config      = require('../config');

ffmpeg.setFfmpegPath(ffmpegPath);

const TMP_DIR  = path.join(__dirname, '..', 'database', 'tmp');
const PACK_DB  = path.join(__dirname, '..', 'database', 'stickerpack.json');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Pack DB ───────────────────────────────────────────────────────────
function loadPackDB() {
  try { if (fs.existsSync(PACK_DB)) return JSON.parse(fs.readFileSync(PACK_DB, 'utf8')); } catch (_) {}
  return {};
}

function savePackDB(data) {
  try { fs.writeFileSync(PACK_DB, JSON.stringify(data, null, 2)); } catch (_) {}
}

function getPackForSender(sender) {
  const db = loadPackDB();
  if (db[sender]) return db[sender];
  // Fall back to global default from config
  return {
    packname: config.sticker?.packname || '𐍇 - 𐌼𐌴𐌾𐌰𐍄𐍂𐍈𐍀',
    author:   config.sticker?.author   || 'COD-LUCAS',
  };
}

// ── Tmp helpers ───────────────────────────────────────────────────────
const tmpFile = (ext) => path.join(TMP_DIR, `stk_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
const del = (...files) => files.forEach(f => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });

// ── Exif writer ───────────────────────────────────────────────────────
async function addExif(webpBuffer, packname, author) {
  try {
    const { writeExifImg } = require('../library/exif');
    const webp = require('node-webpmux');

    const tmpIn  = tmpFile('webp');
    const tmpOut = tmpFile('webp');
    fs.writeFileSync(tmpIn, webpBuffer);

    const img  = new webp.Image();
    const json = {
      'sticker-pack-id':        'https://github.com/COD-LUCAS/x-megatron',
      'sticker-pack-name':      packname || '𐍇 - 𐌼𐌴𐌾𐌰𐍄𐍂𐍈𐍀',
      'sticker-pack-publisher': author   || 'COD-LUCAS',
      'emojis': ['']
    };

    const exifAttr = Buffer.from([
      0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,
      0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,
      0x00,0x00,0x16,0x00,0x00,0x00
    ]);
    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif     = Buffer.concat([exifAttr, jsonBuff]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);

    await img.load(tmpIn);
    del(tmpIn);
    img.exif = exif;
    await img.save(tmpOut);

    const result = fs.readFileSync(tmpOut);
    del(tmpOut);
    return result;
  } catch (_) {
    return webpBuffer; // return without exif on fail
  }
}

// ── Converters ────────────────────────────────────────────────────────
const imageToSticker = (buffer) => new Promise((resolve, reject) => {
  const input  = tmpFile('jpg');
  const output = tmpFile('webp');
  fs.writeFileSync(input, buffer);

  ffmpeg(input)
    .outputOptions([
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-vcodec', 'libwebp',
      '-pix_fmt', 'yuva420p',
      '-lossless', '0',
      '-qscale', '50',
      '-preset', 'default',
      '-loop', '0',
      '-an'
    ])
    .save(output)
    .on('end', () => {
      const r = fs.readFileSync(output);
      del(input, output);
      resolve(r);
    })
    .on('error', (e) => { del(input, output); reject(e); });
});

const videoToSticker = (buffer) => new Promise((resolve, reject) => {
  const input  = tmpFile('mp4');
  const output = tmpFile('webp');
  fs.writeFileSync(input, buffer);

  ffmpeg(input)
    .outputOptions([
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15',
      '-vcodec', 'libwebp',
      '-pix_fmt', 'yuva420p',
      '-lossless', '0',
      '-qscale', '50',
      '-preset', 'default',
      '-loop', '0',
      '-an',
      '-t', '10'
    ])
    .save(output)
    .on('end', () => {
      const r = fs.readFileSync(output);
      del(input, output);
      resolve(r);
    })
    .on('error', (e) => { del(input, output); reject(e); });
});

// ── Plugin ────────────────────────────────────────────────────────────
module.exports = {
  command:  ['sticker', 's', 'setstickerpackname'],
  category: 'converter',
  desc:     'Convert image/video to sticker | Set custom sticker pack name',
  usage:    '.sticker (reply image/video) | .setstickerpackname packname;author',

  async execute(sock, m, ctx) {
    const { command, text, reply, isOwner } = ctx;

    // ── .setstickerpackname ────────────────────────────────────────
    if (command === 'setstickerpackname') {
      if (!isOwner) return reply('_owner only command_');

      if (!text) return reply(
        `_current pack:_\n` +
        `_packname: ${config.sticker?.packname || '𐍇 - 𐌼𐌴𐌾𐌰𐍄𐍂𐍈𐍀'}_\n` +
        `_author: ${config.sticker?.author || 'COD-LUCAS'}_\n\n` +
        `_usage: .setstickerpackname packname;author_\n` +
        `_example: .setstickerpackname My Bot;Owner Name_\n\n` +
        `_.setstickerpackname reset — restore default_`
      );

      if (text.trim().toLowerCase() === 'reset') {
        const db = loadPackDB();
        delete db[m.sender];
        savePackDB(db);
        return reply(
          `_pack name reset to default_\n` +
          `_packname: ${config.sticker?.packname || '𐍇 - 𐌼𐌴𐌾𐌰𐍄𐍂𐍈𐍀'}_\n` +
          `_author: ${config.sticker?.author || 'COD-LUCAS'}_`
        );
      }

      const parts    = text.split(';');
      const packname = parts[0]?.trim();
      const author   = parts[1]?.trim() || config.sticker?.author || 'COD-LUCAS';

      if (!packname) return reply('_usage: .setstickerpackname packname;author_');

      const db = loadPackDB();
      db[m.sender] = { packname, author };
      savePackDB(db);

      return reply(
        `_sticker pack name saved_\n` +
        `_packname: ${packname}_\n` +
        `_author: ${author}_`
      );
    }

    // ── .sticker / .s ──────────────────────────────────────────────
    if (!m.quoted) return reply('_reply to an image or video_');

    const mtype = m.quoted.mtype || '';
    if (!mtype.includes('image') && !mtype.includes('video') && mtype !== 'stickerMessage')
      return reply('_reply to an image or video_');

    await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});

    try {
      const buffer = await m.quoted.download().catch(() => null);
      if (!buffer || buffer.length === 0) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
        return reply('_failed to download media_');
      }

      // Get pack info for this sender
      const pack = getPackForSender(m.sender);

      let webp;
      if (mtype.includes('video')) {
        webp = await videoToSticker(buffer);
      } else {
        webp = await imageToSticker(buffer);
      }

      // Add exif (pack name)
      webp = await addExif(webp, pack.packname, pack.author);

      await sock.sendMessage(m.chat, { sticker: webp }, { quoted: m });
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (err) {
      console.error('sticker error:', err.message);
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      return reply(`_failed: ${err.message}_`);
    }
  }
};
