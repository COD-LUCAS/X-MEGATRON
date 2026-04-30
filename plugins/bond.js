const fs   = require('fs');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DATABASE_DIR)) fs.mkdirSync(DATABASE_DIR, { recursive: true });

const BOND_FILE = path.join(DATABASE_DIR, 'sticker_bonds.json');

const readBonds = () => {
  try {
    if (fs.existsSync(BOND_FILE)) return JSON.parse(fs.readFileSync(BOND_FILE, 'utf8'));
  } catch (_) {}
  return {};
};

const writeBonds = (bonds) => {
  fs.writeFileSync(BOND_FILE, JSON.stringify(bonds, null, 2));
};

// fileSha256 from Baileys protobuf is Uint8Array — must Buffer.from() before base64
const extractHash = (m) => {
  // Direct sticker (owner sent sticker to trigger or for bonding by sending not replying)
  const direct = m.message?.stickerMessage?.fileSha256 || m.msg?.fileSha256;
  if (direct) return Buffer.from(direct).toString('base64');

  // Reply to a sticker
  if (m.quoted) {
    const qSticker = m.quoted.message?.stickerMessage || m.quoted.msg;
    if (qSticker?.fileSha256) return Buffer.from(qSticker.fileSha256).toString('base64');
  }

  return null;
};

const stripPrefix = (text) => {
  const prefixes = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',').map(p => p.trim()).filter(Boolean);
  for (const p of prefixes) {
    if (p && text.startsWith(p)) return text.slice(p.length).trim();
  }
  return text.trim();
};

module.exports = {
  command: ['bond', 'unbond', 'listbond'],
  owner: true,
  category: 'owner',
  desc: 'Bond a sticker to a command',
  usage: '.bond <command> (reply to sticker)',

  async execute(sock, m, context) {
    const { command, text, prefix, reply } = context;

    if (command === 'bond') {
      if (!text) {
        return reply(
          `_Usage: reply to a sticker then type_ \`${prefix}bond kick\`\n\n` +
          `_Prefix is optional —_ \`${prefix}bond kick\` _and_ \`${prefix}bond ${prefix}kick\` _both work_`
        );
      }

      if (!m.quoted) return reply(`_Reply to a sticker with_ \`${prefix}bond <command>\``);

      const hash = extractHash(m);
      if (!hash) return reply('_Quoted message is not a sticker_');

      const cmd = stripPrefix(text).toLowerCase();
      if (!cmd) return reply('_Invalid command name_');

      const bonds = readBonds();
      bonds[hash] = cmd;
      writeBonds(bonds);

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      return reply(
        `_Sticker bonded to_ \`${prefix}${cmd}\`\n` +
        `_reloading......._`
      );
    }

    if (command === 'unbond') {
      if (!m.quoted) return reply(`_Reply to the bonded sticker with_ \`${prefix}unbond\``);

      const hash = extractHash(m);
      if (!hash) return reply('_Quoted message is not a sticker_');

      const bonds = readBonds();
      if (!bonds[hash]) return reply('_This sticker has no bond_');

      const boundCmd = bonds[hash];
      delete bonds[hash];
      writeBonds(bonds);

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      return reply(`_Unbound_ \`${prefix}${boundCmd}\` _from sticker ✓_`);
    }

    if (command === 'listbond') {
      const bonds = readBonds();
      const entries = Object.entries(bonds);

      if (!entries.length) return reply('_No sticker bonds set_');

      let txt = `*STICKER BONDS* — ${entries.length} total\n\n`;
      entries.forEach(([, cmd], i) => { txt += `${i + 1}. \`${prefix}${cmd}\`\n`; });

      return reply(txt);
    }
  },
};
