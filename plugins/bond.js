'use strict';

const fs   = require('fs');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DATABASE_DIR)) fs.mkdirSync(DATABASE_DIR, { recursive: true });

const BOND_FILE = path.join(DATABASE_DIR, 'sticker_bonds.json');

const readBonds  = () => {
  try { if (fs.existsSync(BOND_FILE)) return JSON.parse(fs.readFileSync(BOND_FILE, 'utf8')); } catch (e) {}
  return {};
};
const writeBonds = (b) => { try { fs.writeFileSync(BOND_FILE, JSON.stringify(b, null, 2)); } catch (e) {} };

// Convert any Baileys byte format to hex string
function toHex(raw) {
  if (!raw) return null;
  try {
    if (Buffer.isBuffer(raw))               return raw.toString('hex');
    if (raw instanceof Uint8Array)          return Buffer.from(raw).toString('hex');
    if (raw?.type === 'Buffer' && raw.data) return Buffer.from(raw.data).toString('hex');
    if (typeof raw === 'string')            return raw;
  } catch (_) {}
  return null;
}

// Get fileEncSha256 from a stickerMessage object
// This is the AES-encrypted content hash — identical for same sticker, always
function getStickerHash(stickerMsg) {
  if (!stickerMsg) return null;
  // Try fileEncSha256 first (most stable), then fileSha256 as fallback
  return toHex(stickerMsg.fileEncSha256) || toHex(stickerMsg.fileSha256) || null;
}

// Extract the quoted stickerMessage from ALL possible locations smsg/Baileys sets it
function getQuotedStickerMsg(m) {
  // Most common: user replied to a sticker with .bond ping
  // Baileys puts quoted content in extendedTextMessage.contextInfo
  const ext = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
  if (ext) return ext;

  // smsg sets m.quoted.message = the quoted message object
  const q = m.quoted?.message?.stickerMessage;
  if (q) return q;

  // Fallback: direct contextInfo on any message type
  const ctxMsg =
    m.message?.imageMessage?.contextInfo?.quotedMessage?.stickerMessage ||
    m.message?.videoMessage?.contextInfo?.quotedMessage?.stickerMessage ||
    m.message?.audioMessage?.contextInfo?.quotedMessage?.stickerMessage ||
    null;
  if (ctxMsg) return ctxMsg;

  return null;
}

module.exports = {
  command:  ['bond', 'unbond', 'unbondall', 'listbond'],
  owner:    true,
  category: 'app',
  desc:     'Bind stickers to commands',

  async execute(sock, m, ctx) {
    const { command, args, text, reply, prefix } = ctx;

    if (command === 'bond') {
      if (!text) return reply(
        `_reply to a sticker:_\n*.bond <command>*\n_example:_ *.bond ping*`
      );

      const stickerMsg = getQuotedStickerMsg(m);
      if (!stickerMsg) return reply('_reply to a sticker_');

      const hash = getStickerHash(stickerMsg);
      if (!hash) return reply('_could not read sticker hash — forward a fresh copy of the sticker_');

      let targetCmd = text.trim();
      const allPfx = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',').map(p => p.trim());
      for (const p of allPfx) {
        if (targetCmd.startsWith(p)) { targetCmd = targetCmd.slice(p.length).trim(); break; }
      }
      if (!targetCmd) return reply('_invalid command_');

      const bonds = readBonds();
      bonds[hash] = targetCmd;
      writeBonds(bonds);
      if (global.pluginLoader) global.pluginLoader.reload();

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
      return reply(`_bonded ✅ — send that sticker to trigger_ *${prefix}${targetCmd}*`);
    }

    if (command === 'unbond') {
      if (args[0]?.toLowerCase() === 'all') {
        writeBonds({});
        if (global.pluginLoader) global.pluginLoader.reload();
        return reply('_all bonds cleared ✅_');
      }

      const bonds = readBonds();

      // Method 1: reply to the bonded sticker
      const stickerMsg = getQuotedStickerMsg(m);
      if (stickerMsg) {
        const hash = getStickerHash(stickerMsg);
        if (!hash || !bonds[hash]) return reply('_sticker not bonded_');
        const removed = bonds[hash];
        delete bonds[hash];
        writeBonds(bonds);
        if (global.pluginLoader) global.pluginLoader.reload();
        return reply(`_unbonded_ *${prefix}${removed}*`);
      }

      // Method 2: .unbond <commandname>
      if (args[0]) {
        let targetCmd = args[0].trim();
        const allPfx = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',').map(p => p.trim());
        for (const p of allPfx) {
          if (targetCmd.startsWith(p)) { targetCmd = targetCmd.slice(p.length).trim(); break; }
        }
        const entry = Object.entries(bonds).find(([, cmd]) => cmd === targetCmd);
        if (!entry) return reply(`_no bond found for_ *${prefix}${targetCmd}*`);
        delete bonds[entry[0]];
        writeBonds(bonds);
        if (global.pluginLoader) global.pluginLoader.reload();
        return reply(`_unbonded_ *${prefix}${targetCmd}*`);
      }

      return reply(`_reply to bonded sticker OR:_\n*.unbond <command>*\n*.unbond all*`);
    }

    if (command === 'unbondall') {
      writeBonds({});
      if (global.pluginLoader) global.pluginLoader.reload();
      return reply('_all bonds cleared ✅_');
    }

    if (command === 'listbond') {
      const bonds   = readBonds();
      const entries = Object.entries(bonds);
      if (!entries.length) return reply('_no bonded stickers_');
      let txt = `*BONDED STICKERS*\n_Total: ${entries.length}_\n\n`;
      entries.forEach(([, cmd], i) => {
        txt += `${String(i + 1).padStart(2, '0')}. _${prefix}${cmd}_\n`;
      });
      return reply(txt);
    }
  }
};
