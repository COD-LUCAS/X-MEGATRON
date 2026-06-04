'use strict';

const fs   = require('fs');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DATABASE_DIR)) fs.mkdirSync(DATABASE_DIR, { recursive: true });

const BOND_FILE = path.join(DATABASE_DIR, 'sticker_bonds.json');

const readBonds  = () => {
  try {
    if (fs.existsSync(BOND_FILE)) return JSON.parse(fs.readFileSync(BOND_FILE, 'utf8'));
  } catch (e) {}
  return {};
};

const writeBonds = (bonds) => {
  try { fs.writeFileSync(BOND_FILE, JSON.stringify(bonds, null, 2)); } catch (e) {}
};

// ── Reliable sticker fingerprint ──────────────────────────────────────
// fileSha256 changes between sender/receiver contexts in newer Baileys.
// fileEncSha256 + mediaKey are stable across contexts.
// We try multiple fields and use whichever exists, in priority order.
function getStickerFingerprint(stickerMsg) {
  if (!stickerMsg) return null;

  const tryBuffer = (val) => {
    if (!val) return null;
    try {
      if (Buffer.isBuffer(val))               return val.toString('hex');
      if (val instanceof Uint8Array)          return Buffer.from(val).toString('hex');
      if (typeof val === 'string')            return val;
      if (val?.type === 'Buffer' && val.data) return Buffer.from(val.data).toString('hex');
    } catch (_) {}
    return null;
  };

  // Priority: fileEncSha256 (most stable) → fileSha256 → mediaKey
  return (
    tryBuffer(stickerMsg.fileEncSha256) ||
    tryBuffer(stickerMsg.fileSha256)    ||
    tryBuffer(stickerMsg.mediaKey)      ||
    null
  );
}

// Extract sticker from all possible message positions
function extractSticker(m, isQuoted = false) {
  if (isQuoted) {
    return (
      m.quoted?.message?.stickerMessage ||
      m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage ||
      null
    );
  }
  return (
    m.message?.stickerMessage ||
    m.msg ||  // smsg() sets m.msg to the inner content
    null
  );
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
        `_reply to a sticker with:_\n*.bond <command>*\n_example:_ *.bond ping*`
      );

      const stickerMsg = extractSticker(m, true);
      if (!stickerMsg) return reply('_reply to a sticker_');

      const fp = getStickerFingerprint(stickerMsg);
      if (!fp) return reply('_could not read sticker ID — try sending the sticker again_');

      let targetCmd = text.trim();
      const allPrefixes = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',').map(p => p.trim());
      for (const p of allPrefixes) {
        if (targetCmd.startsWith(p)) { targetCmd = targetCmd.slice(p.length).trim(); break; }
      }
      if (!targetCmd) return reply('_invalid command_');

      const bonds = readBonds();
      bonds[fp] = targetCmd;
      writeBonds(bonds);

      if (global.pluginLoader) global.pluginLoader.reload();

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
      return reply(`_bonded ✅ — send that sticker to trigger_ *${prefix}${targetCmd}*`);
    }

    // ── .unbond ────────────────────────────────────────────────────
    if (command === 'unbond') {

      // .unbond all
      if (args[0]?.toLowerCase() === 'all') {
        writeBonds({});
        if (global.pluginLoader) global.pluginLoader.reload();
        return reply('_all bonds cleared ✅_');
      }

      const bonds = readBonds();

      // Reply to sticker
      const quotedSticker = extractSticker(m, true);
      if (quotedSticker) {
        const fp = getStickerFingerprint(quotedSticker);
        if (!fp || !bonds[fp]) return reply('_sticker not bonded_');
        const removed = bonds[fp];
        delete bonds[fp];
        writeBonds(bonds);
        if (global.pluginLoader) global.pluginLoader.reload();
        return reply(`_unbonded_ *${prefix}${removed}*`);
      }

      // .unbond <command>
      if (args[0]) {
        let targetCmd = args[0].trim();
        const allPrefixes = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',').map(p => p.trim());
        for (const p of allPrefixes) {
          if (targetCmd.startsWith(p)) { targetCmd = targetCmd.slice(p.length).trim(); break; }
        }
        const entry = Object.entries(bonds).find(([, cmd]) => cmd === targetCmd);
        if (!entry) return reply(`_no bond found for_ *${prefix}${targetCmd}*`);
        delete bonds[entry[0]];
        writeBonds(bonds);
        if (global.pluginLoader) global.pluginLoader.reload();
        return reply(`_unbonded_ *${prefix}${targetCmd}*`);
      }

      return reply(
        `_reply to bonded sticker OR:_\n` +
        `*.unbond <command>*\n` +
        `*.unbond all*`
      );
    }

    // ── .unbondall ─────────────────────────────────────────────────
    if (command === 'unbondall') {
      writeBonds({});
      if (global.pluginLoader) global.pluginLoader.reload();
      return reply('_all bonds cleared ✅_');
    }

    // ── .listbond ──────────────────────────────────────────────────
    if (command === 'listbond') {
      const bonds  = readBonds();
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
