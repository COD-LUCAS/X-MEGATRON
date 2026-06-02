/**
 * library/antifunction.js
 *
 * ALL anti-features in ONE file:
 *   - Antilink (detect + action + custom domains)
 *   - Antispam (message rate limiting)
 *   - Antibadword (bad word detection + action)
 *   - Antidelete (store + report deleted messages)
 *
 * Data: database/group_data.json
 * Antidelete config: database/antidelete.json
 * Antidelete media: database/tmp/
 *
 * Called directly from index.js on EVERY message — no plugin loader involved.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ─────────────────────────────────────────────────────────────
const DATA_FILE   = path.join(__dirname, '..', 'database', 'group_data.json');
const AD_CONFIG   = path.join(__dirname, '..', 'database', 'antidelete.json');
const TMP_DIR     = path.join(__dirname, '..', 'database', 'tmp');

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────
// DATA LAYER
// ─────────────────────────────────────────────────────────────────────
const DEFAULTS = {
  antilink:    {},
  antibadword: {},
  antispam:    {},
  warnings:    {},
};

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULTS, null, 2));
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const k of Object.keys(DEFAULTS)) { if (!raw[k]) raw[k] = {}; }
    return raw;
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function save(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); return true; }
  catch (_) { return false; }
}

// ── ANTILINK config ───────────────────────────────────────────────────
const setAntilink    = (gid, enabled, action = 'delete', domains = []) => {
  const d = load();
  d.antilink[gid] = { enabled, action, domains: domains || [] };
  return save(d);
};
const getAntilink    = (gid) => { const d = load(); return d.antilink[gid] || null; };
const removeAntilink = (gid) => { const d = load(); delete d.antilink[gid]; return save(d); };

// ── ANTIBADWORD config ────────────────────────────────────────────────
const setAntibadword    = (gid, enabled, action = 'delete') => {
  const d = load();
  const ex = d.antibadword[gid] || { words: [] };
  d.antibadword[gid] = { enabled, action, words: ex.words };
  return save(d);
};
const getAntibadword    = (gid) => { const d = load(); return d.antibadword[gid] || null; };
const removeAntibadword = (gid) => { const d = load(); delete d.antibadword[gid]; return save(d); };
const addBadword        = (gid, word) => {
  const d = load();
  if (!d.antibadword[gid]) d.antibadword[gid] = { enabled: false, action: 'delete', words: [] };
  if (d.antibadword[gid].words.includes(word)) return false;
  d.antibadword[gid].words.push(word);
  return save(d);
};
const removeBadword = (gid, word) => {
  const d = load();
  const words = d.antibadword[gid]?.words || [];
  const idx = words.indexOf(word);
  if (idx === -1) return false;
  words.splice(idx, 1);
  return save(d);
};
const getBadwords = (gid) => { const d = load(); return d.antibadword[gid]?.words || []; };

// ── ANTISPAM config ───────────────────────────────────────────────────
const setAntispam    = (gid, enabled, limit = 5) => {
  const d = load(); d.antispam[gid] = { enabled, limit }; return save(d);
};
const getAntispam    = (gid) => { const d = load(); return d.antispam[gid] || null; };
const removeAntispam = (gid) => { const d = load(); delete d.antispam[gid]; return save(d); };

// ── WARNINGS ──────────────────────────────────────────────────────────
const incrementWarning = (gid, uid) => {
  const d = load();
  if (!d.warnings[gid]) d.warnings[gid] = {};
  d.warnings[gid][uid] = (d.warnings[gid][uid] || 0) + 1;
  save(d);
  return d.warnings[gid][uid];
};
const resetWarning = (gid, uid) => {
  const d = load();
  if (d.warnings[gid]) { d.warnings[gid][uid] = 0; save(d); }
};

// ── ANTIDELETE config ─────────────────────────────────────────────────
function loadAdConfig() {
  try {
    if (!fs.existsSync(AD_CONFIG)) return { enabled: false, target: 'group' };
    const c = JSON.parse(fs.readFileSync(AD_CONFIG, 'utf8'));
    if (!c.target) c.target = 'group';
    return c;
  } catch (_) { return { enabled: false, target: 'group' }; }
}

function saveAdConfig(data) {
  try { fs.writeFileSync(AD_CONFIG, JSON.stringify(data, null, 2)); } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────
// ANTILINK ENGINE
// ─────────────────────────────────────────────────────────────────────
// Comprehensive link detection — catches all URL forms
const LINK_REGEX = /(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i;

// Extra patterns for common messengers
const EXTRA_PATTERNS = [
  /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i,
  /wa\.me\/[^\s]+/i,
  /t\.me\/[^\s]+/i,
  /bit\.ly\/[^\s]+/i,
  /tinyurl\.com\/[^\s]+/i,
];

function containsLink(text, customDomains = []) {
  if (!text) return false;
  if (LINK_REGEX.test(text)) return true;
  if (EXTRA_PATTERNS.some(r => r.test(text))) return true;
  // custom domain check
  if (customDomains.length > 0) {
    const lower = text.toLowerCase();
    if (customDomains.some(d => lower.includes(d.toLowerCase()))) return true;
  }
  return false;
}

async function runAntilink(sock, m, isAdmin) {
  if (!m.isGroup) return;
  const cfg = getAntilink(m.chat);
  if (!cfg?.enabled) return;

  const body = m.body || '';
  // Also check caption inside media
  const caption = m.message?.imageMessage?.caption ||
                  m.message?.videoMessage?.caption ||
                  m.message?.documentMessage?.caption || '';

  const textToCheck = body || caption;
  if (!textToCheck) return;
  if (!containsLink(textToCheck, cfg.domains || [])) return;

  if (isAdmin) return; // skip admins

  const sender = m.sender || '';
  const groupName = m.chat;

  // Try to get group name
  let gName = m.chat;
  try {
    const meta = await sock.groupMetadata(m.chat);
    gName = meta.subject || m.chat;
  } catch (_) {}

  // Delete the message first
  try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}

  const action = cfg.action || 'delete';
  const WARN_LIMIT = 3;

  if (action === 'kick') {
    try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
    await sock.sendMessage(m.chat, {
      text: `_${gName} do not accept links 🚫\n@${sender.split('@')[0]} has been removed_`,
      mentions: [sender]
    }).catch(() => {});

  } else if (action === 'warn') {
    const count = incrementWarning(m.chat, sender);
    if (count >= WARN_LIMIT) {
      resetWarning(m.chat, sender);
      try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
      await sock.sendMessage(m.chat, {
        text: `_${gName} do not accept links 🚫\n@${sender.split('@')[0]} removed after ${WARN_LIMIT} warnings_`,
        mentions: [sender]
      }).catch(() => {});
    } else {
      await sock.sendMessage(m.chat, {
        text: `_${gName} do not accept links 🚫\n@${sender.split('@')[0]} warning ${count}/${WARN_LIMIT}. Further actions may kick_`,
        mentions: [sender]
      }).catch(() => {});
    }

  } else {
    // delete only
    await sock.sendMessage(m.chat, {
      text: `_${gName} do not accept links 🚫\n@${sender.split('@')[0]} further actions may kick_`,
      mentions: [sender]
    }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────
// ANTISPAM ENGINE
// ─────────────────────────────────────────────────────────────────────
const spamMap = new Map();

async function runAntispam(sock, m, isBotAdmin, isAdmin) {
  if (!m.isGroup) return;
  const cfg = getAntispam(m.chat);
  if (!cfg?.enabled) return;
  if (!m.body) return;
  if (isAdmin) return;
  if (!isBotAdmin) return;

  const sender = m.sender || '';
  const key    = `${m.chat}|${sender}`;
  const now    = Date.now();
  const limit  = cfg.limit || 5;

  if (!spamMap.has(key)) spamMap.set(key, []);
  const times = spamMap.get(key).filter(t => now - t < 5000);
  times.push(now);
  spamMap.set(key, times);

  if (times.length >= limit) {
    spamMap.set(key, []); // reset after action
    try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}
    await sock.sendMessage(m.chat, {
      text: `@${sender.split('@')[0]} _stop spamming_`,
      mentions: [sender]
    }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────
// ANTIBADWORD ENGINE
// ─────────────────────────────────────────────────────────────────────
const STANDARD_WORDS = [
  'fuck','fucker','fucking','fck','fuk','f*ck','f@ck','fucked',
  'shit','bitch','bastard','asshole','dick','cock','cunt',
  'pussy','prick','whore','slut','motherfucker','wanker',
  'jackass','douchebag','retard','faggot','nigger','nigga',
  'madarchod','bhosdike','bsdk','bhosda','lauda','lund',
  'chutiya','chut','randi','harami','behenchod','gandu',
  'benchod','betichod','gaand','chodne','chudai',
  'randi ki aulad','maa ki chut','teri maa ki',
  'porn','xxx','blowjob','handjob','cumshot','dildo',
  'gangbang','threesome','hentai',
];

function detectBadWord(text, customWords = []) {
  if (!text) return null;
  const clean = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const all   = [...new Set([...STANDARD_WORDS, ...customWords.map(w => w.toLowerCase())])];
  const words = clean.split(' ');
  for (const w of words) {
    if (w.length < 2) continue;
    if (all.includes(w)) return w;
  }
  for (const phrase of all) {
    if (phrase.includes(' ') && clean.includes(phrase)) return phrase;
  }
  return null;
}

async function runAntibadword(sock, m, isBotAdmin, isAdmin) {
  if (!m.isGroup) return;
  if (!m.body) return;
  const cfg = getAntibadword(m.chat);
  if (!cfg?.enabled) return;
  if (!isBotAdmin) return;
  if (isAdmin) return;

  const customWords = getBadwords(m.chat);
  const found = detectBadWord(m.body, customWords);
  if (!found) return;

  const sender = m.sender || '';
  const WARN_LIMIT = 3;

  try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}

  if (cfg.action === 'kick') {
    try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
    await sock.sendMessage(m.chat, {
      text: `@${sender.split('@')[0]} _removed for using bad words_`,
      mentions: [sender]
    }).catch(() => {});

  } else if (cfg.action === 'warn') {
    const count = incrementWarning(m.chat, sender);
    if (count >= WARN_LIMIT) {
      resetWarning(m.chat, sender);
      try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _removed after ${WARN_LIMIT} warnings for bad words_`,
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

// ─────────────────────────────────────────────────────────────────────
// ANTIDELETE ENGINE
// ─────────────────────────────────────────────────────────────────────
const messageStore = new Map();
const MAX_STORE    = 500;

// Tmp folder size watchdog
setInterval(() => {
  try {
    const size = fs.readdirSync(TMP_DIR).reduce((t, f) => {
      try { return t + fs.statSync(path.join(TMP_DIR, f)).size; } catch (_) { return t; }
    }, 0) / (1024 * 1024);
    if (size > 200) {
      fs.readdirSync(TMP_DIR).forEach(f => {
        try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) {}
      });
    }
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
    const cfg = loadAdConfig();
    if (!cfg.enabled) return;
    if (!raw?.key?.id || !raw.message) return;
    if (raw.key.fromMe) return;

    const id     = raw.key.id;
    const sender = raw.key.participant || raw.key.remoteJid || '';
    const chat   = raw.key.remoteJid  || '';
    const msg    = raw.message;

    let content = '', mediaType = '', mediaPath = '', isViewOnce = false;

    // Unwrap view-once
    const voMsg = msg.viewOnceMessageV2?.message || msg.viewOnceMessage?.message;
    if (voMsg) {
      if (voMsg.imageMessage) {
        mediaType = 'image'; content = voMsg.imageMessage.caption || '';
        mediaPath = (await dlMedia(voMsg.imageMessage, 'image', path.join(TMP_DIR, `${id}.jpg`))) || '';
        isViewOnce = true;
      } else if (voMsg.videoMessage) {
        mediaType = 'video'; content = voMsg.videoMessage.caption || '';
        mediaPath = (await dlMedia(voMsg.videoMessage, 'video', path.join(TMP_DIR, `${id}.mp4`))) || '';
        isViewOnce = true;
      }
    }
    else if (msg.conversation)               content = msg.conversation;
    else if (msg.extendedTextMessage?.text)  content = msg.extendedTextMessage.text;
    else if (msg.imageMessage)  {
      mediaType = 'image'; content = msg.imageMessage.caption || '';
      mediaPath = (await dlMedia(msg.imageMessage, 'image', path.join(TMP_DIR, `${id}.jpg`))) || '';
    }
    else if (msg.videoMessage)  {
      mediaType = 'video'; content = msg.videoMessage.caption || '';
      mediaPath = (await dlMedia(msg.videoMessage, 'video', path.join(TMP_DIR, `${id}.mp4`))) || '';
    }
    else if (msg.audioMessage)  {
      mediaType = 'audio';
      const ext = msg.audioMessage.mimetype?.includes('ogg') ? 'ogg' : 'mp3';
      mediaPath = (await dlMedia(msg.audioMessage, 'audio', path.join(TMP_DIR, `${id}.${ext}`))) || '';
    }
    else if (msg.stickerMessage) {
      mediaType = 'sticker';
      mediaPath = (await dlMedia(msg.stickerMessage, 'sticker', path.join(TMP_DIR, `${id}.webp`))) || '';
    }
    else if (msg.documentMessage) {
      mediaType = 'document';
      content = msg.documentMessage.caption || msg.documentMessage.fileName || '';
    }

    // Trim store
    if (messageStore.size >= MAX_STORE) {
      const oldest = messageStore.keys().next().value;
      const old    = messageStore.get(oldest);
      if (old?.mediaPath) try { fs.unlinkSync(old.mediaPath); } catch (_) {}
      messageStore.delete(oldest);
    }

    messageStore.set(id, { content, mediaType, mediaPath, sender, chat, isViewOnce });

    // Anti-view-once: forward to owner immediately
    if (isViewOnce && mediaPath && fs.existsSync(mediaPath)) {
      try {
        const ownerJid = (sock.user?.id?.split(':')[0] || '') + '@s.whatsapp.net';
        const buf      = fs.readFileSync(mediaPath);
        const caption  = `_anti view once - ${mediaType} from @${sender.split('@')[0]}_`;
        if (mediaType === 'image') await sock.sendMessage(ownerJid, { image: buf, caption, mentions: [sender] }).catch(() => {});
        if (mediaType === 'video') await sock.sendMessage(ownerJid, { video: buf, caption, mentions: [sender] }).catch(() => {});
      } catch (_) {}
    }
  } catch (err) {
    console.error('[antidelete] storeMessage:', err.message);
  }
}

async function handleRevocation(sock, updates) {
  try {
    const cfg = loadAdConfig();
    if (!cfg.enabled) return;

    for (const update of updates) {
      try {
        const proto =
          update?.update?.message?.protocolMessage ||
          update?.message?.protocolMessage         ||
          update?.update?.protocolMessage          ||
          null;

        if (!proto) continue;
        if (proto.type !== 0) continue; // 0 = REVOKE

        const msgId     = proto.key?.id;
        const chatId    = update.key?.remoteJid || proto.key?.remoteJid || '';
        const deletedBy = update.key?.participant || update.key?.remoteJid || '';

        if (!msgId || !chatId) continue;

        const botNum = sock.user?.id?.split(':')[0] || '';
        if (deletedBy.includes(botNum)) continue;

        const original = messageStore.get(msgId);
        if (!original) continue;

        // Resolve target
        const ownerJid = botNum + '@s.whatsapp.net';
        let target = original.chat || chatId;
        if (cfg.target === 'owner') target = ownerJid;
        else if (cfg.target !== 'group' && cfg.target) {
          target = cfg.target.includes('@') ? cfg.target : cfg.target + '@s.whatsapp.net';
        }

        const senderNum = original.sender?.split('@')[0] || 'unknown';
        const byNum     = deletedBy?.split('@')[0] || 'unknown';

        // Get group name if applicable
        let groupLabel = original.chat || chatId;
        if ((original.chat || chatId).endsWith('@g.us')) {
          try {
            const meta = await sock.groupMetadata(original.chat || chatId);
            groupLabel = meta.subject || groupLabel;
          } catch (_) {}
        }

        // Build report
        let report = `_Deleted Message_\n\n_From: @${senderNum}_\n_Group: ${groupLabel}_`;
        if (original.content) report += `\n\n_Content:_\n${original.content}`;

        const mentions = [deletedBy, original.sender].filter(Boolean);

        await sock.sendMessage(target, { text: report, mentions }).catch(() => {});

        // Send deleted media
        if (original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath)) {
          const buf     = fs.readFileSync(original.mediaPath);
          const caption = `_Deleted ${original.mediaType} from @${senderNum}_`;
          try {
            if      (original.mediaType === 'image')   await sock.sendMessage(target, { image:   buf, caption });
            else if (original.mediaType === 'video')   await sock.sendMessage(target, { video:   buf, caption });
            else if (original.mediaType === 'sticker') await sock.sendMessage(target, { sticker: buf });
            else if (original.mediaType === 'audio')   await sock.sendMessage(target, { audio:   buf, mimetype: 'audio/mpeg', ptt: false });
          } catch (_) {}
          try { fs.unlinkSync(original.mediaPath); } catch (_) {}
        }

        messageStore.delete(msgId);
      } catch (e) {
        console.error('[antidelete] update error:', e.message);
      }
    }
  } catch (err) {
    console.error('[antidelete] handleRevocation:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────
// MASTER RUNNER — call this from index.js on every message
// ─────────────────────────────────────────────────────────────────────
async function runGroupProtection(sock, m) {
  if (!m.isGroup) return;
  if (!m.sender)  return;

  // Live admin check
  let isSenderAdmin = false;
  let isBotAdmin    = false;
  try {
    const isAdminHelper = require('./isAdmin');
    const result = await isAdminHelper(sock, m.chat, m.sender);
    isSenderAdmin = result.isSenderAdmin;
    isBotAdmin    = result.isBotAdmin;
  } catch (_) {}

  // Owner always skipped
  const ownerNums = (process.env.OWNER || '').split(',').map(v => v.trim().replace(/\D/g, ''));
  const senderNum = m.sender.split('@')[0].replace(/\D/g, '');
  if (ownerNums.some(o => senderNum.endsWith(o.slice(-10)))) return;

  // Run all checks — independent, all run even if one acts
  await runAntispam(sock, m, isBotAdmin, isSenderAdmin).catch(() => {});
  await runAntilink(sock, m, isSenderAdmin).catch(() => {});
  await runAntibadword(sock, m, isBotAdmin, isSenderAdmin).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────
module.exports = {
  // Master runner (call from index.js)
  runGroupProtection,
  storeMessage,
  handleRevocation,

  // Antidelete config
  loadAdConfig,
  saveAdConfig,

  // Antilink
  setAntilink, getAntilink, removeAntilink,
  containsLink,

  // Antibadword
  setAntibadword, getAntibadword, removeAntibadword,
  addBadword, removeBadword, getBadwords,
  detectBadWord,

  // Antispam
  setAntispam, getAntispam, removeAntispam,

  // Warnings
  incrementWarning, resetWarning,
};