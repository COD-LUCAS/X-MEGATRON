/**
 * library/antifunction.js
 * ALL anti-features: antilink, antispam, antibadword, antifake, antidelete
 * Called via handleText hook in antispam plugin — fires on every message.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'database', 'group_data.json');
const AD_FILE   = path.join(__dirname, '..', 'database', 'antidelete.json');
const AF_FILE   = path.join(__dirname, '..', 'database', 'antifake.json');
const TMP_DIR   = path.join(__dirname, '..', 'database', 'tmp');

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

// ── DATA LAYER ─────────────────────────────────────────────────────────
const DEFAULTS = { antilink:{}, antibadword:{}, antispam:{}, warnings:{} };

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULTS, null, 2));
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const k of Object.keys(DEFAULTS)) { if (!raw[k]) raw[k] = {}; }
    return raw;
  } catch (_) { return JSON.parse(JSON.stringify(DEFAULTS)); }
}
function save(d) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); return true; }
  catch (_) { return false; }
}

const setAntilink    = (gid, enabled, action, domains) => { const d=load(); d.antilink[gid]={enabled,action:action||'delete',domains:domains||[]}; return save(d); };
const getAntilink    = (gid) => { const d=load(); return d.antilink[gid]||null; };
const removeAntilink = (gid) => { const d=load(); delete d.antilink[gid]; return save(d); };

const setAntibadword    = (gid, enabled, action) => { const d=load(); const ex=d.antibadword[gid]||{words:[]}; d.antibadword[gid]={enabled,action:action||'delete',words:ex.words}; return save(d); };
const getAntibadword    = (gid) => { const d=load(); return d.antibadword[gid]||null; };
const removeAntibadword = (gid) => { const d=load(); delete d.antibadword[gid]; return save(d); };
const addBadword        = (gid, word) => { const d=load(); if (!d.antibadword[gid]) d.antibadword[gid]={enabled:false,action:'delete',words:[]}; if (d.antibadword[gid].words.includes(word)) return false; d.antibadword[gid].words.push(word); return save(d); };
const removeBadword     = (gid, word) => { const d=load(); const w=d.antibadword[gid]?.words||[]; const i=w.indexOf(word); if (i===-1) return false; w.splice(i,1); return save(d); };
const getBadwords       = (gid) => { const d=load(); return d.antibadword[gid]?.words||[]; };

const setAntispam    = (gid, enabled, limit) => { const d=load(); d.antispam[gid]={enabled,limit:limit||5}; return save(d); };
const getAntispam    = (gid) => { const d=load(); return d.antispam[gid]||null; };
const removeAntispam = (gid) => { const d=load(); delete d.antispam[gid]; return save(d); };

const incrementWarning = (gid, uid) => { const d=load(); if (!d.warnings[gid]) d.warnings[gid]={}; d.warnings[gid][uid]=(d.warnings[gid][uid]||0)+1; save(d); return d.warnings[gid][uid]; };
const resetWarning     = (gid, uid) => { const d=load(); if (d.warnings[gid]) { d.warnings[gid][uid]=0; save(d); } };

// ── ANTIDELETE CONFIG ──────────────────────────────────────────────────
function loadAdConfig() {
  try { if (fs.existsSync(AD_FILE)) { const c=JSON.parse(fs.readFileSync(AD_FILE,'utf8')); if (!c.target) c.target='group'; return c; } } catch (_) {}
  return { enabled:false, target:'group' };
}
function saveAdConfig(d) { try { fs.writeFileSync(AD_FILE, JSON.stringify(d,null,2)); } catch (_) {} }

// ── ANTIFAKE CONFIG ────────────────────────────────────────────────────
function loadAfConfig() {
  try { if (fs.existsSync(AF_FILE)) return JSON.parse(fs.readFileSync(AF_FILE,'utf8')); } catch (_) {}
  return {};
}
function saveAfConfig(d) { try { fs.writeFileSync(AF_FILE, JSON.stringify(d,null,2)); } catch (_) {} }
const setAntifake    = (gid) => { const d=loadAfConfig(); d[gid]={enabled:true}; saveAfConfig(d); };
const removeAntifake = (gid) => { const d=loadAfConfig(); delete d[gid]; saveAfConfig(d); };
const getAntifake    = (gid) => { const d=loadAfConfig(); return d[gid]||null; };

// ── LINK DETECTION ─────────────────────────────────────────────────────
const WA_GROUP_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i;
const TG_RE       = /t\.me\/[^\s]+/i;
const WA_ME_RE    = /wa\.me\/[^\s]+/i;
const URL_RE      = /https?:\/\/[^\s]+/gi;
const BARE_URL_RE = /([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?/gi;

function detectLinks(text) {
  if (!text) return [];
  const found = new Set();
  let m;
  const re1 = new RegExp(WA_GROUP_RE.source, 'gi'); while ((m = re1.exec(text))) found.add(m[0]);
  const re2 = new RegExp(TG_RE.source, 'gi');       while ((m = re2.exec(text))) found.add(m[0]);
  const re3 = new RegExp(WA_ME_RE.source, 'gi');    while ((m = re3.exec(text))) found.add(m[0]);
  const re4 = new RegExp(URL_RE.source, 'gi');       while ((m = re4.exec(text))) found.add(m[0]);
  const re5 = new RegExp(BARE_URL_RE.source, 'gi'); while ((m = re5.exec(text))) { if (m[0].includes('.')) found.add(m[0]); }
  return [...found];
}

// ── SPAM TRACKER ───────────────────────────────────────────────────────
const spamMap = new Map();

function isSpamming(chatId, sender, limit) {
  const key = chatId + '|' + sender;
  const now = Date.now();
  if (!spamMap.has(key)) spamMap.set(key, []);
  const times = spamMap.get(key).filter(t => now - t < 5000);
  times.push(now);
  spamMap.set(key, times);
  if (times.length >= limit) { spamMap.set(key, []); return true; }
  return false;
}

// ── BAD WORD DETECTION ─────────────────────────────────────────────────
const STANDARD_WORDS = [
  'fuck','fucker','fucking','fck','fuk','f*ck','shit','bitch','bastard','asshole',
  'dick','cock','cunt','pussy','prick','whore','slut','motherfucker','wanker',
  'jackass','douchebag','retard','faggot','nigger','nigga',
  'madarchod','bhosdike','bsdk','bhosda','lauda','lund','chutiya','chut','randi',
  'harami','behenchod','gandu','benchod','betichod','gaand','chodne','chudai',
  'randi ki aulad','maa ki chut','teri maa ki',
  'porn','xxx','blowjob','handjob','cumshot','dildo','gangbang','threesome','hentai',
];

function detectBadWord(text, customWords) {
  if (!text) return null;
  const all   = [...new Set([...STANDARD_WORDS, ...(customWords||[]).map(w => w.toLowerCase())])];
  const clean = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ');
  for (const w of words) { if (w.length < 2) continue; if (all.includes(w)) return w; }
  for (const p of all) { if (p.includes(' ') && clean.includes(p)) return p; }
  return null;
}

// ── ANTIFAKE NUMBER CHECK ──────────────────────────────────────────────
const ALLOWED_PREFIXES = ['91','1','44','61','971','966','65','60','92','880','234','27','62','55','86','81','82','966','974','973','965'];

function isFakeNumber(jid) {
  const num = (jid || '').split('@')[0].replace(/\D/g, '');
  if (num.length < 7 || num.length > 15) return true;
  return !ALLOWED_PREFIXES.some(p => num.startsWith(p));
}

// ── ANTIDELETE STORE ───────────────────────────────────────────────────
const messageStore = new Map();
const MAX_STORE = 500;

setInterval(() => {
  try {
    const size = fs.readdirSync(TMP_DIR).reduce((t, f) => {
      try { return t + fs.statSync(path.join(TMP_DIR, f)).size; } catch (_) { return t; }
    }, 0) / (1024 * 1024);
    if (size > 200) fs.readdirSync(TMP_DIR).forEach(f => { try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) {} });
  } catch (_) {}
}, 5 * 60 * 1000);

async function dlMedia(msgObj, type, savePath) {
  try {
    const { downloadContentFromMessage } = require('@itsliaaa/baileys');
    const stream = downloadContentFromMessage(msgObj, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    fs.writeFileSync(savePath, Buffer.concat(chunks));
    return savePath;
  } catch (_) { return null; }
}

async function storeMessage(sock, raw) {
  try {
    if (!loadAdConfig().enabled) return;
    if (!raw?.key?.id || !raw.message || raw.key.fromMe) return;
    const id = raw.key.id;
    const sender = raw.key.participant || raw.key.remoteJid || '';
    const chat   = raw.key.remoteJid || '';
    const msg    = raw.message;
    let content = '', mediaType = '', mediaPath = '', isViewOnce = false;

    const voMsg = msg.viewOnceMessageV2?.message || msg.viewOnceMessage?.message;
    if (voMsg) {
      if (voMsg.imageMessage)      { mediaType='image';   content=voMsg.imageMessage.caption||'';  mediaPath=(await dlMedia(voMsg.imageMessage,'image',path.join(TMP_DIR,id+'.jpg')))||'';  isViewOnce=true; }
      else if (voMsg.videoMessage) { mediaType='video';   content=voMsg.videoMessage.caption||'';  mediaPath=(await dlMedia(voMsg.videoMessage,'video',path.join(TMP_DIR,id+'.mp4')))||'';  isViewOnce=true; }
    }
    else if (msg.conversation)              content = msg.conversation;
    else if (msg.extendedTextMessage?.text) content = msg.extendedTextMessage.text;
    else if (msg.imageMessage)    { mediaType='image';    content=msg.imageMessage.caption||'';    mediaPath=(await dlMedia(msg.imageMessage,'image',path.join(TMP_DIR,id+'.jpg')))||''; }
    else if (msg.videoMessage)    { mediaType='video';    content=msg.videoMessage.caption||'';    mediaPath=(await dlMedia(msg.videoMessage,'video',path.join(TMP_DIR,id+'.mp4')))||''; }
    else if (msg.audioMessage)    { mediaType='audio';    const ext=msg.audioMessage.mimetype?.includes('ogg')?'ogg':'mp3'; mediaPath=(await dlMedia(msg.audioMessage,'audio',path.join(TMP_DIR,id+'.'+ext)))||''; }
    else if (msg.stickerMessage)  { mediaType='sticker';  mediaPath=(await dlMedia(msg.stickerMessage,'sticker',path.join(TMP_DIR,id+'.webp')))||''; }
    else if (msg.documentMessage) { mediaType='document'; content=msg.documentMessage.caption||msg.documentMessage.fileName||''; }

    if (messageStore.size >= MAX_STORE) {
      const oldest = messageStore.keys().next().value;
      const old = messageStore.get(oldest);
      if (old?.mediaPath) try { fs.unlinkSync(old.mediaPath); } catch (_) {}
      messageStore.delete(oldest);
    }
    messageStore.set(id, { content, mediaType, mediaPath, sender, chat, isViewOnce });

    // Anti-view-once: forward to owner
    if (isViewOnce && mediaPath && fs.existsSync(mediaPath)) {
      try {
        const ownerJid = (sock.user?.id?.split(':')[0] || '') + '@s.whatsapp.net';
        const buf = fs.readFileSync(mediaPath);
        const cap = '_anti view once - ' + mediaType + ' from @' + sender.split('@')[0] + '_';
        if (mediaType === 'image') await sock.sendMessage(ownerJid, { image: buf, caption: cap, mentions: [sender] }).catch(() => {});
        if (mediaType === 'video') await sock.sendMessage(ownerJid, { video: buf, caption: cap, mentions: [sender] }).catch(() => {});
      } catch (_) {}
    }
  } catch (e) { console.error('[antidelete] store:', e.message); }
}

async function handleRevocation(sock, updates) {
  try {
    if (!loadAdConfig().enabled) return;
    for (const update of updates) {
      try {
        const proto =
          update?.update?.message?.protocolMessage ||
          update?.message?.protocolMessage         ||
          update?.update?.protocolMessage          ||
          null;
        if (!proto || proto.type !== 0) continue;

        const msgId     = proto.key?.id;
        const chatId    = update.key?.remoteJid || proto.key?.remoteJid || '';
        const deletedBy = update.key?.participant || update.key?.remoteJid || '';
        if (!msgId || !chatId) continue;

        const botNum = sock.user?.id?.split(':')[0] || '';
        if (deletedBy.includes(botNum)) continue;

        const original = messageStore.get(msgId);
        if (!original) continue;

        const cfg      = loadAdConfig();
        const ownerJid = botNum + '@s.whatsapp.net';
        let target     = original.chat || chatId;
        if (cfg.target === 'owner') target = ownerJid;
        else if (cfg.target !== 'group' && cfg.target) target = cfg.target.includes('@') ? cfg.target : cfg.target + '@s.whatsapp.net';

        let groupLabel = original.chat || chatId;
        if (groupLabel.endsWith('@g.us')) {
          try { const meta = await sock.groupMetadata(groupLabel); groupLabel = meta.subject || groupLabel; } catch (_) {}
        }

        const senderNum = original.sender?.split('@')[0] || 'unknown';
        let report = '_Deleted Message_\n\n_From: @' + senderNum + '_\n_Group: ' + groupLabel + '_';
        if (original.content) report += '\n\n_Content:_\n' + original.content;

        const mentions = [deletedBy, original.sender].filter(Boolean);
        await sock.sendMessage(target, { text: report, mentions }).catch(() => {});

        if (original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath)) {
          const buf = fs.readFileSync(original.mediaPath);
          const cap = '_Deleted ' + original.mediaType + ' from @' + senderNum + '_';
          try {
            if      (original.mediaType === 'image')   await sock.sendMessage(target, { image:   buf, caption: cap });
            else if (original.mediaType === 'video')   await sock.sendMessage(target, { video:   buf, caption: cap });
            else if (original.mediaType === 'sticker') await sock.sendMessage(target, { sticker: buf });
            else if (original.mediaType === 'audio')   await sock.sendMessage(target, { audio:   buf, mimetype: 'audio/mpeg', ptt: false });
          } catch (_) {}
          try { fs.unlinkSync(original.mediaPath); } catch (_) {}
        }
        messageStore.delete(msgId);
      } catch (e) { console.error('[antidelete] revoke:', e.message); }
    }
  } catch (e) { console.error('[antidelete] handleRevocation:', e.message); }
}

// ── MASTER RUNNER ─────────────────────────────────────────────────────
// Called from handleText in antispam.js — fires on EVERY group message
async function runGroupProtection(sock, m) {
  if (!m.isGroup || !m.sender || m.fromMe) return;

  let isSenderAdmin = false, isBotAdmin = false;
  try {
    const ia = require('./isAdmin');
    const r  = await ia(sock, m.chat, m.sender);
    isSenderAdmin = r.isSenderAdmin;
    isBotAdmin    = r.isBotAdmin;
  } catch (_) {}

  // Skip owner
  const ownerNums = (process.env.OWNER || '').split(',').map(v => v.trim().replace(/\D/g, ''));
  const sNum = m.sender.split('@')[0].replace(/\D/g, '');
  if (ownerNums.some(o => sNum.endsWith(o.slice(-10)))) return;
  if (isSenderAdmin) return;

  const body = m.body || '';
  const WARN_LIMIT = 3;

  // ── 1. ANTISPAM ────────────────────────────────────────────────────
  const spamCfg = getAntispam(m.chat);
  if (spamCfg?.enabled && body && isBotAdmin) {
    if (isSpamming(m.chat, m.sender, spamCfg.limit || 5)) {
      try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}
      await sock.sendMessage(m.chat, {
        text: '@' + m.sender.split('@')[0] + ' _stop spamming_',
        mentions: [m.sender]
      }).catch(() => {});
      return;
    }
  }

  // ── 2. ANTILINK ────────────────────────────────────────────────────
  const linkCfg = getAntilink(m.chat);
  if (linkCfg?.enabled) {
    const textToCheck = body ||
      m.message?.imageMessage?.caption ||
      m.message?.videoMessage?.caption ||
      m.message?.documentMessage?.caption || '';

    if (textToCheck) {
      const links   = detectLinks(textToCheck);
      const domains = linkCfg.domains || [];
      // If no custom domains: block ALL links. If custom domains: only block links NOT in allowed list
      const blocked = domains.length === 0
        ? links
        : links.filter(l => !domains.some(d => l.toLowerCase().includes(d.toLowerCase())));

      if (blocked.length > 0 && isBotAdmin) {
        try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}
        let gName = m.chat;
        try { const meta = await sock.groupMetadata(m.chat); gName = meta.subject || m.chat; } catch (_) {}
        const action = linkCfg.action || 'delete';

        if (action === 'kick') {
          try { await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (_) {}
          await sock.sendMessage(m.chat, {
            text: '_' + gName + ' do not accept links 🚫\n@' + m.sender.split('@')[0] + ' has been removed_',
            mentions: [m.sender]
          }).catch(() => {});
        } else if (action === 'warn') {
          const count = incrementWarning(m.chat, m.sender);
          if (count >= WARN_LIMIT) {
            resetWarning(m.chat, m.sender);
            try { await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (_) {}
            await sock.sendMessage(m.chat, {
              text: '_' + gName + ' do not accept links 🚫\n@' + m.sender.split('@')[0] + ' removed after ' + WARN_LIMIT + ' warnings_',
              mentions: [m.sender]
            }).catch(() => {});
          } else {
            await sock.sendMessage(m.chat, {
              text: '_' + gName + ' do not accept links 🚫\n@' + m.sender.split('@')[0] + ' warning ' + count + '/' + WARN_LIMIT + '. Further actions may kick_',
              mentions: [m.sender]
            }).catch(() => {});
          }
        } else {
          await sock.sendMessage(m.chat, {
            text: '_' + gName + ' do not accept links 🚫\n@' + m.sender.split('@')[0] + ' further actions may kick_',
            mentions: [m.sender]
          }).catch(() => {});
        }
        return;
      }
    }
  }

  // ── 3. ANTIBADWORD ─────────────────────────────────────────────────
  const bwCfg = getAntibadword(m.chat);
  if (bwCfg?.enabled && body && isBotAdmin) {
    const found = detectBadWord(body, getBadwords(m.chat));
    if (found) {
      try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}
      const action = bwCfg.action || 'delete';
      if (action === 'kick') {
        try { await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (_) {}
        await sock.sendMessage(m.chat, {
          text: '@' + m.sender.split('@')[0] + ' _removed for using bad words_',
          mentions: [m.sender]
        }).catch(() => {});
      } else if (action === 'warn') {
        const count = incrementWarning(m.chat, m.sender);
        if (count >= WARN_LIMIT) {
          resetWarning(m.chat, m.sender);
          try { await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (_) {}
          await sock.sendMessage(m.chat, {
            text: '@' + m.sender.split('@')[0] + ' _removed after ' + WARN_LIMIT + ' warnings for bad words_',
            mentions: [m.sender]
          }).catch(() => {});
        } else {
          await sock.sendMessage(m.chat, {
            text: '@' + m.sender.split('@')[0] + ' _warning ' + count + '/' + WARN_LIMIT + ' - bad words not allowed_',
            mentions: [m.sender]
          }).catch(() => {});
        }
      } else {
        await sock.sendMessage(m.chat, {
          text: '@' + m.sender.split('@')[0] + ' _bad words not allowed here_',
          mentions: [m.sender]
        }).catch(() => {});
      }
      return;
    }
  }

  // ── 4. ANTIFAKE ─────────────────────────────────────────────────────
  const fakeCfg = getAntifake(m.chat);
  if (fakeCfg?.enabled && isBotAdmin) {
    if (isFakeNumber(m.sender)) {
      try { await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (_) {}
      await sock.sendMessage(m.chat, {
        text: '@' + m.sender.split('@')[0] + ' _removed - fake/virtual number not allowed_',
        mentions: [m.sender]
      }).catch(() => {});
    }
  }
}

module.exports = {
  runGroupProtection, storeMessage, handleRevocation,
  loadAdConfig, saveAdConfig, loadAfConfig, saveAfConfig,
  setAntilink, getAntilink, removeAntilink, detectLinks,
  setAntibadword, getAntibadword, removeAntibadword, addBadword, removeBadword, getBadwords,
  setAntispam, getAntispam, removeAntispam,
  setAntifake, getAntifake, removeAntifake,
  incrementWarning, resetWarning,
};
