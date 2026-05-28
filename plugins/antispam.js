/**
 * antispam.js — plugins/antispam.js
 * Commands: .antilink .antibadword .antispam .antitag
 *
 * Flow:
 *   main.js calls groupFilter() on EVERY group message
 *   → checks antispam → antilink → antibadword → antitag
 *   → uses isAdmin.js for LIVE admin check every time
 *   → uses antifunction.js to read/write settings
 *
 * Groups only. Owner and group admins are always skipped.
 */

'use strict';

const isAdminHelper = require('../library/isAdmin');

const {
  setAntilink,    getAntilink,    removeAntilink,
  setAntibadword, getAntibadword, removeAntibadword,
  addBadword,     removeBadword,  getBadwords,
  setAntispam,    getAntispam,    removeAntispam,
  setAntitag,     getAntitag,     removeAntitag,
  incrementWarning, resetWarning,
} = require('../library/antifunction');

const WARN_LIMIT = 3;

// ── Link detection ────────────────────────────────────────────────────
// Catches http/https URLs, WhatsApp group links, Telegram links, bare domains
const LINK_PATTERNS = [
  /https?:\/\/[^\s]+/i,
  /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i,
  /wa\.me\/[^\s]+/i,
  /t\.me\/[^\s]+/i,
  /([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i,
];

function containsLink(text) {
  return LINK_PATTERNS.some(r => r.test(text));
}

// ── Mass tag detection (@everyone / tagging many people) ─────────────
function containsMassTag(text, mentions = []) {
  // More than 5 mentions = mass tag
  if (mentions.length >= 5) return true;
  // @everyone / @here type text
  if (/@everyone|@all|@here/i.test(text)) return true;
  return false;
}

// ── Built-in bad word list ────────────────────────────────────────────
const BUILTIN_BADWORDS = [
  // English
  'fuck','fucker','fucking','fck','fuk','f*ck','f@ck','fcuk',
  'shit','bitch','btch','b*tch','b!tch','bastard','asshole','a**hole','a$$',
  'dick','d!ck','cock','pussy','cunt','twat','prick','whore','slut',
  'motherfucker','wanker','douchebag','jackass','scumbag',
  'nigga','n!gga','nigger','faggot','fag','retard',
  'porn','sex','xxx','anal','dildo','blowjob','handjob','cum','jizz',
  'hentai','milf','orgasm','vibrator','gangbang','threesome','deepthroat',
  // Hindi/Hinglish
  'madarchod','bhosdike','bsdk','bhosda','lauda','laude','lund',
  'chutiya','chut','randi','harami','haramzada','kameena',
  'behenchod','betichod','benchod','chodu','lodu','l0du','gandu',
  'gaand','gaand mara','chodne','chudai',
  'sala kutta','randi ki aulad','maa ki chut','teri ma ki chut',
  'teri maa ki','behen ki chut',
  // Racial/slurs
  'spic','chink','cracker','gook','kike','paki','honky','wetback',
];

function hasBadWord(text, customWords = []) {
  const clean = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const all   = [...new Set([...BUILTIN_BADWORDS, ...customWords.map(w => w.toLowerCase())])];
  const words = clean.split(' ');

  for (const w of words) {
    if (w.length < 2) continue;
    if (all.includes(w)) return w;
  }
  // Multi-word phrases
  for (const bad of all) {
    if (bad.includes(' ') && clean.includes(bad)) return bad;
  }
  return null;
}

// ── Spam tracker ─────────────────────────────────────────────────────
const spamMap = {};

function isSpamming(chatId, sender, limit) {
  const key = `${chatId}|${sender}`;
  const now = Date.now();
  if (!spamMap[key]) spamMap[key] = [];
  // Keep only messages in last 5 seconds
  spamMap[key] = spamMap[key].filter(t => now - t < 5000);
  spamMap[key].push(now);
  return spamMap[key].length >= limit;
}

// ── Send and delete helper ────────────────────────────────────────────
async function deleteMsg(sock, m) {
  try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}
}

async function warn(sock, m, sender, count) {
  await sock.sendMessage(m.chat, {
    text: `@${sender.split('@')[0]} _warning ${count}/${WARN_LIMIT}_`,
    mentions: [sender]
  }).catch(() => {});
}

async function kick(sock, m, sender, reason) {
  try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
  await sock.sendMessage(m.chat, {
    text: `@${sender.split('@')[0]} _${reason}_`,
    mentions: [sender]
  }).catch(() => {});
}

// ── groupFilter — wired into main.js, fires on every group message ────
const groupFilter = async (sock, m, ctx) => {
  // Must be a group message
  if (!m.isGroup) return;

  const sender = m.sender || '';
  if (!sender) return;

  // Never act on owner
  if (ctx.isOwner) return;

  // Live admin check — skip group admins too
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
      return; // stop further checks for this message
    }
  }

  // ── 2. ANTILINK ────────────────────────────────────────────────
  const linkCfg = getAntilink(m.chat);
  if (linkCfg?.enabled && body && containsLink(body)) {
    if (!isBotAdmin) return;
    await deleteMsg(sock, m);

    if (linkCfg.action === 'kick') {
      await kick(sock, m, sender, 'removed for sending a link');

    } else if (linkCfg.action === 'warn') {
      const count = incrementWarning(m.chat, sender);
      if (count >= WARN_LIMIT) {
        resetWarning(m.chat, sender);
        await kick(sock, m, sender, `removed after ${WARN_LIMIT} warnings`);
      } else {
        await warn(sock, m, sender, count);
        await sock.sendMessage(m.chat, {
          text: `@${sender.split('@')[0]} _links are not allowed_`,
          mentions: [sender]
        }).catch(() => {});
      }

    } else {
      // delete only
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _links are not allowed here_`,
        mentions: [sender]
      }).catch(() => {});
    }
    return;
  }

  // ── 3. ANTIBADWORD ─────────────────────────────────────────────
  const bwCfg = getAntibadword(m.chat);
  if (bwCfg?.enabled && body) {
    const customWords = getBadwords(m.chat);
    const found = hasBadWord(body, customWords);
    if (found) {
      if (!isBotAdmin) return;
      await deleteMsg(sock, m);

      if (bwCfg.action === 'kick') {
        await kick(sock, m, sender, 'removed for using bad words');

      } else if (bwCfg.action === 'warn') {
        const count = incrementWarning(m.chat, sender);
        if (count >= WARN_LIMIT) {
          resetWarning(m.chat, sender);
          await kick(sock, m, sender, `removed after ${WARN_LIMIT} warnings`);
        } else {
          await warn(sock, m, sender, count);
          await sock.sendMessage(m.chat, {
            text: `@${sender.split('@')[0]} _bad words are not allowed_`,
            mentions: [sender]
          }).catch(() => {});
        }

      } else {
        await sock.sendMessage(m.chat, {
          text: `@${sender.split('@')[0]} _bad words are not allowed here_`,
          mentions: [sender]
        }).catch(() => {});
      }
      return;
    }
  }

  // ── 4. ANTITAG ─────────────────────────────────────────────────
  const tagCfg = getAntitag(m.chat);
  if (tagCfg?.enabled && containsMassTag(body, mentions)) {
    if (!isBotAdmin) return;
    await deleteMsg(sock, m);

    if (tagCfg.action === 'kick') {
      await kick(sock, m, sender, 'removed for mass tagging');
    } else if (tagCfg.action === 'warn') {
      const count = incrementWarning(m.chat, sender);
      if (count >= WARN_LIMIT) {
        resetWarning(m.chat, sender);
        await kick(sock, m, sender, `removed after ${WARN_LIMIT} warnings`);
      } else {
        await warn(sock, m, sender, count);
        await sock.sendMessage(m.chat, {
          text: `@${sender.split('@')[0]} _mass tagging is not allowed_`,
          mentions: [sender]
        }).catch(() => {});
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
  command: ['antilink', 'antibadword', 'antispam', 'antitag'],
  category: 'group',
  group: true,
  desc: 'Group protection — antilink, antibadword, antispam, antitag',

  groupFilter, // wired by main.js

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

    // ── .antibadword ─────────────────────────────────────────────
    if (command === 'antibadword') {
      const cfg   = getAntibadword(m.chat);
      const words = getBadwords(m.chat);
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
      if (sub === 'on')  { setAntibadword(m.chat, true, cfg?.action || 'delete'); return reply('_antibadword on_'); }
      if (sub === 'off') { removeAntibadword(m.chat); return reply('_antibadword off_'); }
      if (sub === 'set') {
        const action = args[1]?.toLowerCase();
        if (!['delete','warn','kick'].includes(action)) return reply('_options: delete | warn | kick_');
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
          : '_no custom words set - built-in list is active_'
        );
      }
      return reply('_options: on | off | set | add | remove | list_');
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
