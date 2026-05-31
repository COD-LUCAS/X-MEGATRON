/**
 * library/antidelete.js
 * Stores all incoming messages and detects deletions.
 * Configurable target: group | owner | specific JID
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@itsliaaa/baileys');

const TMP_DIR     = path.join(__dirname, '..', 'database', 'tmp');
const CONFIG_FILE = path.join(__dirname, '..', 'database', 'antidelete.json');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const messageStore = new Map();
const MAX_STORE    = 500;

// ── Config ────────────────────────────────────────────────────────────
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

// ── Resolve target JID ────────────────────────────────────────────────
function resolveTarget(cfg, sock, chatId) {
  const ownerJid = (sock.user?.id?.split(':')[0] || '') + '@s.whatsapp.net';
  if (!cfg.target || cfg.target === 'owner') return ownerJid;
  if (cfg.target === 'group') return chatId;
  return cfg.target.includes('@') ? cfg.target : cfg.target + '@s.whatsapp.net';
}

// ── Tmp cleanup ───────────────────────────────────────────────────────
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

// ── Download media helper ─────────────────────────────────────────────
async function dlMedia(msgObj, type, savePath) {
  try {
    const stream = downloadContentFromMessage(msgObj, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    fs.writeFileSync(savePath, Buffer.concat(chunks));
    return savePath;
  } catch (_) { return null; }
}

// ── storeMessage ──────────────────────────────────────────────────────
async function storeMessage(sock, raw) {
  try {
    const cfg = loadConfig();
    if (!cfg.enabled) return;
    if (!raw?.key?.id || !raw.message) return;
    if (raw.key.fromMe) return;

    const id     = raw.key.id;
    const sender = raw.key.participant || raw.key.remoteJid || '';
    const chat   = raw.key.remoteJid  || '';

    let content = '', mediaType = '', mediaPath = '', isViewOnce = false;
    const msg   = raw.message;

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
    else if (msg.imageMessage)  { mediaType = 'image';   content = msg.imageMessage.caption  || ''; mediaPath = (await dlMedia(msg.imageMessage,   'image',   path.join(TMP_DIR, `${id}.jpg`)))  || ''; }
    else if (msg.videoMessage)  { mediaType = 'video';   content = msg.videoMessage.caption  || ''; mediaPath = (await dlMedia(msg.videoMessage,   'video',   path.join(TMP_DIR, `${id}.mp4`)))  || ''; }
    else if (msg.audioMessage)  { mediaType = 'audio';   const ext = msg.audioMessage.mimetype?.includes('ogg') ? 'ogg' : 'mp3'; mediaPath = (await dlMedia(msg.audioMessage, 'audio', path.join(TMP_DIR, `${id}.${ext}`))) || ''; }
    else if (msg.stickerMessage){ mediaType = 'sticker'; mediaPath = (await dlMedia(msg.stickerMessage, 'sticker', path.join(TMP_DIR, `${id}.webp`))) || ''; }
    else if (msg.documentMessage){ mediaType = 'document'; content = msg.documentMessage.caption || msg.documentMessage.fileName || ''; }

    // Trim store
    if (messageStore.size >= MAX_STORE) {
      const oldest = messageStore.keys().next().value;
      const old    = messageStore.get(oldest);
      if (old?.mediaPath) try { fs.unlinkSync(old.mediaPath); } catch (_) {}
      messageStore.delete(oldest);
    }

    messageStore.set(id, { content, mediaType, mediaPath, sender, chat, isViewOnce });

    // Anti-view-once: forward to owner
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

// ── handleRevocation ──────────────────────────────────────────────────
async function handleRevocation(sock, updates) {
  try {
    const cfg = loadConfig();
    if (!cfg.enabled) return;

    for (const update of updates) {
      try {
        // Try every known path Baileys uses for deletion events
        const proto =
          update?.update?.message?.protocolMessage   ||
          update?.message?.protocolMessage            ||
          update?.update?.protocolMessage             ||
          null;

        if (!proto) continue;
        // type 0 = REVOKE
        if (proto.type !== 0) continue;

        const msgId  = proto.key?.id;
        const chatId = update.key?.remoteJid || proto.key?.remoteJid || '';
        const deletedBy = update.key?.participant || update.key?.remoteJid || '';

        if (!msgId || !chatId) continue;

        // Skip if bot deleted its own
        const botNum = sock.user?.id?.split(':')[0] || '';
        if (deletedBy.includes(botNum)) continue;

        const original = messageStore.get(msgId);
        if (!original) continue;

        const target    = resolveTarget(cfg, sock, original.chat || chatId);
        const senderNum = original.sender?.split('@')[0] || '';
        const byNum     = deletedBy?.split('@')[0]       || '';
        const mentions  = [deletedBy, original.sender].filter(Boolean);

        let report = `_deleted message_\n\n_by: @${byNum}_\n_from: @${senderNum}_`;
        if (original.content) report += `\n\n_message:_\n${original.content}`;

        await sock.sendMessage(target, { text: report, mentions }).catch(() => {});

        // Send deleted media
        if (original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath)) {
          const buf     = fs.readFileSync(original.mediaPath);
          const caption = `_deleted ${original.mediaType} from @${senderNum}_`;
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

module.exports = { storeMessage, handleRevocation, loadConfig, saveConfig };
