'use strict';

const fs   = require('fs');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DATABASE_DIR)) fs.mkdirSync(DATABASE_DIR, { recursive: true });

const BOND_FILE  = path.join(DATABASE_DIR, 'sticker_bonds.json');
const readBonds  = () => {
  try { if (fs.existsSync(BOND_FILE)) return JSON.parse(fs.readFileSync(BOND_FILE, 'utf8')); } catch (e) {}
  return {};
};
const writeBonds = (b) => { try { fs.writeFileSync(BOND_FILE, JSON.stringify(b, null, 2)); } catch (e) {} };

// ── Same toHex + extractHash used by main.js getBondKey() ────────────
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

function extractHash(sm) {
  if (!sm) return null;
  return (
    toHex(sm.fileEncSha256) ||
    toHex(sm.fileSha256)    ||
    toHex(sm.mediaKey)      ||
    null
  );
}

// Pull the quoted stickerMessage object from every possible Baileys path
function getQuotedSticker(m) {
  // Path 1: replying with text — most common (.bond ping while quoting sticker)
  const ext = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
  if (ext) return ext;

  // Path 2: smsg parser puts quoted message here
  const q = m.quoted?.message?.stickerMessage;
  if (q) return q;

  // Path 3: smsg sets m.quoted.msg for the inner message type
  if (m.quoted?.mtype === 'stickerMessage' && m.quoted?.msg) return m.quoted.msg;

  // Path 4: image/video/audio reply contextInfo
  const ctx =
    m.message?.imageMessage?.contextInfo  ||
    m.message?.videoMessage?.contextInfo  ||
    m.message?.audioMessage?.contextInfo  ||
    null;
  if (ctx?.quotedMessage?.stickerMessage) return ctx.quotedMessage.stickerMessage;

  return null;
}

module.exports = {
  command:  ['bond', 'unbond', 'unbondall', 'listbond'],
  owner:    true,
  category: 'app',
  desc:     'Bind stickers to commands',

  async execute(sock, m, ctx) {
    const { command, args, text, reply, prefix } = ctx;

    // ── .bond <command> ────────────────────────────────────────────
    if (command === 'bond') {
      if (!text) return reply(
        `_reply to a sticker:_\n*.bond <command>*\n_example:_ *.bond ping*`
      );

      const sm   = getQuotedSticker(m);
      if (!sm) return reply('_reply to a sticker_');

      const hash = extractHash(sm);
      if (!hash) return reply(
        `_sticker found but hash is empty_\n` +
        `_fileEncSha256: ${toHex(sm.fileEncSha256) || 'null'}_\n` +
        `_fileSha256: ${toHex(sm.fileSha256) || 'null'}_\n` +
        `_mediaKey: ${toHex(sm.mediaKey) || 'null'}_`
      );

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
      return reply(
        `_bonded ✅_\n` +
        `_hash: ${hash.slice(0, 16)}..._\n` +
        `_send that sticker to trigger_ *${prefix}${targetCmd}*`
      );
    }

    // ── .unbond ────────────────────────────────────────────────────
    if (command === 'unbond') {
      if (args[0]?.toLowerCase() === 'all') {
        writeBonds({});
        if (global.pluginLoader) global.pluginLoader.reload();
        return reply('_all bonds cleared ✅_');
      }

      const bonds = readBonds();

      // Reply to sticker — remove by hash
      const sm = getQuotedSticker(m);
      if (sm) {
        const hash = extractHash(sm);
        if (hash) {
          if (!bonds[hash]) return reply('_sticker not bonded_');
          const removed = bonds[hash];
          delete bonds[hash];
          writeBonds(bonds);
          if (global.pluginLoader) global.pluginLoader.reload();
          return reply(`_unbonded_ *${prefix}${removed}*`);
        }
      }

      // By command name
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

    // ── .unbondall ─────────────────────────────────────────────────
    if (command === 'unbondall') {
      writeBonds({});
      if (global.pluginLoader) global.pluginLoader.reload();
      return reply('_all bonds cleared ✅_');
    }

    // ── .listbond ──────────────────────────────────────────────────
    if (command === 'listbond') {
      const bonds   = readBonds();
      const entries = Object.entries(bonds);
      if (!entries.length) return reply('_no bonded stickers_');
      let txt = `*BONDED STICKERS*\n_Total: ${entries.length}_\n\n`;
      entries.forEach(([hash, cmd], i) => {
        txt += `${String(i + 1).padStart(2, '0')}. _${prefix}${cmd}_ \`${hash.slice(0, 8)}...\`\n`;
      });
      return reply(txt);
    }
  }
};
