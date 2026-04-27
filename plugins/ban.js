const fs   = require('fs');
const path = require('path');

const BAN_FILE = path.join(__dirname, '..', 'database', 'banned_chats.json');

const readBans  = () => { try { if (fs.existsSync(BAN_FILE)) return JSON.parse(fs.readFileSync(BAN_FILE, 'utf8')); } catch (_) {} return {}; };
const writeBans = (b) => fs.writeFileSync(BAN_FILE, JSON.stringify(b, null, 2));

// Exported so main.js can call it on every message
const isBanned = (jid) => !!readBans()[jid];

module.exports = {
  command: ['ban', 'unban', 'listban'],
  category: 'owner',
  desc: 'Ban/unban a PM or group from using the bot',
  usage: '.ban | .unban | .listban',
  owner: true,

  async execute(sock, m, context) {
    const { command, reply, prefix } = context;
    const jid  = m.chat;
    const type = m.isGroup ? 'group' : 'pm';
    const bans = readBans();

    if (command === 'ban') {
      if (bans[jid]) return reply(`_This ${type} is already banned_`);
      bans[jid] = { type, bannedAt: Date.now() };
      writeBans(bans);
      await sock.sendMessage(m.chat, { react: { text: '🚫', key: m.key } });
      return reply(`_🚫 ${type === 'group' ? 'Group' : 'User'} banned — bot will not respond here_`);
    }

    if (command === 'unban') {
      if (!bans[jid]) return reply(`_This ${type} is not banned_`);
      delete bans[jid];
      writeBans(bans);
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      return reply(`_✅ Unbanned — bot will respond again_`);
    }

    if (command === 'listban') {
      const entries = Object.entries(bans);
      if (!entries.length) return reply('_No banned chats_');
      let txt = `*BANNED CHATS* — ${entries.length}\n\n`;
      entries.forEach(([id, info], i) => {
        txt += `${i + 1}. \`${id.split('@')[0]}\` _(${info.type})_\n`;
      });
      txt += `\n_Use_ \`${prefix}unban\` _inside that chat to unban_`;
      return reply(txt);
    }
  },
};

module.exports.isBanned = isBanned;
