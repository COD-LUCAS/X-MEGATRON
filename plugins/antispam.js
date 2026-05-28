/**
 * antispam.js — plugins/antispam.js
 * Commands: .antilink, .antibadword, .antispam
 * groupFilter() runs on every group message via main.js
 *
 * Groups only. Skips admins and owner.
 * Uses library/antifunction.js for data and library/isAdmin.js for checks.
 */

'use strict';

const {
  setAntilink, getAntilink, removeAntilink,
  setAntibadword, getAntibadword, removeAntibadword,
  addBadword, removeBadword, getBadwords,
  setAntispam, getAntispam, removeAntispam,
  incrementWarning, resetWarning,
} = require('../library/antifunction');

const isAdminHelper = require('../library/isAdmin');

const WARN_LIMIT = 3;

// ── Link detection (from KnightBot lib/antilink.js) ──────────────────
const URL_REGEX = /(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?/i;
const WA_GROUP  = /chat\.whatsapp\.com\/[A-Za-z0-9]{20,}/i;
const WA_CHAN   = /wa\.me\/channel\/[A-Za-z0-9]{20,}/i;
const TG_LINK   = /t\.me\/[A-Za-z0-9_]+/i;

function containsLink(text) {
  return URL_REGEX.test(text);
}

// ── Built-in bad word list (from KnightBot) ──────────────────────────
const BUILTIN_BADWORDS = [
  'gandu','madarchod','bhosdike','bsdk','fucker','bhosda','lauda','laude',
  'betichod','chutiya','maa ki chut','behenchod','behen ki chut','randi',
  'chuchi','boobs','boobies','tits','idiot','nigga','fuck','dick','bitch',
  'bastard','asshole','teri ma ki chut','teri maa ki','lund','mc','lodu',
  'benchod','shit','piss','crap','slut','whore','prick','motherfucker',
  'cock','cunt','pussy','twat','wanker','douchebag','jackass','moron',
  'retard','scumbag','skank','arse','bugger','chut','madar','chodne',
  'sala kutta','harami','randi ki aulad','gaand mara','chodu','gandu saala',
  'kameena','haramzada','chudai','fck','fckr','fuk','fukk','fcuk','btch',
  'f*ck','a**hole','f@ck','b!tch','d!ck','n!gga','a$$','l0du',
  'spic','chink','cracker','gook','kike','paki','honky','wetback','raghead',
  'blowjob','handjob','cum','cumshot','jizz','deepthroat','fap','hentai',
  'milf','anal','orgasm','dildo','vibrator','gangbang','threesome','porn',
  'sex','xxx','fag','faggot','dyke','tranny','homo','sissy','fairy','lesbo',
  'weed','pot','coke','heroin','meth','crack','dope','bong','kush','hash',
];

function hasBadWord(text, customWords = []) {
  const clean = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const all   = [...new Set([...BUILTIN_BADWORDS, ...customWords.map(w => w.toLowerCase())])];
  const words = clean.split(' ');

  for (const w of words) {
    if (w.length < 2) continue;
    if (all.includes(w)) return w;
  }
  for (const bad of all) {
    if (bad.includes(' ') && clean.includes(bad)) return bad;
  }
  return null;
}

// ── Spam tracker (in-memory) ─────────────────────────────────────────
const spamTracker = {};

function trackSpam(chatId, sender, limit) {
  const key = `${chatId}::${sender}`;
  const now = Date.now();
  if (!spamTracker[key]) spamTracker[key] = [];
  spamTracker[key] = spamTracker[key].filter(t => now - t < 5000); // 5s window
  spamTracker[key].push(now);
  return spamTracker[key].length >= limit;
}

// ── groupFilter — called on every group message from main.js ─────────
const groupFilter = async (sock, m, ctx) => {
  if (!m.isGroup) return;
  if (!m.body && !m.message?.stickerMessage) return;

  const sender = m.sender || '';
  if (!sender) return;
  if (ctx.isOwner) return;

  const { isSenderAdmin, isBotAdmin } = await isAdminHelper(sock, m.chat, sender);
  if (isSenderAdmin) return;

  const body = m.body || '';

  // ── ANTISPAM ──────────────────────────────────────────────────
  const spamCfg = getAntispam(m.chat);
  if (spamCfg?.enabled && body) {
    const limit = spamCfg.limit || 5;
    const isSpam = trackSpam(m.chat, sender, limit);

    if (isSpam && isBotAdmin) {
      try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _stop spamming_`,
        mentions: [sender]
      }).catch(() => {});
      return;
    }
  }

  // ── ANTILINK ──────────────────────────────────────────────────
  const linkCfg = getAntilink(m.chat);
  if (linkCfg?.enabled && body && containsLink(body)) {
    if (!isBotAdmin) return;

    try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}

    if (linkCfg.action === 'kick') {
      try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _removed for sending a link_`,
        mentions: [sender]
      }).catch(() => {});

    } else if (linkCfg.action === 'warn') {
      const count = incrementWarning(m.chat, sender);
      if (count >= WARN_LIMIT) {
        resetWarning(m.chat, sender);
        try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
        await sock.sendMessage(m.chat, {
          text: `@${sender.split('@')[0]} _removed after ${WARN_LIMIT} warnings_`,
          mentions: [sender]
        }).catch(() => {});
      } else {
        await sock.sendMessage(m.chat, {
          text: `@${sender.split('@')[0]} _warning ${count}/${WARN_LIMIT} - links not allowed_`,
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

  // ── ANTIBADWORD ───────────────────────────────────────────────
  const bwCfg = getAntibadword(m.chat);
  if (bwCfg?.enabled && body) {
    if (!isBotAdmin) return;

    const customWords = getBadwords(m.chat);
    const found = hasBadWord(body, customWords);
    if (!found) return;

    try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}

    if (bwCfg.action === 'kick') {
      try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _removed for using bad words_`,
        mentions: [sender]
      }).catch(() => {});

    } else if (bwCfg.action === 'warn') {
      const count = incrementWarning(m.chat, sender);
      if (count >= WARN_LIMIT) {
        resetWarning(m.chat, sender);
        try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
        await sock.sendMessage(m.chat, {
          text: `@${sender.split('@')[0]} _removed after ${WARN_LIMIT} warnings_`,
          mentions: [sender]
        }).catch(() => {});
      } else {
        await sock.sendMessage(m.chat, {
          text: `@${sender.split('@')[0]} _warning ${count}/${WARN_LIMIT} - bad words not allowed_`,
          mentions: [sender]
        }).catch(() => {});
      }

    } else {
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _bad words are not allowed here_`,
        mentions: [sender]
      }).catch(() => {});
    }
  }
};

// ── Commands ──────────────────────────────────────────────────────────
module.exports = {
  command: ['antilink', 'antibadword', 'antispam'],
  category: 'group',
  group: true,
  desc: 'Group protection — antilink, antibadword, antispam',

  groupFilter,

  async execute(sock, m, ctx) {
    const { command, args, reply, isOwner, prefix } = ctx;

    if (!m.isGroup) return reply('_group only command_');

    const { isSenderAdmin } = await isAdminHelper(sock, m.chat, m.sender);
    if (!isSenderAdmin && !isOwner) return reply('_this command is for group admins only_');

    const sub = args[0]?.toLowerCase();

    // ── ANTILINK ────────────────────────────────────────────────
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

      if (sub === 'on') {
        if (cfg?.enabled) return reply('_antilink already on_');
        setAntilink(m.chat, true, cfg?.action || 'delete');
        return reply('_antilink on_');
      }

      if (sub === 'off') {
        removeAntilink(m.chat);
        return reply('_antilink off_');
      }

      if (sub === 'set') {
        const action = args[1]?.toLowerCase();
        if (!action || !['delete','warn','kick'].includes(action))
          return reply('_options: delete | warn | kick_');
        setAntilink(m.chat, true, action);
        return reply(`_antilink on - action: ${action}_`);
      }

      return reply('_options: on | off | set delete|warn|kick_');
    }

    // ── ANTIBADWORD ─────────────────────────────────────────────
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
        if (!action || !['delete','warn','kick'].includes(action))
          return reply('_options: delete | warn | kick_');
        setAntibadword(m.chat, true, action);
        return reply(`_antibadword on - action: ${action}_`);
      }

      if (sub === 'add') {
        const word = args.slice(1).join(' ').trim().toLowerCase();
        if (!word) return reply(`_usage: ${prefix}antibadword add <word>_`);
        const added = addBadword(m.chat, word);
        return reply(added ? `_added: ${word}_` : `_${word} already in list_`);
      }

      if (sub === 'remove') {
        const word = args.slice(1).join(' ').trim().toLowerCase();
        if (!word) return reply(`_usage: ${prefix}antibadword remove <word>_`);
        const removed = removeBadword(m.chat, word);
        return reply(removed ? `_removed: ${word}_` : `_${word} not found_`);
      }

      if (sub === 'list') {
        const list = getBadwords(m.chat);
        return reply(
          list.length
            ? `_custom banned words:_\n${list.map((w, i) => `_${i + 1}. ${w}_`).join('\n')}`
            : '_no custom words - built-in list is active_'
        );
      }

      return reply('_options: on | off | set | add | remove | list_');
    }

    // ── ANTISPAM ────────────────────────────────────────────────
    if (command === 'antispam') {
      const cfg = getAntispam(m.chat);

      if (!sub) return reply(
        `_antispam: ${cfg?.enabled ? 'on' : 'off'}_\n` +
        `_limit: ${cfg?.limit || 5} msgs per 5s_\n\n` +
        `_${prefix}antispam on_\n` +
        `_${prefix}antispam off_\n` +
        `_${prefix}antispam set <number>_`
      );

      if (sub === 'on') {
        if (cfg?.enabled) return reply('_antispam already on_');
        setAntispam(m.chat, true, cfg?.limit || 5);
        return reply('_antispam on - limit: 5 messages per 5 seconds_');
      }

      if (sub === 'off') {
        removeAntispam(m.chat);
        return reply('_antispam off_');
      }

      if (sub === 'set') {
        const num = parseInt(args[1]);
        if (!num || num < 2 || num > 20)
          return reply('_set a number between 2 and 20_');
        setAntispam(m.chat, true, num);
        return reply(`_antispam on - limit: ${num} messages per 5 seconds_`);
      }

      return reply('_options: on | off | set <number>_');
    }
  }
};
