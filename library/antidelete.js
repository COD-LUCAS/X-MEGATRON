
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
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (_) { return {}; }
}

function saveConfig(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (_) {}
}

// ── Tmp folder cleanup (runs every 5 min, wipes if >200MB) ───────────
function getTmpSizeMB() {
  try {
    return fs.readdirSync(TMP_DIR).reduce((total, f) => {
      try { return total + fs.statSync(path.join(TMP_DIR, f)).size; } catch (_) { return total; }
    }, 0) / (1024 * 1024);
  } catch (_) { return 0; }
}

setInterval(() => {
  try {
    if (getTmpSizeMB() > 200) {
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

// ── storeMessage — call from index.js messages.upsert ─────────────────
async function storeMessage(sock, raw) {
  try {
    const cfg = loadConfig();
    if (!cfg.enabled) return;
    if (!raw?.key?.id || !raw.message) return;

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
        const p    = path.join(TMP_DIR, `${id}.jpg`);
        mediaPath  = (await downloadMedia(voMsg.imageMessage, 'image', p)) || '';
        isViewOnce = true;
      } else if (voMsg.videoMessage) {
        mediaType  = 'video';
        content    = voMsg.videoMessage.caption || '';
        const p    = path.join(TMP_DIR, `${id}.mp4`);
        mediaPath  = (await downloadMedia(voMsg.videoMessage, 'video', p)) || '';
        isViewOnce = true;
      }
    }
    // ── Regular message types ─────────────────────────────────────
    else if (msg.conversation)                    { content = msg.conversation; }
    else if (msg.extendedTextMessage?.text)       { content = msg.extendedTextMessage.text; }
    else if (msg.imageMessage) {
      mediaType = 'image';
      content   = msg.imageMessage.caption || '';
      const p   = path.join(TMP_DIR, `${id}.jpg`);
      mediaPath = (await downloadMedia(msg.imageMessage, 'image', p)) || '';
    }
    else if (msg.videoMessage) {
      mediaType = 'video';
      content   = msg.videoMessage.caption || '';
      const p   = path.join(TMP_DIR, `${id}.mp4`);
      mediaPath = (await downloadMedia(msg.videoMessage, 'video', p)) || '';
    }
    else if (msg.audioMessage) {
      mediaType = 'audio';
      const ext = msg.audioMessage.mimetype?.includes('ogg') ? 'ogg' : 'mp3';
      const p   = path.join(TMP_DIR, `${id}.${ext}`);
      mediaPath = (await downloadMedia(msg.audioMessage, 'audio', p)) || '';
    }
    else if (msg.stickerMessage) {
      mediaType = 'sticker';
      const p   = path.join(TMP_DIR, `${id}.webp`);
      mediaPath = (await downloadMedia(msg.stickerMessage, 'sticker', p)) || '';
    }
    else if (msg.documentMessage) {
      mediaType = 'document';
      content   = msg.documentMessage.caption || msg.documentMessage.fileName || '';
    }

    // ── Limit store size ─────────────────────────────────────────
    if (messageStore.size >= MAX_STORE) {
      const oldest = messageStore.keys().next().value;
      const oldEntry = messageStore.get(oldest);
      if (oldEntry?.mediaPath) try { fs.unlinkSync(oldEntry.mediaPath); } catch (_) {}
      messageStore.delete(oldest);
    }

    messageStore.set(id, { content, mediaType, mediaPath, sender, chat, isViewOnce });

    // ── Anti-view-once: forward to owner immediately ──────────────
    if (isViewOnce && mediaPath && fs.existsSync(mediaPath)) {
      try {
        const ownerJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const num      = sender.split('@')[0];
        const caption  = `_anti view once - ${mediaType}_\n_from: @${num}_`;

        if (mediaType === 'image') {
          await sock.sendMessage(ownerJid, {
            image: fs.readFileSync(mediaPath), caption, mentions: [sender]
          });
        } else if (mediaType === 'video') {
          await sock.sendMessage(ownerJid, {
            video: fs.readFileSync(mediaPath), caption, mentions: [sender]
          });
        }
      } catch (_) {}
    }

  } catch (err) {
    console.error('[antidelete] storeMessage error:', err.message);
  }
}

// ── handleRevocation — call from index.js messages.update ─────────────
async function handleRevocation(sock, updates) {
  try {
    const cfg = loadConfig();
    if (!cfg.enabled) return;

    for (const update of updates) {
      if (!update.update?.message?.protocolMessage) continue;

      const proto  = update.update.message.protocolMessage;
      if (proto.type !== 0) continue; // type 0 = REVOKE

      const msgId     = proto.key?.id;
      const deletedBy = update.key?.participant || update.key?.remoteJid || '';
      if (!msgId) continue;

      // Skip if bot deleted its own message
      const botNum = sock.user?.id?.split(':')[0] || '';
      if (deletedBy.includes(botNum)) continue;

      const original = messageStore.get(msgId);
      if (!original) continue;

      const ownerJid  = botNum + '@s.whatsapp.net';
      const senderNum = original.sender?.split('@')[0] || '';
      const byNum     = deletedBy?.split('@')[0] || '';

      // Build report
      let report =
        `_antidelete report_\n\n` +
        `_deleted by: @${byNum}_\n` +
        `_sender: @${senderNum}_\n` +
        `_chat: ${original.chat.endsWith('@g.us') ? 'group' : 'dm'}_`;

      if (original.content) {
        report += `\n\n_message:_\n${original.content}`;
      }

      await sock.sendMessage(ownerJid, {
        text: report,
        mentions: [deletedBy, original.sender].filter(Boolean)
      }).catch(() => {});

      // Send media if exists
      if (original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath)) {
        const caption = `_deleted ${original.mediaType} from @${senderNum}_`;
        const buf = fs.readFileSync(original.mediaPath);

        try {
          if      (original.mediaType === 'image')    await sock.sendMessage(ownerJid, { image:   buf, caption, mentions: [original.sender] });
          else if (original.mediaType === 'video')    await sock.sendMessage(ownerJid, { video:   buf, caption, mentions: [original.sender] });
          else if (original.mediaType === 'sticker')  await sock.sendMessage(ownerJid, { sticker: buf });
          else if (original.mediaType === 'audio')    await sock.sendMessage(ownerJid, { audio:   buf, mimetype: 'audio/mpeg', ptt: false });
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
