'use strict';

const fs   = require('fs');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DATABASE_DIR)) fs.mkdirSync(DATABASE_DIR, { recursive: true });

const BOND_FILE  = path.join(DATABASE_DIR, 'sticker_bonds.json');
const DEBUG_FILE = path.join(DATABASE_DIR, 'bond_debug.json');

const readBonds  = () => {
  try { if (fs.existsSync(BOND_FILE)) return JSON.parse(fs.readFileSync(BOND_FILE, 'utf8')); } catch (e) {}
  return {};
};
const writeBonds = (b) => { try { fs.writeFileSync(BOND_FILE, JSON.stringify(b, null, 2)); } catch (e) {} };

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

// Try EVERY possible hash from a sticker object — return first non-null
function extractHash(stickerObj) {
  if (!stickerObj) return null;
  return (
    toHex(stickerObj.fileEncSha256) ||
    toHex(stickerObj.fileSha256)    ||
    toHex(stickerObj.mediaKey)      ||
    null
  );
}

// Collect every possible stickerMessage object from the raw message
function getAllStickerSources(m) {
  const sources = {};

  // When replying to a sticker with .bond ping
  // Baileys puts the quoted message in multiple places:

  // 1. extendedTextMessage contextInfo (most common)
  const ext = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
  if (ext) sources['extendedText.contextInfo'] = ext;

  // 2. smsg sets m.quoted.message
  if (m.quoted?.message?.stickerMessage) sources['m.quoted.message'] = m.quoted.message.stickerMessage;

  // 3. smsg sets m.quoted directly as the inner type
  if (m.quoted?.mtype === 'stickerMessage' && m.quoted?.msg) sources['m.quoted.msg'] = m.quoted.msg;

  // 4. Raw message key contextInfo stanzaId approach
  const ctx = m.message?.extendedTextMessage?.contextInfo;
  if (ctx?.quotedMessage?.stickerMessage) sources['ctx.quotedMessage'] = ctx.quotedMessage.stickerMessage;

  // 5. If user sent a sticker directly (for trigger testing)
  if (m.message?.stickerMessage) sources['direct.stickerMessage'] = m.message.stickerMessage;

  return sources;
}

module.exports = {
  command:  ['bond', 'unbond', 'unbondall', 'listbond', 'bonddebug'],
  owner:    true,
  category: 'app',
  desc:     'Bind stickers to commands',

  async execute(sock, m, ctx) {
    const { command, args, text, reply, prefix } = ctx;

    // ── .bonddebug — shows exactly what Baileys gives for the quoted sticker ──
    if (command === 'bonddebug') {
      const sources = getAllStickerSources(m);
      const out = {};

      for (const [label, sticker] of Object.entries(sources)) {
        out[label] = {
          fileEncSha256: toHex(sticker.fileEncSha256) || null,
          fileSha256:    toHex(sticker.fileSha256)    || null,
          mediaKey:      toHex(sticker.mediaKey)      || null,
          url:           sticker.url                  || null,
        };
      }

      // Also log m.quoted keys
      out['_m.quoted_keys']   = m.quoted ? Object.keys(m.quoted) : null;
      out['_m.quoted.mtype']  = m.quoted?.mtype || null;
      out['_m.key.id']        = m.key?.id || null;

      // Save to file for inspection
      fs.writeFileSync(DEBUG_FILE, JSON.stringify(out, null, 2));

      let txt = `*BOND DEBUG*\n\n`;
      for (const [label, data] of Object.entries(out)) {
        txt += `*${label}*\n`;
        if (data && typeof data === 'object') {
          for (const [k, v] of Object.entries(data)) {
            txt += `  _${k}: ${v ? v.slice(0, 20) + '...' : 'null'}_\n`;
          }
        } else {
          txt += `  _${JSON.stringify(data)}_\n`;
        }
        txt += '\n';
      }
      txt += `_full debug saved to database/bond_debug.json_`;
      return reply(txt);
    }

    // ── .bond <command> ────────────────────────────────────────────
    if (command === 'bond') {
      if (!text) return reply(
        `_reply to a sticker:_\n*.bond <command>*\n_example:_ *.bond ping*`
      );

      const sources = getAllStickerSources(m);
      if (Object.keys(sources).length === 0) return reply('_reply to a sticker_');

      // Try each source for a valid hash
      let hash = null;
      let usedSource = null;
      for (const [label, sticker] of Object.entries(sources)) {
        const h = extractHash(sticker);
        if (h) { hash = h; usedSource = label; break; }
      }

      if (!hash) return reply('_sticker found but could not read hash — use .bonddebug to inspect_');

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
      return reply(`_bonded ✅ via ${usedSource}_\n_send that sticker to trigger_ *${prefix}${targetCmd}*`);
    }

    // ── .unbond ────────────────────────────────────────────────────
    if (command === 'unbond') {
      if (args[0]?.toLowerCase() === 'all') {
        writeBonds({});
        if (global.pluginLoader) global.pluginLoader.reload();
        return reply('_all bonds cleared ✅_');
      }

      const bonds = readBonds();

      const sources = getAllStickerSources(m);
      if (Object.keys(sources).length > 0) {
        let hash = null;
        for (const [, sticker] of Object.entries(sources)) {
          const h = extractHash(sticker);
          if (h) { hash = h; break; }
        }
        if (hash) {
          if (!bonds[hash]) return reply('_sticker not bonded_');
          const removed = bonds[hash];
          delete bonds[hash];
          writeBonds(bonds);
          if (global.pluginLoader) global.pluginLoader.reload();
          return reply(`_unbonded_ *${prefix}${removed}*`);
        }
      }

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
