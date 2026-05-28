/**
 * code.js — plugins/code.js
 * Owner-only. Trigger: > (no dot prefix needed)
 * Paste plugin code starting with > to install instantly.
 * Runtime files are wiped on every restart by index.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const EXT_DIR = path.join(__dirname, '..', 'database', 'external_plugins');
if (!fs.existsSync(EXT_DIR)) fs.mkdirSync(EXT_DIR, { recursive: true });

function validatePlugin(code) {
  const errors = [];

  if (!code.includes('module.exports'))
    errors.push('missing module.exports');

  const hasCommand = /command\s*:\s*[\[']/.test(code);
  const hasOnText  = /handleText|onText/.test(code);
  if (!hasCommand && !hasOnText)
    errors.push("missing command field — add: command: ['name']");

  if (!code.includes('execute') && !hasOnText)
    errors.push('missing execute() function');

  if (/^import\s+/m.test(code) || /^export\s+default/m.test(code))
    errors.push('use require() not import/export');

  try {
    new Function('module', 'exports', 'require', '__dirname', '__filename', code);
  } catch (e) {
    errors.push(`syntax error: ${e.message}`);
  }

  if (errors.length === 0) {
    try {
      const mod = { exports: {} };
      new Function('module', 'exports', 'require', '__dirname', '__filename', code)(
        mod, mod.exports, require, __dirname, __filename
      );
      const p = mod.exports;
      if (!p || typeof p !== 'object') {
        errors.push('module.exports must be an object');
      } else {
        if (!p.command && !p.handleText && !p.onText)
          errors.push('exported object missing command or handleText hook');
        if (p.command && !Array.isArray(p.command) && typeof p.command !== 'string')
          errors.push('command must be a string or array');
        if (!p.execute && !p.handleText)
          errors.push('missing execute() function in export');
        if (p.execute && typeof p.execute !== 'function')
          errors.push('execute must be a function');
      }
    } catch (e) {
      errors.push(`load error: ${e.message}`);
    }
  }

  return errors;
}

function extractName(code) {
  const m = code.match(/command\s*:\s*\[\s*['"]([^'"]+)['"]/);
  if (m) return m[1];
  const m2 = code.match(/command\s*:\s*['"]([^'"]+)['"]/);
  if (m2) return m2[1];
  return `plugin_${Date.now()}`;
}

async function react(sock, m, emoji) {
  try {
    await sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
  } catch (_) {}
}

module.exports = {
  // No command — triggered only by > prefix via handleText
  command: [],
  category: 'owner',
  desc: 'Install plugin by pasting code with > prefix',

  async handleText(sock, m, ctx) {
    if (!ctx.isOwner) return;

    const body = (m.body || '').trimStart();
    if (!body.startsWith('>')) return;

    const code = body.slice(1).replace(/^\s*\n?/, '').trim();
    if (!code) return;

    const errors = validatePlugin(code);

    if (errors.length > 0) {
      await react(sock, m, '❌');
      const msg = errors.map((e, i) => `_${i + 1}. ${e}_`).join('\n');
      return sock.sendMessage(m.chat, {
        text: `_plugin validation failed_\n\n${msg}`
      }, { quoted: m }).catch(() => {});
    }

    const name     = extractName(code);
    const filename = `rt_${name}.js`;
    const filepath = path.join(EXT_DIR, filename);

    try {
      fs.writeFileSync(filepath, code, 'utf8');
    } catch (e) {
      await react(sock, m, '❌');
      return sock.sendMessage(m.chat, {
        text: `_failed to save: ${e.message}_`
      }, { quoted: m }).catch(() => {});
    }

    try {
      if (global.pluginLoader?.reload) global.pluginLoader.reload();
    } catch (e) {
      await react(sock, m, '⚠️');
      return sock.sendMessage(m.chat, {
        text: `_saved but reload failed: ${e.message}_`
      }, { quoted: m }).catch(() => {});
    }

    await react(sock, m, '✅');
  },

  // Dummy execute so loader doesn't complain
  async execute() {}
};
