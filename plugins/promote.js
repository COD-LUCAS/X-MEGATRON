/**
 * promote.js — plugins/promote.js
 * Commands: .promote, .demote, .pdm on, .pdm off
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const isAdmin = require('../library/isAdmin');

const DB_FILE = path.join(__dirname, '..', 'database', 'group_settings.json');

const loadDB = () => {
  try { if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) {}
  return {};
};

const saveDB = (data) => {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
};

module.exports = {
  command: ['promote', 'demote', 'pdm'],
  category: 'group',
  group: true,
  desc: 'Promote or demote members. pdm on/off toggles event announcements.',

  async execute(sock, m, ctx) {
    const { command, args, reply, isOwner, prefix } = ctx;

    // ── Live admin check via isAdmin.js ──────────────────────────
    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, m.chat, m.sender);

    // ── PDM TOGGLE ───────────────────────────────────────────────
    if (command === 'pdm') {
      if (!isSenderAdmin && !isOwner) return reply('_this command is for group admins only_');

      const sub = args[0]?.toLowerCase();
      if (!sub || !['on', 'off'].includes(sub)) {
        const db    = loadDB();
        const state = db[m.chat]?.pdm ? 'on' : 'off';
        return reply(
          `_promote/demote announcements: ${state}_\n\n` +
          `_${prefix}pdm on_\n` +
          `_${prefix}pdm off_`
        );
      }

      const db = loadDB();
      if (!db[m.chat]) db[m.chat] = {};
      db[m.chat].pdm = sub === 'on';
      saveDB(db);
      return reply(`_promote/demote announcements: ${sub}_`);
    }

    // ── PROMOTE / DEMOTE ─────────────────────────────────────────
    if (!isSenderAdmin && !isOwner) return reply('_this command is for group admins only_');
    if (!isBotAdmin)                return reply('_please make me a group admin first_');

    // Resolve targets from mentions or quoted message
    let targets = [];
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      targets = m.message.extendedTextMessage.contextInfo.mentionedJid;
    } else if (m.message?.extendedTextMessage?.contextInfo?.participant) {
      targets = [m.message.extendedTextMessage.contextInfo.participant];
    }

    if (!targets.length) return reply(`_mention or reply to a user to ${command} them_`);

    const action = command === 'promote' ? 'promote' : 'demote';

    try {
      await new Promise(r => setTimeout(r, 600));
      await sock.groupParticipantsUpdate(m.chat, targets, action);

      for (const jid of targets) {
        await sock.sendMessage(m.chat, {
          text: action === 'promote'
            ? `@${jid.split('@')[0]} _promoted as admin_`
            : `@${jid.split('@')[0]} _demoted as admin_`,
          mentions: [jid]
        });
      }
    } catch (e) {
      if (e?.data === 429) return reply('_rate limit hit, try again in a few seconds_');
      return reply(`_failed to ${command} user_`);
    }
  }
};
