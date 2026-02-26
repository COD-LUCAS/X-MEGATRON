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

module.exports = {
  command: ['bond', 'unbond', 'listbond'],
  owner: true,

  async execute(sock, m, context) {
    const { command, args, text, prefix } = context;

    if (command === 'bond') {
      if (!text) {
        return m.reply(`_Reply to sticker: ${prefix}bond <command>_\n\n_Example: ${prefix}bond kick_`);
      }

      if (!m.quoted) {
        return m.reply(`_Reply to a sticker_`);
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
        return m.reply(`_Reply to a sticker_`);
      }

      let targetCommand = text.trim();

      const allPrefixes = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',');
      for (const p of allPrefixes) {
        if (targetCommand.startsWith(p)) {
          targetCommand = targetCommand.slice(p.length);
          break;
        }
      }

      if (!targetCommand) {
        return m.reply(`_Invalid command_`);
      }

      const bonds = readBonds();
      bonds[stickerHash] = targetCommand;
      writeBonds(bonds);

      return m.reply(`_Bonded sticker to ${prefix}${targetCommand}_`);
    }

    if (command === 'unbond') {
      if (!m.quoted) {
        return m.reply(`_Reply to bonded sticker_`);
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
        return m.reply('_Failed_');
      }

      const bonds = readBonds();

      if (!bonds[stickerHash]) {
        return m.reply('_Sticker not bonded_');
      }

      const boundCommand = bonds[stickerHash];
      delete bonds[stickerHash];
      writeBonds(bonds);

      return m.reply(`_Unbonded ${prefix}${boundCommand}_`);
    }

    if (command === 'listbond') {
      const bonds = readBonds();
      const entries = Object.entries(bonds);

      if (!entries.length) {
        return m.reply('_No bonded stickers_');
      }

      let txt = `*BONDED STICKERS*\n\n_Total: ${entries.length}_\n\n`;
      entries.forEach(([hash, cmd], i) => {
        txt += `${i + 1}. _${prefix}${cmd}_\n`;
      });

      return m.reply(txt);
    }
  },
};
