/**
 * antibadword.js — plugins/antibadword.js
 * Commands: .antibadword on/off/set/add/remove/list
 * Groups only. Admin only.
 * groupFilter() runs on every group message via main.js
 */

'use strict';

const isAdminHelper = require('../library/isAdmin');
const {
  handleBadwordDetection,
  setAntibadword, getAntibadword, removeAntibadword,
  addBadword, removeBadword, getBadwords,
} = require('../library/antibadword');

// ── groupFilter — wired by main.js ────────────────────────────────────
const groupFilter = async (sock, m, ctx) => {
  if (!m.isGroup) return;
  if (!m.body)    return;
  if (ctx.isOwner) return;

  const { isSenderAdmin, isBotAdmin } = await isAdminHelper(sock, m.chat, m.sender);
  if (isSenderAdmin) return;

  await handleBadwordDetection(sock, m, isBotAdmin);
};

// ── Plugin ────────────────────────────────────────────────────────────
module.exports = {
  command:  ['antibadword'],
  category: 'group',
  group:    true,
  desc:     'Antibadword protection for groups',
  usage:    '.antibadword on|off|set delete|warn|kick|add <word>|remove <word>|list',

  groupFilter,

  async execute(sock, m, ctx) {
    const { args, reply, isOwner, prefix } = ctx;
    if (!m.isGroup) return reply('_group only command_');

    const { isSenderAdmin } = await isAdminHelper(sock, m.chat, m.sender);
    if (!isSenderAdmin && !isOwner) return reply('_this command is for group admins only_');

    const cfg   = getAntibadword(m.chat);
    const words = getBadwords(m.chat);
    const sub   = args[0]?.toLowerCase();

    if (!sub) return reply(
      `_antibadword: ${cfg?.enabled ? 'on' : 'off'}_\n` +
      `_action: ${cfg?.action || 'not set'}_\n` +
      `_custom words: ${words.length}_\n\n` +
      `_${prefix}antibadword on_\n` +
      `_${prefix}antibadword off_\n` +
      `_${prefix}antibadword set delete|warn|kick_\n` +
      `_${prefix}antibadword add <word>_\n` +
      `_${prefix}antibadword remove <word>_\n` +
      `_${prefix}antibadword list_`
    );

    if (sub === 'on') {
      if (cfg?.enabled) return reply('_antibadword already on_');
      setAntibadword(m.chat, true, cfg?.action || 'delete');
      return reply('_antibadword on_');
    }

    if (sub === 'off') {
      removeAntibadword(m.chat);
      return reply('_antibadword off_');
    }

    if (sub === 'set') {
      const action = args[1]?.toLowerCase();
      if (!['delete','warn','kick'].includes(action))
        return reply('_options: delete | warn | kick_');
      setAntibadword(m.chat, true, action);
      return reply(`_antibadword on - action: ${action}_`);
    }

    if (sub === 'add') {
      const word = args.slice(1).join(' ').trim().toLowerCase();
      if (!word) return reply(`_usage: ${prefix}antibadword add <word>_`);
      return reply(addBadword(m.chat, word) ? `_added: ${word}_` : `_already in list: ${word}_`);
    }

    if (sub === 'remove') {
      const word = args.slice(1).join(' ').trim().toLowerCase();
      if (!word) return reply(`_usage: ${prefix}antibadword remove <word>_`);
      return reply(removeBadword(m.chat, word) ? `_removed: ${word}_` : `_not found: ${word}_`);
    }

    if (sub === 'list') {
      const list = getBadwords(m.chat);
      return reply(list.length
        ? `_custom banned words_\n${list.map((w, i) => `_${i + 1}. ${w}_`).join('\n')}`
        : '_no custom words set - standard list is active_'
      );
    }

    return reply('_options: on | off | set | add | remove | list_');
  }
};