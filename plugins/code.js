'use strict';

const fs = require('fs');
const path = require('path');

const EXT_DIR = path.join(__dirname, '..', 'database', 'external_plugins');
if (!fs.existsSync(EXT_DIR)) fs.mkdirSync(EXT_DIR, { recursive: true });

function validatePlugin(code) {
  const errors = [];

  if (!code.includes('module.exports'))
    errors.push('missing module.exports');

  const hasCommand = /command\s*:\s*[\[']/.test(code);
  const hasOnText = /handleText|onText/.test(code);
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
  command: ['code'],
  category: 'owner',
  desc: 'Install plugin by replying with code',
  usage: '.code (reply to code)',
  owner: true,

  async execute(sock, m, context) {
    const { reply, react: ctxReact, isOwner } = context;

    if (!isOwner) return reply('_Owner only_');

    if (!m.quoted) {
      return reply('_Reply to a code block_\n_Usage: .code_');
    }

    const code = m.quoted.body || '';
    if (!code) {
      return reply('_No code found in replied message_');
    }

    const errors = validatePlugin(code);

    if (errors.length > 0) {
      await ctxReact('❌');
      const msg = errors.map((e, i) => `_${i + 1}. ${e}_`).join('\n');
      return reply(`_plugin validation failed_\n\n${msg}`);
    }

    const name = extractName(code);
    const filename = `rt_${name}.js`;
    const filepath = path.join(EXT_DIR, filename);

    try {
      fs.writeFileSync(filepath, code, 'utf8');
    } catch (e) {
      await ctxReact('❌');
      return reply(`_failed to save: ${e.message}_`);
    }

    try {
      if (global.pluginLoader && global.pluginLoader.reload) {
        global.pluginLoader.reload();
      }
    } catch (e) {
      await ctxReact('⚠️');
      return reply(`_saved but reload failed: ${e.message}_`);
    }

    await ctxReact('✅');
    reply(`_plugin installed: ${name}_`);
  }
};