'use strict';

const fs   = require('fs');
const path = require('path');

const DB   = path.join(__dirname, '..', 'database', 'group_settings.json');
const rdb  = () => { try { if (fs.existsSync(DB)) return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (_) {} return {}; };
const wdb  = (d) => { try { fs.writeFileSync(DB, JSON.stringify(d, null, 2)); } catch (_) {} };
const gcfg = (jid)        => rdb()[jid] || {};
const scfg = (jid, patch) => { const d = rdb(); d[jid] = { ...(d[jid]||{}), ...patch }; wdb(d); };

// URL detection
const URL_RE   = /(?:https?:\/\/|www\.)\S+|(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|io|co|me|xyz|app|dev|ly|link|gg|tv|ai|info|biz|online)\S*/i;
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

const DEF_WORDS  = ['fuck','shit','bitch','nigga','asshole','bastard'];
const hasBadWord = (text, custom) => {
  const words = custom?.length ? custom : DEF_WORDS;
  const lower = text.toLowerCase();
  return words.some(w => lower.includes(w.toLowerCase().trim()));
};

// Warn counter persisted to DB
const getWarn   = (jid, key) => gcfg(jid)[`w_${key}`] || 0;
const addWarn   = (jid, key) => { const n = getWarn(jid,key)+1; scfg(jid,{[`w_${key}`]:n}); return n; };
const resetWarn = (jid, key) => scfg(jid,{[`w_${key}`]:0});

// Spam tracker
const spamMap = new Map();
const trackSpam = (jid, sender, limit=5, ms=8000) => {
  const k = `${jid}::${sender}`;
  const now = Date.now();
  const e = spamMap.get(k) || { c:0, t:now };
  if (now - e.t > ms) { spamMap.set(k,{c:1,t:now}); return false; }
  e.c++; spamMap.set(k,e);
  if (e.c >= limit) { spamMap.delete(k); return true; }
  return false;
};

const safeDel  = async (sock, key)         => { try { await sock.sendMessage(key.remoteJid, { delete: key }); } catch(_){} };
const safeKick = async (sock, jid, sender) => { try { await sock.groupParticipantsUpdate(jid, [sender], 'remove'); } catch(_){} };
const mntn     = (sender, txt)             => ({ text: `@${sender.split('@')[0]} ${txt}`, mentions: [sender] });
const st       = (v)                       => v ? '_ON_' : '_OFF_';

module.exports = {
  command: [
    'antilink','antidelete','antibot','antispam','antifake',
    'antiword','antipromote','antidemote','anticall',
    'pdm','autounmute','getmute','callreject',
  ],
  category: 'group',
  desc: 'Group protection',
  usage: '.antilink on/off | .antispam on/off | .antibot on/off | .antiword on/off',

  async execute(sock, m, context) {
    const { command, args, text, reply, isOwner, prefix } = context;
    const jid = m.chat;
    const cfg = gcfg(jid);

    if (command === 'anticall') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub === 'on')  { scfg('__global', { anticall: true  }); return reply('_Anticall ON_'); }
      if (sub === 'off') { scfg('__global', { anticall: false }); return reply('_Anticall OFF_'); }
      return reply(`_Anticall: ${rdb().__global?.anticall ? 'ON' : 'OFF'}_\n_${prefix}anticall on/off_`);
    }

    if (command === 'antidelete') {
      if (!isOwner) return reply('_Owner only_');
      const opt = text.toLowerCase().trim();
      if (!opt) return reply(`_Anti Delete_\n\n_Status: ${cfg.antidelete||'off'}_\n\n_${prefix}antidelete chat/sudo/off_`);
      if (!['chat','sudo','off'].includes(opt)) return reply('_Options: chat | sudo | off_');
      scfg(jid, { antidelete: opt });
      return reply(`_Anti-delete → ${opt}_`);
    }

    if (command === 'antilink') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase() || 'status';
      const val = args.slice(1).join(' ').trim();
      switch (sub) {
        case 'on':
          scfg(jid, { antilink: true });
          return reply(`_Antilink ON_`);
        case 'off':
          scfg(jid, { antilink: false }); 
          return reply('_Antilink OFF_');
        case 'mode':
          if (!['warn','kick','delete'].includes(val)) return reply('_Modes: warn | kick | delete_');
          scfg(jid, { antilinkAction: val }); 
          return reply(`_Mode → ${val}_`);
        case 'allow':
          if (!val) return reply(`_Usage: ${prefix}antilink allow youtube.com,wa.me_`);
          scfg(jid, { antilinkMode: 'whitelist', antilinkDomains: val }); 
          return reply(`_Whitelist set_`);
        case 'block':
          if (!val) return reply(`_Usage: ${prefix}antilink block domain.com_`);
          scfg(jid, { antilinkMode: 'blacklist', antilinkDomains: val }); 
          return reply(`_Blacklist set_`);
        default:
          return reply(
            `_Antilink_\n\n` +
            `_Status: ${cfg.antilink ? 'ON' : 'OFF'}_\n_Action: ${cfg.antilinkAction||'delete'}_\n` +
            `_Type: ${cfg.antilinkMode||'block all'}_\n\n` +
            `_${prefix}antilink on/off/mode/allow/block_`
          );
      }
    }

    if (command === 'antibot') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub==='on')  { 
        scfg(jid,{antibot:true});  
        return reply('_Antibot ON_'); 
      }
      if (sub==='off') { 
        scfg(jid,{antibot:false}); 
        return reply('_Antibot OFF_'); 
      }
      return reply(`_Antibot: ${cfg.antibot ? 'ON' : 'OFF'}_\n_${prefix}antibot on/off_`);
    }

    if (command === 'antispam') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub==='on')  { 
        scfg(jid,{antispam:true});  
        return reply('_Antispam ON_'); 
      }
      if (sub==='off') { 
        scfg(jid,{antispam:false}); 
        return reply('_Antispam OFF_'); 
      }
      return reply(`_Antispam: ${cfg.antispam ? 'ON' : 'OFF'}_\n_${prefix}antispam on/off_`);
    }

    if (command === 'antifake') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub==='on')  { 
        scfg(jid,{antifake:true});  
        return reply('_Antifake ON_'); 
      }
      if (sub==='off') { 
        scfg(jid,{antifake:false}); 
        return reply('_Antifake OFF_'); 
      }
      return reply(`_Antifake: ${cfg.antifake ? 'ON' : 'OFF'}_\n_${prefix}antifake on/off_`);
    }

    if (command === 'antiword') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub==='on') { 
        scfg(jid,{antiword:true});  
        return reply('_Antiword ON_'); 
      }
      if (sub==='off') { 
        scfg(jid,{antiword:false}); 
        return reply('_Antiword OFF_'); 
      }
      if (sub==='set') { 
        const w=args.slice(1).join(','); 
        if(!w) return reply(`_Usage: ${prefix}antiword set fuck,shit_`); 
        scfg(jid,{antiwordList:w}); 
        return reply(`_Words set_`); 
      }
      if (sub==='list') return reply(`_Words: ${cfg.antiwordList||'default'}_`);
      return reply(`_Antiword: ${cfg.antiword ? 'ON' : 'OFF'}_\n_Words: ${cfg.antiwordList||'default'}_\n_${prefix}antiword on/off/set/list_`);
    }

    if (command === 'antipromote') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub==='on')  { scfg(jid,{antipromote:true});  return reply('_Antipromote ON_'); }
      if (sub==='off') { scfg(jid,{antipromote:false}); return reply('_Antipromote OFF_'); }
      return reply(`_Antipromote: ${cfg.antipromote ? 'ON' : 'OFF'}_\n_${prefix}antipromote on/off_`);
    }

    if (command === 'antidemote') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub==='on')  { scfg(jid,{antidemote:true});  return reply('_Antidemote ON_'); }
      if (sub==='off') { scfg(jid,{antidemote:false}); return reply('_Antidemote OFF_'); }
      return reply(`_Antidemote: ${cfg.antidemote ? 'ON' : 'OFF'}_\n_${prefix}antidemote on/off_`);
    }

    if (command === 'pdm') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      if (sub==='on')  { scfg(jid,{pdm:true});  return reply('_PDM ON_'); }
      if (sub==='off') { scfg(jid,{pdm:false}); return reply('_PDM OFF_'); }
      return reply(`_PDM: ${cfg.pdm ? 'ON' : 'OFF'}_\n_${prefix}pdm on/off_`);
    }

    if (command === 'autounmute') {
      if (!isOwner) return reply('_Owner only_');
      const opt = text.trim();
      if (!opt) return reply(`_Auto Unmute_\n_Scheduled: ${cfg.autounmute||'none'}_\n\n_${prefix}autounmute 22 00_\n_${prefix}autounmute off_`);
      if (opt.toLowerCase()==='off') { scfg(jid,{autounmute:null}); return reply('_Cancelled_'); }
      const parts = opt.match(/^(\d{1,2})\s+(\d{2})$/);
      if (!parts) return reply(`_Format: ${prefix}autounmute HH MM_`);
      const [,hh,mm] = parts;
      if (parseInt(hh)>23||parseInt(mm)>59) return reply('_Invalid time_');
      const time = `${hh.padStart(2,'0')}:${mm}`;
      scfg(jid, { autounmute: time });
      const tgt = new Date(); tgt.setHours(parseInt(hh),parseInt(mm),0,0);
      if (tgt<=new Date()) tgt.setDate(tgt.getDate()+1);
      setTimeout(async () => { try { await sock.groupSettingUpdate(jid,'not_announcement'); scfg(jid,{autounmute:null}); } catch(_){} }, tgt-new Date());
      return reply(`_Group opens at ${time}_`);
    }

    if (command === 'getmute') {
      if (!isOwner) return reply('_Owner only_');
      const entries = Object.entries(rdb()).filter(([,v])=>v.autounmute);
      if (!entries.length) return reply('_No scheduled unmutes_');
      return reply('_Scheduled_\n\n'+entries.map(([g,v],i)=>`_${i+1}. ${g.split('@')[0]} — ${v.autounmute}_`).join('\n'));
    }

    if (command === 'callreject') {
      if (!isOwner) return reply('_Owner only_');
      const sub = args[0]?.toLowerCase();
      const val = args.slice(1).join(' ').trim();
      const d = rdb(); if (!d.__global) d.__global = {};
      const g = d.__global;
      if (!sub||sub==='status') return reply(`_Call Rejection_\n\n_Status: ${g.rejectCalls ? 'ON' : 'OFF'}_\n_Message: ${g.callRejectMsg||'none'}_\n_${prefix}callreject on/off/msg/allow_`);
      if (sub==='on')   { g.rejectCalls=true;  wdb(d); return reply('_ON_'); }
      if (sub==='off') { g.rejectCalls=false; wdb(d); return reply('_OFF_'); }
      if (sub==='msg') { g.callRejectMsg=(!val||val==='off')?null:val; wdb(d); return reply('_Updated_'); }
      if (sub==='allow') { if(!val) return reply(`_Usage: ${prefix}callreject allow number_`); const nums=(g.callWhitelist||'').split(',').filter(Boolean); nums.push(val.replace(/\D/g,'')); g.callWhitelist=[...new Set(nums)].join(','); wdb(d); return reply(`_Whitelisted_`); }
      return reply('_Options: on|off|msg|allow|status_');
    }
  },

  // Passive enforcement
  onText: true,

  async handleText(sock, m, context) {
    if (!m.isGroup) return;
    if (context.isOwner || m.fromMe) return;

    const jid  = m.chat;
    const cfg  = gcfg(jid);
    const body = (m.body || '').trim();
    if (!body) return;

    // Antiword - no admin check
    if (cfg.antiword) {
      const words = cfg.antiwordList?.split(',').map(w => w.trim()) || [];
      if (hasBadWord(body, words)) {
        await safeDel(sock, m.key);
        await sock.sendMessage(jid, mntn(m.sender, 'Bad word detected'));
        await safeKick(sock, jid, m.sender);
      }
      return;
    }

    // Antilink - no admin check
    if (cfg.antilink && hasLink(body) && !linkAllowed(body, cfg)) {
      await safeDel(sock, m.key);
      const action = cfg.antilinkAction || 'delete';
      if (action === 'warn') {
        const limit = cfg.antilinkWarnLimit || 3;
        const count = addWarn(jid, `lnk_${m.sender}`);
        await sock.sendMessage(jid, mntn(m.sender, `Link not allowed! Warning ${count}/${limit}`));
        if (count >= limit) {
          resetWarn(jid, `lnk_${m.sender}`);
          await safeKick(sock, jid, m.sender);
        }
      } else if (action === 'kick') {
        await sock.sendMessage(jid, mntn(m.sender, 'Kicked for sending a link'));
        await safeKick(sock, jid, m.sender);
      }
      return;
    }

    // Antispam - no admin check
    if (cfg.antispam && trackSpam(jid, m.sender)) {
      await safeDel(sock, m.key);
      await sock.sendMessage(jid, mntn(m.sender, 'Kicked for spamming'));
      await safeKick(sock, jid, m.sender);
      return;
    }

    // Antibot - no admin check
    if (cfg.antibot) {
      const isBot = m.key?.id?.startsWith('3EB0') || (m.pushName === '' && m.isGroup);
      if (isBot) {
        await safeDel(sock, m.key);
        await safeKick(sock, jid, m.sender);
      }
      return;
    }
  },
};