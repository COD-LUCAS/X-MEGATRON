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

// Get the message ID of the quoted sticker
// stanzaId = the original message's ID, always stable
function getQuotedStickerId(m) {
  // Path 1: extendedTextMessage contextInfo (most common — .bond ping while replying)
  const ctxInfo = m.message?.extendedTextMessage?.contextInfo;
  if (ctxInfo?.stanzaId && ctxInfo?.quotedMessage?.stickerMessage) {
    return ctxInfo.stanzaId;
  }

  // Path 2: smsg sets m.quoted with the key
  if (m.quoted?.message?.stickerMessage && m.quoted?.key?.id) {
    return m.quoted.key.id;
  }

  // Path 3: quoted stanza from other message types
  const ctx2 =
    m.message?.imageMessage?.contextInfo  ||
    m.message?.videoMessage?.contextInfo  ||
    m.message?.audioMessage?.contextInfo  ||
    null;
  if (ctx2?.stanzaId && ctx2?.quotedMessage?.stickerMessage) {
    return ctx2.stanzaId;
  }

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

      const id = getQuotedStickerId(m);
      if (!id) return reply('_reply to a sticker — could not read sticker ID_');

      let targetCmd = text.trim();
      const allPrefixes = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',').map(p => p.trim());
      for (const p of allPrefixes) {
        if (targetCmd.startsWith(p)) { targetCmd = targetCmd.slice(p.length).trim(); break; }
      }
      if (!targetCmd) return reply('_invalid command_');

      const bonds = readBonds();
      bonds[id] = targetCmd;
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

      // Reply to sticker
      const id = getQuotedStickerId(m);
      if (id) {
        if (!bonds[id]) return reply('_sticker not bonded_');
        const removed = bonds[id];
        delete bonds[id];
        writeBonds(bonds);
        if (global.pluginLoader) global.pluginLoader.reload();
        return reply(`_unbonded_ *${prefix}${removed}*`);
      }

      // By command name
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
