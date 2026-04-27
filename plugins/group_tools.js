/**
 * group_tools.js
 * anticall, antibot, antiword, antilink, antispam, antidelete,
 * antifake, antipromote, antidemote, pdm, autounmute, callreject
 *
 * Storage: database/group_settings.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Storage ───────────────────────────────────────────────────
const DB  = path.join(__dirname, '..', 'database', 'group_settings.json');

const rdb = () => { try { if (fs.existsSync(DB)) return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (_) {} return {}; };
const wdb = (d) => { try { fs.writeFileSync(DB, JSON.stringify(d, null, 2)); } catch (_) {} };
const gcfg  = (jid)        => rdb()[jid] || {};
const scfg  = (jid, patch) => { const d = rdb(); d[jid] = { ...(d[jid] || {}), ...patch }; wdb(d); };

// ── URL detection (non-global — no lastIndex bug) ─────────────
const URL_RE = /(?:https?:\/\/|www\.)\S+|(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|io|co|me|xyz|app|dev|ly|link|gg|tv|ai|info|biz|online)\S*/i;
const hasLink  = (t) => URL_RE.test(t);
const getLinks = (t) => t.match(new RegExp(URL_RE.source, 'gi')) || [];

const linkAllowed = (text, cfg) => {
  const urls = getLinks(text);
  if (!urls.length) return true;
  if (cfg.antilinkMode === 'whitelist') {
    const al = (cfg.antilinkDomains || 'wa.me').split(',').map(d => d.trim().toLowerCase());
    return urls.every(u => al.some(d => u.toLowerCase().includes(d)));
  }
  if (cfg.antilinkMode === 'blacklist') {
    const bl = (cfg.antilinkDomains || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    return !urls.some(u => bl.some(d => u.toLowerCase().includes(d)));
  }
  return false;
};

// ── Bad word detection ────────────────────────────────────────
const DEF_WORDS = ['fuck','shit','bitch','nigga','asshole','bastard'];
const hasBadWord = (text, custom) => {
  const words = custom?.length ? custom : DEF_WORDS;
  const lower = text.toLowerCase();
  return words.some(w => lower.includes(w.toLowerCase().trim()));
};

// ── Warn tracker ─────────────────────────────────────────────
const getWarn   = (jid, key) => gcfg(jid)[`w_${key}`] || 0;
const addWarn   = (jid, key) => { const n = getWarn(jid, key) + 1; scfg(jid, { [`w_${key}`]: n }); return n; };
const resetWarn = (jid, key) => scfg(jid, { [`w_${key}`]: 0 });

// ── Spam tracker (in-memory window) ──────────────────────────
const spamMap = new Map();
const isSpam  = (jid, sender, limit = 5, ms = 8000) => {
  const k = `${jid}::${sender}`;
  const now = Date.now();
  const e = spamMap.get(k) || { c: 0, t: now };
  if (now - e.t > ms) { spamMap.set(k, { c: 1, t: now }); return false; }
  e.c++;
  spamMap.set(k, e);
  if (e.c >= limit) { spamMap.delete(k); return true; }
  return false;
};

// ── Helpers ───────────────────────────────────────────────────
const del   = async (sock, key) => { try { await sock.sendMessage(key.remoteJid, { delete: key }); } catch (_) {} };
const kick  = async (sock, jid, sender) => { try { await sock.groupParticipantsUpdate(jid, [sender], 'remove'); } catch (_) {} };
const mntn  = (sender, txt) => ({ text: `@${sender.split('@')[0]} ${txt}`, mentions: [sender] });

// ── Status helper ─────────────────────────────────────────────
const st = (v) => v ? '✅ ON' : '❌ OFF';

// ─────────────────────────────────────────────────────────────
module.exports = {
  command: [
    'antilink','antidelete','antibot','antispam','antifake',
    'antiword','antipromote','antidemote','anticall',
    'pdm','autounmute','getmute','callreject',
  ],
  category: 'group',
  desc: 'Group protection — antilink, antibot, antispam, antiword, anticall, antidelete & more',
  usage: '.antilink on/off | .antispam on/off | .antibot on/off | .antiword on/off | .antidelete chat/sudo/off | .anticall on/off | .antipromote on/off | .antidemote on/off | .pdm on/off | .autounmute HH MM',

  async execute(sock, m, context) {
    const { command, args, text, reply, isOwner, isAdmin, isBotAdmin, prefix } = context;
    const jid = m.chat;
    const cfg = gcfg(jid);

    // ── ANTICALL ────────────────────────────────────────────
    if (command === 'anticall') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub === 'on')  { scfg('__global', { anticall: true  }); return reply('✅ _Anticall ON — incoming calls will be rejected_'); }
      if (sub === 'off') { scfg('__global', { anticall: false }); return reply('❌ _Anticall OFF_'); }
      return reply(`*Anticall:* ${st(rdb().__global?.anticall)}\n_${prefix}anticall on/off_`);
    }

    // ── ANTIDELETE ──────────────────────────────────────────
    if (command === 'antidelete') {
      if (!isOwner) return reply('_Owner only_');
      const opt = text.toLowerCase().trim();
      if (!opt) return reply(
        `*Anti Delete*\n\n*Status:* _${cfg.antidelete || 'off'}_\n\n` +
        `_${prefix}antidelete chat — send to same chat_\n` +
        `_${prefix}antidelete sudo — send to owner PM_\n` +
        `_${prefix}antidelete off_`
      );
      if (!['chat','sudo','off'].includes(opt)) return reply('_Options: chat | sudo | off_');
      scfg(jid, { antidelete: opt });
      return reply(`_Anti-delete → *${opt}* ${opt === 'off' ? '❌' : '✅'}_`);
    }

    // ── ANTILINK ────────────────────────────────────────────
    if (command === 'antilink') {
      if (!isOwner && !isAdmin) return;
      const sub = args[0]?.toLowerCase() || 'status';
      const val = args.slice(1).join(' ').trim();
      switch (sub) {
        case 'on': case 'enable':
          if (!isBotAdmin) return reply('_Make me admin first_');
          scfg(jid, { antilink: true });
          return reply(`✅ *Antilink ON*\n_Mode: ${cfg.antilinkAction || 'delete'}_`);
        case 'off': case 'disable':
          scfg(jid, { antilink: false });
          return reply('❌ *Antilink OFF*');
        case 'mode':
          if (!['warn','kick','delete'].includes(val)) return reply(`_Modes: warn | kick | delete_`);
          scfg(jid, { antilinkAction: val });
          return reply(`✅ _Mode → *${val.toUpperCase()}*_`);
        case 'allow': case 'whitelist':
          if (!val) return reply(`_Usage: ${prefix}antilink allow google.com,youtube.com_`);
          scfg(jid, { antilinkMode: 'whitelist', antilinkDomains: val });
          return reply(`✅ _Whitelist: ${val}_`);
        case 'block': case 'blacklist':
          if (!val) return reply(`_Usage: ${prefix}antilink block domain.com_`);
          scfg(jid, { antilinkMode: 'blacklist', antilinkDomains: val });
          return reply(`✅ _Blacklist: ${val}_`);
        case 'warnlimit':
          if (!val || isNaN(val)) return reply(`_Usage: ${prefix}antilink warnlimit 3_`);
          scfg(jid, { antilinkWarnLimit: parseInt(val) });
          return reply(`✅ _Warn limit → ${val}_`);
        case 'reset':
          scfg(jid, { antilink: false, antilinkMode: null, antilinkDomains: null, antilinkAction: null });
          return reply('🔄 _Antilink reset_');
        default: {
          const meta = await sock.groupMetadata(jid).catch(() => ({ subject: jid }));
          return reply(
            `🛡️ *Antilink — ${meta.subject}*\n\n` +
            `*Status:*  ${st(cfg.antilink)}\n` +
            `*Action:*  _${cfg.antilinkAction || 'delete'}_\n` +
            `*Type:*    _${cfg.antilinkMode || 'block all'}_\n` +
            `*Domains:* _${cfg.antilinkDomains || '—'}_\n` +
            `*Warns:*   _${cfg.antilinkWarnLimit || 3} before kick_\n\n` +
            `_${prefix}antilink on/off/mode/allow/block/warnlimit/reset_`
          );
        }
      }
    }

    // ── ANTIBOT ─────────────────────────────────────────────
    if (command === 'antibot') {
      if (!isOwner && !isAdmin) return;
      const sub = args[0]?.toLowerCase();
      if (sub === 'on')  { if (!isBotAdmin) return reply('_Make me admin first_'); scfg(jid, { antibot: true  }); return reply('✅ _Antibot ON_'); }
      if (sub === 'off') { scfg(jid, { antibot: false }); return reply('❌ _Antibot OFF_'); }
      return reply(`*Antibot:* ${st(cfg.antibot)}\n_${prefix}antibot on/off_`);
    }

    // ── ANTISPAM ────────────────────────────────────────────
    if (command === 'antispam') {
      if (!isOwner && !isAdmin) return;
      const sub = args[0]?.toLowerCase();
      if (sub === 'on')  { if (!isBotAdmin) return reply('_Make me admin first_'); scfg(jid, { antispam: true  }); return reply('✅ _Antispam ON — 5 msgs/8s = kick_'); }
      if (sub === 'off') { scfg(jid, { antispam: false }); return reply('❌ _Antispam OFF_'); }
      return reply(`*Antispam:* ${st(cfg.antispam)}\n_${prefix}antispam on/off_`);
    }

    // ── ANTIFAKE ────────────────────────────────────────────
    if (command === 'antifake') {
      if (!isOwner && !isAdmin) return;
      const sub = args[0]?.toLowerCase();
      if (sub === 'on')  { if (!isBotAdmin) return reply('_Make me admin first_'); scfg(jid, { antifake: true  }); return reply('✅ _Antifake ON_'); }
      if (sub === 'off') { scfg(jid, { antifake: false }); return reply('❌ _Antifake OFF_'); }
      return reply(`*Antifake:* ${st(cfg.antifake)}\n_${prefix}antifake on/off_`);
    }

    // ── ANTIWORD ────────────────────────────────────────────
    if (command === 'antiword') {
      if (!isOwner && !isAdmin) return;
      const sub = args[0]?.toLowerCase();
      if (sub === 'on')  { if (!isBotAdmin) return reply('_Make me admin first_'); scfg(jid, { antiword: true  }); return reply('✅ _Antiword ON_'); }
      if (sub === 'off') { scfg(jid, { antiword: false }); return reply('❌ _Antiword OFF_'); }
      if (sub === 'set') { const w = args.slice(1).join(','); if (!w) return reply(`_Usage: ${prefix}antiword set fuck,shit_`); scfg(jid, { antiwordList: w }); return reply(`✅ _Blocked words: ${w}_`); }
      if (sub === 'list') return reply(`_Words: ${cfg.antiwordList || 'default list'}_`);
      return reply(
        `*Antiword:* ${st(cfg.antiword)}\n*Words:* _${cfg.antiwordList || 'default'}_\n\n` +
        `_${prefix}antiword on/off_\n_${prefix}antiword set word1,word2_`
      );
    }

    // ── ANTIPROMOTE ─────────────────────────────────────────
    if (command === 'antipromote') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub === 'on')  { scfg(jid, { antipromote: true  }); return reply('✅ _Antipromote ON_'); }
      if (sub === 'off') { scfg(jid, { antipromote: false }); return reply('❌ _Antipromote OFF_'); }
      return reply(`*Antipromote:* ${st(cfg.antipromote)}\n_${prefix}antipromote on/off_`);
    }

    // ── ANTIDEMOTE ──────────────────────────────────────────
    if (command === 'antidemote') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub === 'on')  { scfg(jid, { antidemote: true  }); return reply('✅ _Antidemote ON_'); }
      if (sub === 'off') { scfg(jid, { antidemote: false }); return reply('❌ _Antidemote OFF_'); }
      return reply(`*Antidemote:* ${st(cfg.antidemote)}\n_${prefix}antidemote on/off_`);
    }

    // ── PDM ─────────────────────────────────────────────────
    if (command === 'pdm') {
      if (!isOwner && !isAdmin) return;
      const sub = args[0]?.toLowerCase();
      if (sub === 'on')  { scfg(jid, { pdm: true  }); return reply('✅ _PDM ON — all admin changes reported_'); }
      if (sub === 'off') { scfg(jid, { pdm: false }); return reply('❌ _PDM OFF_'); }
      return reply(`*PDM (Promote/Demote Monitor):* ${st(cfg.pdm)}\n_${prefix}pdm on/off_`);
    }

    // ── AUTOUNMUTE ──────────────────────────────────────────
    if (command === 'autounmute') {
      if (!isOwner && !isAdmin) return;
      const opt = text.trim();
      if (!opt) return reply(
        `*Auto Unmute*\n\n*Scheduled:* _${cfg.autounmute || 'none'}_\n\n` +
        `_${prefix}autounmute 22 00 (10PM IST)_\n_${prefix}autounmute off_`
      );
      if (opt.toLowerCase() === 'off') { scfg(jid, { autounmute: null }); return reply('❌ _Auto unmute cancelled_'); }
      const parts = opt.match(/^(\d{1,2})\s+(\d{2})$/);
      if (!parts) return reply(`_Format: ${prefix}autounmute HH MM_`);
      const [, hh, mm] = parts;
      if (parseInt(hh) > 23 || parseInt(mm) > 59) return reply('_Invalid time_');
      if (!isBotAdmin) return reply('_Make me admin first_');
      const time = `${hh.padStart(2,'0')}:${mm}`;
      scfg(jid, { autounmute: time });
      const tgt = new Date(); tgt.setHours(parseInt(hh), parseInt(mm), 0, 0);
      if (tgt <= new Date()) tgt.setDate(tgt.getDate() + 1);
      setTimeout(async () => { try { await sock.groupSettingUpdate(jid, 'not_announcement'); scfg(jid, { autounmute: null }); } catch (_) {} }, tgt - new Date());
      return reply(`✅ _Group opens at ${time} IST_`);
    }

    // ── GETMUTE ─────────────────────────────────────────────
    if (command === 'getmute') {
      if (!isOwner && !isAdmin) return;
      const entries = Object.entries(rdb()).filter(([,v]) => v.autounmute);
      if (!entries.length) return reply('_No scheduled unmutes_');
      return reply('*Scheduled Unmutes*\n\n' + entries.map(([g,v],i) => `${i+1}. \`${g.split('@')[0]}\` — _${v.autounmute} IST_`).join('\n'));
    }

    // ── CALLREJECT ──────────────────────────────────────────
    if (command === 'callreject') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      const val = args.slice(1).join(' ').trim();
      const d   = rdb(); if (!d.__global) d.__global = {};
      const g   = d.__global;
      if (!sub || sub === 'status') return reply(
        `*Call Rejection*\n\n*Status:* ${st(g.rejectCalls)}\n*Message:* _${g.callRejectMsg || 'none'}_\n*Whitelist:* _${g.callWhitelist || 'none'}_\n\n_${prefix}callreject on/off/msg/allow_`
      );
      if (sub === 'on'  || sub === 'enable')  { g.rejectCalls = true;  wdb(d); return reply('✅ _Call rejection ON_'); }
      if (sub === 'off' || sub === 'disable') { g.rejectCalls = false; wdb(d); return reply('❌ _Call rejection OFF_'); }
      if (sub === 'msg') { if (!val || val === 'off') { g.callRejectMsg = null; } else { g.callRejectMsg = val; } wdb(d); return reply(`✅ _Message ${val && val !== 'off' ? 'set' : 'removed'}_`); }
      if (sub === 'allow') { if (!val) return reply(`_Usage: ${prefix}callreject allow 91XXXXXXXXXX_`); const nums = (g.callWhitelist||'').split(',').filter(Boolean); nums.push(val.replace(/\D/g,'')); g.callWhitelist = [...new Set(nums)].join(','); wdb(d); return reply(`✅ _${val} whitelisted_`); }
      return reply('_Options: on | off | msg | allow | status_');
    }
  },

  // ── Passive enforcement on every group message ────────────
  onText: true,

  async handleText(sock, m, context) {
    if (!m.isGroup) return;
    if (context.isOwner || context.isAdmin || m.fromMe) return;

    const jid  = m.chat;
    const cfg  = gcfg(jid);
    const body = (m.body || '').trim();
    if (!body) return;

    // ── Antilink ──────────────────────────────────────────
    if (cfg.antilink && hasLink(body) && !linkAllowed(body, cfg)) {
      await del(sock, m.key);
      const action = cfg.antilinkAction || 'delete';
      if (action === 'warn') {
        const limit = cfg.antilinkWarnLimit || 3;
        const count = addWarn(jid, `lnk_${m.sender}`);
        await sock.sendMessage(jid, mntn(m.sender, `⚠️ Link not allowed! Warning *${count}/${limit}*`));
        if (count >= limit) { resetWarn(jid, `lnk_${m.sender}`); if (context.isBotAdmin) await kick(sock, jid, m.sender); }
      } else if (action === 'kick' && context.isBotAdmin) {
        await sock.sendMessage(jid, mntn(m.sender, '🚫 Kicked for sending a link'));
        await kick(sock, jid, m.sender);
      }
      return;
    }

    // ── Antispam ──────────────────────────────────────────
    if (cfg.antispam && isSpam(jid, m.sender)) {
      await del(sock, m.key);
      if (context.isBotAdmin) {
        await sock.sendMessage(jid, mntn(m.sender, '🚫 Kicked for spamming'));
        await kick(sock, jid, m.sender);
      }
      return;
    }

    // ── Antibot ───────────────────────────────────────────
    if (cfg.antibot) {
      const botMsg = m.key?.id?.startsWith('3EB0') || (m.pushName === '' && m.isGroup);
      if (botMsg && context.isBotAdmin) {
        await del(sock, m.key);
        await kick(sock, jid, m.sender);
      }
      return;
    }

    // ── Antiword ──────────────────────────────────────────
    if (cfg.antiword && hasBadWord(body, cfg.antiwordList?.split(',').map(w => w.trim()))) {
      await del(sock, m.key);
      if (context.isBotAdmin) {
        await sock.sendMessage(jid, mntn(m.sender, '⚠️ Bad word detected — kicked'));
        await kick(sock, jid, m.sender);
      }
      return;
    }
  },
};
