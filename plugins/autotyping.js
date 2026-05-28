/**
 * autotyping.js — plugins/autotyping.js
 * Command: .autotyping on/off
 * Shows typing indicator before every bot response when enabled.
 * Owner only. Wired via handleText hook — fires before every reply.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'database', 'autotyping.json');

// ── Config helpers ────────────────────────────────────────────────────
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { enabled: false };
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (_) { return { enabled: false }; }
}

function saveConfig(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (_) {}
}

// ── Typing indicator ──────────────────────────────────────────────────
async function showTyping(sock, chatId, msgLength = 20) {
  try {
    await sock.presenceSubscribe(chatId).catch(() => {});
    await sock.sendPresenceUpdate('available', chatId).catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    await sock.sendPresenceUpdate('composing', chatId).catch(() => {});

    // Delay based on message length: min 2s, max 6s
    const delay = Math.max(2000, Math.min(6000, msgLength * 100));
    await new Promise(r => setTimeout(r, delay));

    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
  } catch (_) {}
}

// ── Export ────────────────────────────────────────────────────────────
module.exports = {
  command:  ['autotyping'],
  category: 'owner',
  desc:     'Show typing indicator before every bot response',
  usage:    '.autotyping on | off',
  owner:    true,

  // handleText fires on every incoming message — used to trigger typing
  async handleText(sock, m, ctx) {
    const cfg = loadConfig();
    if (!cfg.enabled) return;

    // Only show typing for messages that would trigger a bot reply
    // (prefix messages or chatbot triggers — not system/empty)
    if (!m.body || !m.body.trim()) return;
    if (m.fromMe) return;

    await showTyping(sock, m.chat, m.body.length);
  },

  async execute(sock, m, ctx) {
    const { args, reply, isOwner } = ctx;
    if (!isOwner) return reply('_owner only command_');

    const cfg = loadConfig();
    const sub = args[0]?.toLowerCase();

    if (!sub) {
      return reply(
        `_autotyping: ${cfg.enabled ? 'on' : 'off'}_\n\n` +
        `_.autotyping on_\n` +
        `_.autotyping off_`
      );
    }

    if (sub === 'on') {
      if (cfg.enabled) return reply('_autotyping already on_');
      cfg.enabled = true;
      saveConfig(cfg);
      return reply('_autotyping on_');
    }

    if (sub === 'off') {
      cfg.enabled = false;
      saveConfig(cfg);
      return reply('_autotyping off_');
    }

    return reply('_options: on | off_');
  }
};
