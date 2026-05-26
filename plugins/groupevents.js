/**
 * groupevents.js
 * Commands to control welcome, goodbye messages per group.
 * Usage:
 *   .welcome on/off/set <message>/{user},{group},{description}
 *   .goodbye on/off/set <message>/{user},{group}
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'database', 'group_events.json');

const loadDB  = () => {
  try { if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) {}
  return {};
};
const saveDB  = (data) => {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
};

const getGroup = (db, chatId) => {
  if (!db[chatId]) db[chatId] = {};
  return db[chatId];
};

module.exports = {
  command: ['welcome', 'goodbye'],
  category: 'group',
  group: true,
  desc: 'Set welcome/goodbye messages for this group',
  usage: '.welcome on|off|set <message>\n.goodbye on|off|set <message>',

  async execute(sock, m, ctx) {
    const { command, args, text, reply, isAdmin, isOwner, prefix } = ctx;

    if (!isAdmin && !isOwner) return reply('_This command is for group admins only_');

    const db    = loadDB();
    const group = getGroup(db, m.chat);
    const sub   = args[0]?.toLowerCase();
    const type  = command; // 'welcome' or 'goodbye'

    const HELP_WELCOME =
      `*Welcome Message Setup*\n\n` +
      `${prefix}welcome on — Enable\n` +
      `${prefix}welcome off — Disable\n` +
      `${prefix}welcome set <message> — Custom message\n\n` +
      `*Variables:* {user} {group} {description}`;

    const HELP_GOODBYE =
      `*Goodbye Message Setup*\n\n` +
      `${prefix}goodbye on — Enable\n` +
      `${prefix}goodbye off — Disable\n` +
      `${prefix}goodbye set <message> — Custom message\n\n` +
      `*Variables:* {user} {group}`;

    if (!sub) return reply(type === 'welcome' ? HELP_WELCOME : HELP_GOODBYE);

    if (!group[type]) group[type] = { enabled: false, message: '' };

    if (sub === 'on') {
      group[type].enabled = true;
      saveDB(db);
      return reply(`_✅ ${type.charAt(0).toUpperCase() + type.slice(1)} messages enabled for this group_`);
    }

    if (sub === 'off') {
      group[type].enabled = false;
      saveDB(db);
      return reply(`_❌ ${type.charAt(0).toUpperCase() + type.slice(1)} messages disabled for this group_`);
    }

    if (sub === 'set') {
      const customMsg = args.slice(1).join(' ').trim();
      if (!customMsg) return reply(`_Usage: ${prefix}${type} set Your message here_\n_Use {user}, {group}, {description} as variables_`);
      group[type].message  = customMsg;
      group[type].enabled  = true;
      saveDB(db);
      return reply(`_✅ Custom ${type} message saved and enabled_\n\n${customMsg}`);
    }

    if (sub === 'status') {
      const status = group[type]?.enabled ? '✅ Enabled' : '❌ Disabled';
      const msg    = group[type]?.message || '_(default message)_';
      return reply(`*${type.charAt(0).toUpperCase() + type.slice(1)} Status:* ${status}\n*Message:* ${msg}`);
    }

    return reply(type === 'welcome' ? HELP_WELCOME : HELP_GOODBYE);
  }
};
