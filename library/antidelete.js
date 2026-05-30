/**
 * library/antidelete.js
 * Handles message storing, deletion detection, and anti-view-once.
 *
 * Config (database/antidelete.json):
 *   enabled: true/false
 *   target:  "group"   → send to same group/chat where deletion happened (default)
 *            "owner"   → send to owner DM
 *            "918xxx@s.whatsapp.net" → specific JID
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@itsliaaa/baileys');

const TMP_DIR     = path.join(__dirname, '..', 'database', 'tmp');
const CONFIG_FILE = path.join(__dirname, '..', 'database', 'antidelete.json');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── In-memory message store (max 500 entries) ─────────────────────────
const messageStore = new Map();
const MAX_STORE    = 500;

// ── Config helpers ────────────────────────────────────────────────────
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { enabled: false, target: 'group' };
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!c.target) c.target = 'group';
    return c;
  } catch (_) { return { enabled: false, target: 'group' }; }
}

function saveConfig(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (_) {}
}

// ── Resolve where to send the deleted message report ─────────────────
function resolveTarget(cfg, sock, chatId) {
  const ownerJid = (sock.user?.id?.split(':')[0] || '') + '@s.whatsapp.net';
  if (!cfg.target || cfg.target === 'group') return chatId; // same group/chat
  if (cfg.target === 'owner') return ownerJid;
  // specific JID
  return cfg.target.includes('@') ? cfg.target : cfg.target + '@s.whatsapp.net';
}

// ── Tmp folder cleanup (runs every 5 min, wipes if >200MB) ───────────
setInterval(() => {
  try {
    const sizeMB = fs.readdirSync(TMP_DIR).reduce((t, f) => {
      try { return t + fs.statSync(path.join(TMP_DIR, f)).size; } catch (_) { return t; }
    }, 0) / (1024 * 1024);

    if (sizeMB > 200) {
      fs.readdirSync(TMP_DIR).forEach(f => {
        try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) {}
      });
    }
  } catch (_) {}
}, 5 * 60 * 1000);

// ── Download helper ───────────────────────────────────────────────────
async function downloadMedia(msgObj, type, savePath) {
  try {
    const stream = downloadContentFromMessage(msgObj, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    fs.writeFileSync(savePath, Buffer.concat(chunks));
    return savePath;
  } catch (_) { return null; }
}

// ── storeMessage — called from index.js messages.upsert ───────────────
async function storeMessage(sock, raw) {
  try {
    const cfg = loadConfig();
    if (!cfg.enabled) return;
    if (!raw?.key?.id || !raw.message) return;
    if (raw.key.fromMe) return; // never store bot's own messages

    const id     = raw.key.id;
    const sender = raw.key.participant || raw.key.remoteJid || '';
    const chat   = raw.key.remoteJid || '';

    let content   = '';
    let mediaType = '';
    let mediaPath = '';
    let isViewOnce = false;

    const msg = raw.message;

    // ── Unwrap view-once ─────────────────────────────────────────
    const voMsg = msg.viewOnceMessageV2?.message || msg.viewOnceMessage?.message;
    if (voMsg) {
      if (voMsg.imageMessage) {
        mediaType  = 'image';
        content    = voMsg.imageMessage.caption || '';
        mediaPath  = (await downloadMedia(voMsg.imageMessage, 'image', path.join(TMP_DIR, `${id}.jpg`))) || '';
        isViewOnce = true;
      } else if (voMsg.videoMessage) {
        mediaType  = 'video';
        content    = voMsg.videoMessage.caption || '';
        mediaPath  = (await downloadMedia(voMsg.videoMessage, 'video', path.join(TMP_DIR, `${id}.mp4`))) || '';
        isViewOnce = true;
      }
    }
    else if (msg.conversation)                  { content = msg.conversation; }
    else if (msg.extendedTextMessage?.text)     { content = msg.extendedTextMessage.text; }
    else if (msg.imageMessage) {
      mediaType = 'image';
      content   = msg.imageMessage.caption || '';
      mediaPath = (await downloadMedia(msg.imageMessage, 'image', path.join(TMP_DIR, `${id}.jpg`))) || '';
    }
    else if (msg.videoMessage) {
      mediaType = 'video';
      content   = msg.videoMessage.caption || '';
      mediaPath = (await downloadMedia(msg.videoMessage, 'video', path.join(TMP_DIR, `${id}.mp4`))) || '';
    }
    else if (msg.audioMessage) {
      mediaType = 'audio';
      const ext = msg.audioMessage.mimetype?.includes('ogg') ? 'ogg' : 'mp3';
      mediaPath = (await downloadMedia(msg.audioMessage, 'audio', path.join(TMP_DIR, `${id}.${ext}`))) || '';
    }
    else if (msg.stickerMessage) {
      mediaType = 'sticker';
      mediaPath = (await downloadMedia(msg.stickerMessage, 'sticker', path.join(TMP_DIR, `${id}.webp`))) || '';
    }
    else if (msg.documentMessage) {
      mediaType = 'document';
      content   = msg.documentMessage.caption || msg.documentMessage.fileName || '';
    }

    // Limit store size
    if (messageStore.size >= MAX_STORE) {
      const oldest = messageStore.keys().next().value;
      const old    = messageStore.get(oldest);
      if (old?.mediaPath) try { fs.unlinkSync(old.mediaPath); } catch (_) {}
      messageStore.delete(oldest);
    }

    messageStore.set(id, { content, mediaType, mediaPath, sender, chat, isViewOnce });

    // ── Anti-view-once: forward to owner immediately ──────────────
    if (isViewOnce && mediaPath && fs.existsSync(mediaPath)) {
      try {
        const ownerJid = (sock.user?.id?.split(':')[0] || '') + '@s.whatsapp.net';
        const num      = sender.split('@')[0];
        const buf      = fs.readFileSync(mediaPath);
        const caption  = `_anti view once - ${mediaType}_\n_from: @${num}_`;

        if (mediaType === 'image') await sock.sendMessage(ownerJid, { image: buf, caption, mentions: [sender] });
        if (mediaType === 'video') await sock.sendMessage(ownerJid, { video: buf, caption, mentions: [sender] });
      } catch (_) {}
    }

  } catch (err) {
    console.error('[antidelete] storeMessage error:', err.message);
  }
}

// ── handleRevocation — called from index.js messages.update ───────────
async function handleRevocation(sock, updates) {
  try {
    const cfg = loadConfig();
    if (!cfg.enabled) return;

    for (const update of updates) {
      const proto = update.update?.message?.protocolMessage;
      if (!proto) continue;
      if (proto.type !== 0) continue; // type 0 = REVOKE

      const msgId     = proto.key?.id;
      const deletedBy = update.key?.participant || update.key?.remoteJid || '';
      if (!msgId) continue;

      // Skip if bot deleted its own message
      const botNum = sock.user?.id?.split(':')[0] || '';
      if (deletedBy.includes(botNum)) continue;

      const original = messageStore.get(msgId);
      if (!original) continue;

      // Resolve where to send the report
      const target     = resolveTarget(cfg, sock, original.chat);
      const senderNum  = original.sender?.split('@')[0] || '';
      const byNum      = deletedBy?.split('@')[0] || '';
      const mentions   = [deletedBy, original.sender].filter(Boolean);

      // Build italic report
      let report = `_deleted message detected_\n\n_deleted by: @${byNum}_\n_sender: @${senderNum}_`;
      if (original.content) report += `\n\n_message:_\n${original.content}`;

      await sock.sendMessage(target, { text: report, mentions }).catch(() => {});

      // Send media
      if (original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath)) {
        const buf     = fs.readFileSync(original.mediaPath);
        const caption = `_deleted ${original.mediaType} from @${senderNum}_`;
        try {
          if      (original.mediaType === 'image')    await sock.sendMessage(target, { image:   buf, caption, mentions: [original.sender] });
          else if (original.mediaType === 'video')    await sock.sendMessage(target, { video:   buf, caption, mentions: [original.sender] });
          else if (original.mediaType === 'sticker')  await sock.sendMessage(target, { sticker: buf });
          else if (original.mediaType === 'audio')    await sock.sendMessage(target, { audio:   buf, mimetype: 'audio/mpeg', ptt: false });
        } catch (_) {}
        try { fs.unlinkSync(original.mediaPath); } catch (_) {}
      }

      messageStore.delete(msgId);
    }
  } catch (err) {
    console.error('[antidelete] handleRevocation error:', err.message);
  }
}

module.exports = { storeMessage, handleRevocation, loadConfig, saveConfig };
