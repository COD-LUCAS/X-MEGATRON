const fs = require('fs');
const path = require('path');

const BOND_FILE = path.join(__dirname, '..', 'sticker_bonds.json');

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
        return m.reply(`*STICKER BOND*

Bind a sticker to execute a command

*Usage:*
Reply to a sticker: ${prefix}bond <command>

*Examples:*
${prefix}bond kick
${prefix}bond ping
${prefix}bond vv @jid

*How to use bonded stickers:*
• Simple commands: Just send the sticker
• Commands needing quotes (vv, kick): Reply to the message with the sticker

*Note:*
• Only owner can bond stickers
• Anyone can use bonded stickers
• Use ${prefix}unbond to remove
• Use ${prefix}listbond to see all bonds`);
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
