'use strict';

const fs   = require('fs');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DATABASE_DIR)) fs.mkdirSync(DATABASE_DIR, { recursive: true });

const BOND_FILE = path.join(DATABASE_DIR, 'sticker_bonds.json');

const readBonds = () => {
  try {
    if (fs.existsSync(BOND_FILE)) return JSON.parse(fs.readFileSync(BOND_FILE, 'utf8'));
  } catch (e) {}
  return {};
};

const writeBonds = (bonds) => {
  try { fs.writeFileSync(BOND_FILE, JSON.stringify(bonds, null, 2)); } catch (e) {}
};

// Extract hash from ANY sticker message shape Baileys gives us
function extractHash(stickerMsg) {
  if (!stickerMsg) return null;
  const raw = stickerMsg.fileSha256 || stickerMsg.message?.stickerMessage?.fileSha256;
  if (!raw) return null;
  return Buffer.from(raw).toString('base64');
}

module.exports = {
  command:  ['bond', 'unbond', 'unbondall', 'listbond'],
  owner:    true,
  category: 'app',
  desc:     'Bind stickers to commands',

  async execute(sock, m, ctx) {
    const { command, args, text, reply, prefix } = ctx;

    // ── .bond <command> — reply to sticker ──────────────────────
    if (command === 'bond') {
      if (!text) return reply(
        `_reply to a sticker with:_ *.bond <command>*\n_example:_ *.bond ping*`
      );

      const quotedSticker =
        m.quoted?.message?.stickerMessage ||
        m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage ||
        null;

      const hash = extractHash(quotedSticker);
      if (!hash) return reply('_reply to a sticker_');

      // Strip prefix from command if user included it
      let targetCmd = text.trim();
      const allPrefixes = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',').map(p => p.trim());
      for (const p of allPrefixes) {
        if (targetCmd.startsWith(p)) { targetCmd = targetCmd.slice(p.length).trim(); break; }
      }
      if (!targetCmd) return reply('_invalid command_');

      const bonds = readBonds();
      bonds[hash] = targetCmd;
      writeBonds(bonds);

      // Hot reload so new bond works immediately without restart
      if (global.pluginLoader) global.pluginLoader.reload();

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
      return reply(`_bonded ✅ — send that sticker to trigger_ *${prefix}${targetCmd}*`);
    }

    // ── .unbond — reply to sticker OR .unbond <command> ─────────
    if (command === 'unbond') {
      const bonds = readBonds();

      // Method 1: reply to sticker
      const quotedSticker =
        m.quoted?.message?.stickerMessage ||
        m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage ||
        null;

      if (quotedSticker) {
        const hash = extractHash(quotedSticker);
        if (!hash || !bonds[hash]) return reply('_sticker not bonded_');
        const removed = bonds[hash];
        delete bonds[hash];
        writeBonds(bonds);
        if (global.pluginLoader) global.pluginLoader.reload();
        return reply(`_unbonded_ *${prefix}${removed}*`);
      }

      // Method 2: .unbond <command>
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
        `_reply to bonded sticker OR:_\n*.unbond <command>*\n*.unbond all* _— remove all bonds_`
      );
    }

    // ── .unbond all (alias) ──────────────────────────────────────
    if (command === 'unbondall' || (command === 'unbond' && args[0]?.toLowerCase() === 'all')) {
      writeBonds({});
      if (global.pluginLoader) global.pluginLoader.reload();
      return reply('_all bonds cleared ✅_');
    }

    // ── .listbond ────────────────────────────────────────────────
    if (command === 'listbond') {
      const bonds = readBonds();
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
