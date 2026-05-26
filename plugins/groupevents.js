
/**
 * groupevents.js
 * Commands: .welcome, .goodbye
 * Auto-fires on group join/leave via index.js group-participants.update event
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'database', 'group_events.json');

const loadDB = () => {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (_) {}
  return {};
};

const saveDB = (data) => {
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
  desc: 'Set welcome and goodbye messages for this group',
  usage: '.welcome on/off/set <message>\n.goodbye on/off/set <message>',

  async execute(sock, m, ctx) {
    const { command, args, reply, isAdmin, isOwner, prefix } = ctx;

    // Live admin check
    let senderIsAdmin = false;
    try {
      const meta   = await sock.groupMetadata(m.chat);
      const sndNum = (m.sender || '').split('@')[0];
      senderIsAdmin = meta.participants.some(p => p.id.split('@')[0] === sndNum && p.admin);
    } catch (_) {}

    if (!senderIsAdmin && !isOwner) return reply('_This command is for group admins only_');

    const db    = loadDB();
    const group = getGroup(db, m.chat);
    const type  = command; // 'welcome' or 'goodbye'
    const sub   = args[0]?.toLowerCase();

    const DEFAULT_WELCOME = '{user} joined {group}';
    const DEFAULT_GOODBYE = '{user} left {group}';

    const HELP_WELCOME =
      `_Welcome command usage_\n\n` +
      `_${prefix}welcome on - enable_\n` +
      `_${prefix}welcome off - disable_\n` +
      `_${prefix}welcome set <message> - custom message_\n` +
      `_${prefix}welcome reset - restore default_\n` +
      `_${prefix}welcome status - show current setting_\n\n` +
      `_Variables: {user} {group}_\n\n` +
      `_Default: ${DEFAULT_WELCOME}_`;

    const HELP_GOODBYE =
      `_Goodbye command usage_\n\n` +
      `_${prefix}goodbye on - enable_\n` +
      `_${prefix}goodbye off - disable_\n` +
      `_${prefix}goodbye set <message> - custom message_\n` +
      `_${prefix}goodbye reset - restore default_\n` +
      `_${prefix}goodbye status - show current setting_\n\n` +
      `_Variables: {user} {group}_\n\n` +
      `_Default: ${DEFAULT_GOODBYE}_`;

    if (!sub) return reply(type === 'welcome' ? HELP_WELCOME : HELP_GOODBYE);

    if (!group[type]) group[type] = {
      enabled: false,
      message: type === 'welcome' ? DEFAULT_WELCOME : DEFAULT_GOODBYE
    };

    if (sub === 'on') {
      group[type].enabled = true;
      saveDB(db);
      return reply(`_${type} messages enabled_`);
    }

    if (sub === 'off') {
      group[type].enabled = false;
      saveDB(db);
      return reply(`_${type} messages disabled_`);
    }

    if (sub === 'set') {
      const custom = args.slice(1).join(' ').trim();
      if (!custom) return reply(`_Usage: ${prefix}${type} set <your message>_\n_Variables: {user} {group}_`);
      group[type].message = custom;
      group[type].enabled = true;
      saveDB(db);
      return reply(`_${type} message saved_\n\n_${custom}_`);
    }

    if (sub === 'reset') {
      group[type].message = type === 'welcome' ? DEFAULT_WELCOME : DEFAULT_GOODBYE;
      saveDB(db);
      return reply(`_${type} message reset to default_\n\n_${group[type].message}_`);
    }

    if (sub === 'status') {
      const state = group[type] || { enabled: false, message: type === 'welcome' ? DEFAULT_WELCOME : DEFAULT_GOODBYE };
      return reply(
        `_${type} status: ${state.enabled ? 'on' : 'off'}_\n` +
        `_message: ${state.message}_`
      );
    }

    return reply(type === 'welcome' ? HELP_WELCOME : HELP_GOODBYE);
  }
};
