const fs   = require('fs');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DATABASE_DIR)) fs.mkdirSync(DATABASE_DIR, { recursive: true });

const BAN_FILE = path.join(DATABASE_DIR, 'banned_chats.json');

// { "jid": { type: "pm"|"group", bannedAt: timestamp } }
const readBans  = () => { try { return JSON.parse(fs.readFileSync(BAN_FILE, 'utf8')); } catch { return {}; } };
const writeBans = (b) => fs.writeFileSync(BAN_FILE, JSON.stringify(b, null, 2));

// Called from main.js handler BEFORE any plugin runs — returns true if chat is banned
const isBanned  = (jid) => !!readBans()[jid];

module.exports = {
  command: ['ban', 'unban', 'listban'],
  owner: true,
  category: 'owner',
  desc: 'Ban a User or group from using the bot',
  usage: '.ban — bans current chat | .unban — unbans | .listban — show all',

  async execute(sock, m, context) {
    const { command, reply, prefix } = context;

    const jid  = m.chat;
    const type = m.isGroup ? 'group' : 'pm';

    if (command === 'ban') {
      const bans = readBans();

      if (bans[jid]) {
        return reply(`_This ${type} is already banned_`);
      }

      bans[jid] = { type, bannedAt: Date.now() };
      writeBans(bans);

      await sock.sendMessage(m.chat, { react: { text: '🚫', key: m.key } });

      const msg = type === 'group'
        ? `_🚫 This group is now banned — bot will not respond here_`
        : `_🚫 This PM is now banned — bot will not respond to this user_`;

      return reply(msg);
    }

    if (command === 'unban') {
      const bans = readBans();

      if (!bans[jid]) {
        return reply(`_This ${type} is not banned_`);
      }

      delete bans[jid];
      writeBans(bans);

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      return reply(`_✅ ${type === 'group' ? 'Group' : 'PM'} unbanned — bot will respond again_`);
    }

    if (command === 'listban') {
      const bans  = readBans();
      const entries = Object.entries(bans);

      if (!entries.length) return reply('_No banned chats_');

      let txt = `*BANNED CHATS* — ${entries.length} total\n\n`;
      entries.forEach(([id, info], i) => {
        const num = id.split('@')[0];
        txt += `${i + 1}. \`${num}\` _(${info.type})_\n`;
      });
      txt += `\n_Use_ \`${prefix}unban\` _inside that chat to unban_`;

      return reply(txt);
    }
  },
};

module.exports.isBanned = isBanned;
