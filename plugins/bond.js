const fs = require('fs');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DATABASE_DIR)) {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

const BOND_FILE = path.join(DATABASE_DIR, 'sticker_bonds.json');

const readBonds = () => {
  try {
    if (fs.existsSync(BOND_FILE)) {
      return JSON.parse(fs.readFileSync(BOND_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
};

const writeBonds = (bonds) => {
  fs.writeFileSync(BOND_FILE, JSON.stringify(bonds, null, 2));
};

const extractDigits = (val) => val.replace(/[^0-9]/g, '');

const normalizeJid = (input) => {
  if (!input) return '';
  const digits = extractDigits(input);
  if (!digits) return '';
  if (input.includes('@lid')) return digits + '@lid';
  if (input.includes('@s.whatsapp.net')) return digits + '@s.whatsapp.net';
  return digits + '@s.whatsapp.net';
};

const jidMatchesSuffix = (a, b) => {
  const da = extractDigits(a);
  const db = extractDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 7 && db.length >= 7) return da.slice(-10) === db.slice(-10);
  return false;
};

module.exports = {
  command: ['bond', 'unbond', 'listbond'],
  owner: true,

  async execute(sock, m, context) {
    const { command, args, text, prefix, sender } = context;

    if (command === 'bond') {
      if (!text) {
        return m.reply(`*STICKER BOND*

Bind a sticker to execute a command automatically

*Usage:*
Reply to a sticker: ${prefix}bond <command>

*Examples:*
${prefix}bond kick
${prefix}bond vv
${prefix}bond ping

*Note:*
• Only owner can bond stickers
• Anyone can use bonded stickers
• Use ${prefix}unbond to remove bond`);
      }

      if (!m.quoted) {
        return m.reply(`_Reply to a sticker_\n_Ex: ${prefix}bond kick_`);
      }

      let stickerHash = null;

      if (m.quoted.message?.stickerMessage?.fileSha256) {
        stickerHash = m.quoted.message.stickerMessage.fileSha256.toString('base64');
      } else if (m.quoted.msg?.fileSha256) {
        stickerHash = m.quoted.msg.fileSha256.toString('base64');
      } else if (m.quoted[m.quoted.type]?.fileSha256) {
        stickerHash = m.quoted[m.quoted.type].fileSha256.toString('base64');
      }

      if (!stickerHash) {
        return m.reply(`_Reply to a sticker_\n_Ex: ${prefix}bond kick_`);
      }

      let targetCommand = text.trim();
      if (targetCommand.startsWith(prefix)) {
        targetCommand = targetCommand.slice(prefix.length);
      }

      if (!targetCommand) {
        return m.reply(`_Invalid command!_\n\nExample: ${prefix}bond kick`);
      }

      const bonds = readBonds();
      bonds[stickerHash] = targetCommand;
      writeBonds(bonds);

      return m.reply(`_Sticked command ${targetCommand} to this sticker!_`);
    }

    if (command === 'unbond') {
      if (!m.quoted) {
        return m.reply(`_Reply to a bonded sticker!_\n\nExample:\n[Reply to sticker]\n${prefix}unbond`);
      }

      let stickerHash = null;

      if (m.quoted.message?.stickerMessage?.fileSha256) {
        stickerHash = m.quoted.message.stickerMessage.fileSha256.toString('base64');
      } else if (m.quoted.msg?.fileSha256) {
        stickerHash = m.quoted.msg.fileSha256.toString('base64');
      } else if (m.quoted[m.quoted.type]?.fileSha256) {
        stickerHash = m.quoted[m.quoted.type].fileSha256.toString('base64');
      }

      if (!stickerHash) {
        return m.reply('_Failed!_');
      }

      const bonds = readBonds();

      if (!bonds[stickerHash]) {
        return m.reply('_This sticker is not bonded to any command_');
      }

      const boundCommand = bonds[stickerHash];
      delete bonds[stickerHash];
      writeBonds(bonds);

      return m.reply(`_Sticker unbonded from command: ${prefix}${boundCommand}_`);
    }

    if (command === 'listbond') {
      const bonds = readBonds();
      const entries = Object.entries(bonds);

      if (!entries.length) {
        return m.reply('_No bonded stickers_');
      }

      let txt = `*BONDED STICKERS*\n\nTotal: ${entries.length}\n\n`;
      entries.forEach(([hash, cmd], i) => {
        txt += `${i + 1}. ${prefix}${cmd}\n`;
      });

      return m.reply(txt);
    }
  },
};
