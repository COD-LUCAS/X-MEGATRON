/**
 * antispam.js — plugins/antispam.js
 * Commands: .antilink .antispam .antitag
 * groupFilter() wired by main.js — fires on EVERY group message.
 *
 * NOTE: antibadword is now a separate plugin (plugins/antibadword.js)
 * with its own groupFilter. This file handles antilink, antispam, antitag only.
 */

'use strict';

const isAdminHelper = require('../library/isAdmin');
const {
  setAntilink,  getAntilink,  removeAntilink,
  setAntispam,  getAntispam,  removeAntispam,
  setAntitag,   getAntitag,   removeAntitag,
  incrementWarning, resetWarning,
} = require('../library/antifunction');

const WARN_LIMIT = 3;

// ── Link patterns ─────────────────────────────────────────────────────
const LINK_PATTERNS = [
  /https?:\/\/[^\s]+/i,
  /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i,
  /wa\.me\/[^\s]+/i,
  /t\.me\/[^\s]+/i,
  /([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i,
];
const containsLink = (text) => LINK_PATTERNS.some(r => r.test(text));

// ── Mass tag detection ────────────────────────────────────────────────
const containsMassTag = (text, mentions = []) =>
  mentions.length >= 5 || /@everyone|@all|@here/i.test(text);

// ── Spam tracker (in-memory, 5s window) ──────────────────────────────
const spamMap = {};
function isSpamming(chatId, sender, limit) {
  const key = `${chatId}|${sender}`;
  const now = Date.now();
  if (!spamMap[key]) spamMap[key] = [];
  spamMap[key] = spamMap[key].filter(t => now - t < 5000);
  spamMap[key].push(now);
  return spamMap[key].length >= limit;
}

// ── Action helpers ────────────────────────────────────────────────────
async function deleteMsg(sock, m) {
  try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}
}

async function doWarn(sock, m, sender, count, reason) {
  await sock.sendMessage(m.chat, {
    text: `@${sender.split('@')[0]} _warning ${count}/${WARN_LIMIT} - ${reason}_`,
    mentions: [sender]
  }).catch(() => {});
}

async function doKick(sock, m, sender, reason) {
  try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
  await sock.sendMessage(m.chat, {
    text: `@${sender.split('@')[0]} _${reason}_`,
    mentions: [sender]
  }).catch(() => {});
}

// ── groupFilter ───────────────────────────────────────────────────────
const groupFilter = async (sock, m, ctx) => {
  if (!m.isGroup) return;
  const sender = m.sender || '';
  if (!sender || ctx.isOwner) return;

  const { isSenderAdmin, isBotAdmin } = await isAdminHelper(sock, m.chat, sender);
  if (isSenderAdmin) return;

  const body     = m.body || '';
  const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  // ── 1. ANTISPAM ────────────────────────────────────────────────
  const spamCfg = getAntispam(m.chat);
  if (spamCfg?.enabled && body) {
    if (isSpamming(m.chat, sender, spamCfg.limit || 5)) {
      if (!isBotAdmin) return;
      await deleteMsg(sock, m);
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _stop spamming_`,
        mentions: [sender]
      }).catch(() => {});
      return;
    }
  }

  // ── 2. ANTILINK ────────────────────────────────────────────────
  const linkCfg = getAntilink(m.chat);
  if (linkCfg?.enabled && body && containsLink(body)) {
    if (!isBotAdmin) return;
    await deleteMsg(sock, m);

    if (linkCfg.action === 'kick') {
      await doKick(sock, m, sender, 'removed for sending a link');
    } else if (linkCfg.action === 'warn') {
      const count = incrementWarning(m.chat, sender);
      if (count >= WARN_LIMIT) {
        resetWarning(m.chat, sender);
        await doKick(sock, m, sender, `removed after ${WARN_LIMIT} warnings`);
      } else {
        await doWarn(sock, m, sender, count, 'links not allowed');
      }
    } else {
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _links are not allowed here_`,
        mentions: [sender]
      }).catch(() => {});
    }
    return;
  }

  // ── 3. ANTITAG ─────────────────────────────────────────────────
  const tagCfg = getAntitag(m.chat);
  if (tagCfg?.enabled && containsMassTag(body, mentions)) {
    if (!isBotAdmin) return;
    await deleteMsg(sock, m);

    if (tagCfg.action === 'kick') {
      await doKick(sock, m, sender, 'removed for mass tagging');
    } else if (tagCfg.action === 'warn') {
      const count = incrementWarning(m.chat, sender);
      if (count >= WARN_LIMIT) {
        resetWarning(m.chat, sender);
        await doKick(sock, m, sender, `removed after ${WARN_LIMIT} warnings`);
      } else {
        await doWarn(sock, m, sender, count, 'mass tagging not allowed');
      }
    } else {
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _mass tagging is not allowed here_`,
        mentions: [sender]
      }).catch(() => {});
    }
  }
};

// ── Commands ──────────────────────────────────────────────────────────
module.exports = {
  command:  ['antilink', 'antispam', 'antitag'],
  category: 'group',
  group:    true,
  desc:     'Group protection — antilink, antispam, antitag',

  groupFilter,

  async execute(sock, m, ctx) {
    const { command, args, reply, isOwner, prefix } = ctx;
    if (!m.isGroup) return reply('_group only command_');

    const { isSenderAdmin } = await isAdminHelper(sock, m.chat, m.sender);
    if (!isSenderAdmin && !isOwner) return reply('_this command is for group admins only_');

    const sub = args[0]?.toLowerCase();

    // ── .antilink ────────────────────────────────────────────────
    if (command === 'antilink') {
      const cfg = getAntilink(m.chat);
      if (!sub) return reply(
        `_antilink: ${cfg?.enabled ? 'on' : 'off'}_\n` +
        `_action: ${cfg?.action || 'not set'}_\n\n` +
        `_${prefix}antilink on_\n` +
        `_${prefix}antilink off_\n` +
        `_${prefix}antilink set delete_\n` +
        `_${prefix}antilink set warn_\n` +
        `_${prefix}antilink set kick_`
      );
      if (sub === 'on')  { setAntilink(m.chat, true, cfg?.action || 'delete'); return reply('_antilink on_'); }
      if (sub === 'off') { removeAntilink(m.chat); return reply('_antilink off_'); }
      if (sub === 'set') {
        const action = args[1]?.toLowerCase();
        if (!['delete','warn','kick'].includes(action)) return reply('_options: delete | warn | kick_');
        setAntilink(m.chat, true, action);
        return reply(`_antilink on - action: ${action}_`);
      }
      return reply('_options: on | off | set delete|warn|kick_');
    }

    // ── .antispam ────────────────────────────────────────────────
    if (command === 'antispam') {
      const cfg = getAntispam(m.chat);
      if (!sub) return reply(
        `_antispam: ${cfg?.enabled ? 'on' : 'off'}_\n` +
        `_limit: ${cfg?.limit || 5} messages per 5s_\n\n` +
        `_${prefix}antispam on_\n` +
        `_${prefix}antispam off_\n` +
        `_${prefix}antispam set <2-20>_`
      );
      if (sub === 'on')  { setAntispam(m.chat, true, cfg?.limit || 5); return reply('_antispam on_'); }
      if (sub === 'off') { removeAntispam(m.chat); return reply('_antispam off_'); }
      if (sub === 'set') {
        const num = parseInt(args[1]);
        if (!num || num < 2 || num > 20) return reply('_set a number between 2 and 20_');
        setAntispam(m.chat, true, num);
        return reply(`_antispam on - limit: ${num} per 5 seconds_`);
      }
      return reply('_options: on | off | set <number>_');
    }

    // ── .antitag ─────────────────────────────────────────────────
    if (command === 'antitag') {
      const cfg = getAntitag(m.chat);
      if (!sub) return reply(
        `_antitag: ${cfg?.enabled ? 'on' : 'off'}_\n` +
        `_action: ${cfg?.action || 'not set'}_\n\n` +
        `_${prefix}antitag on_\n` +
        `_${prefix}antitag off_\n` +
        `_${prefix}antitag set delete|warn|kick_`
      );
      if (sub === 'on')  { setAntitag(m.chat, true, cfg?.action || 'delete'); return reply('_antitag on_'); }
      if (sub === 'off') { removeAntitag(m.chat); return reply('_antitag off_'); }
      if (sub === 'set') {
        const action = args[1]?.toLowerCase();
        if (!['delete','warn','kick'].includes(action)) return reply('_options: delete | warn | kick_');
        setAntitag(m.chat, true, action);
        return reply(`_antitag on - action: ${action}_`);
      }
      return reply('_options: on | off | set delete|warn|kick_');
    }
  }
};
