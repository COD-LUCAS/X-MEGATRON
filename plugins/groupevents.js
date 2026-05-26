/**
 * groupevents.js — plugins/groupevents.js
 * Commands: .welcome, .goodbye
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const isAdmin = require('../library/isAdmin');

const DB_FILE = path.join(__dirname, '..', 'database', 'group_events.json');

const loadDB = () => {
  try { if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) {}
  return {};
};

const saveDB = (data) => {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
};

module.exports = {
  command: ['welcome', 'goodbye'],
  category: 'group',
  group: true,
  desc: 'Set welcome and goodbye messages for this group',
  usage: '.welcome on/off/set <message> | .goodbye on/off/set <message>',

  async execute(sock, m, ctx) {
    const { command, args, reply, isOwner, prefix } = ctx;

    // ── Live admin check via isAdmin.js ──────────────────────────
    const { isSenderAdmin } = await isAdmin(sock, m.chat, m.sender);
    if (!isSenderAdmin && !isOwner) return reply('_this command is for group admins only_');

    const db    = loadDB();
    if (!db[m.chat]) db[m.chat] = {};
    const group = db[m.chat];
    const type  = command; // 'welcome' or 'goodbye'
    const sub   = args[0]?.toLowerCase();

    const DEFAULT_WELCOME = '{user} _joined_ {group}';
    const DEFAULT_GOODBYE = '{user} _left_ {group}';

    const HELP =
      `_${type} command_\n\n` +
      `_${prefix}${type} on_\n` +
      `_${prefix}${type} off_\n` +
      `_${prefix}${type} set <message>_\n` +
      `_${prefix}${type} reset_\n` +
      `_${prefix}${type} status_\n\n` +
      `_variables: {user} {group}_\n\n` +
      `_default: ${type === 'welcome' ? DEFAULT_WELCOME : DEFAULT_GOODBYE}_`;

    if (!sub) return reply(HELP);

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
      if (!custom) return reply(`_usage: ${prefix}${type} set <message>_\n_variables: {user} {group}_`);
      group[type].message = custom;
      group[type].enabled = true;
      saveDB(db);
      return reply(`_${type} message saved_\n\n_${custom}_`);
    }

    if (sub === 'reset') {
      group[type].message = type === 'welcome' ? DEFAULT_WELCOME : DEFAULT_GOODBYE;
      saveDB(db);
      return reply(`$_{type} message reset to default_`);
    }

    if (sub === 'status') {
      const state = group[type] || { enabled: false, message: type === 'welcome' ? DEFAULT_WELCOME : DEFAULT_GOODBYE };
      return reply(
        `_${type}: ${state.enabled ? 'on' : 'off'}_\n` +
        `_message: ${state.message}_`
      );
    }

    return reply(HELP);
  }
};
