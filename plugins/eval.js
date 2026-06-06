'use strict';

const fs   = require('fs');
const path = require('path');
const util = require('util');

const EXT_DIR = path.join(__dirname, '..', 'database', 'external_plugins');
if (!fs.existsSync(EXT_DIR)) fs.mkdirSync(EXT_DIR, { recursive: true });

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

function stringify(val) {
  if (val === undefined) return 'undefined';
  if (val === null)      return 'null';
  if (typeof val === 'string') return val;
  if (val instanceof Error) return `${val.name}: ${val.message}\n${val.stack || ''}`;
  try { return util.inspect(val, { depth: 4, colors: false, breakLength: 120 }); }
  catch (_) { return String(val); }
}

async function runCode(code, sock, m, ctx) {
  const logs = [];
  const fakeConsole = {
    log:   (...a) => logs.push(a.map(stringify).join(' ')),
    warn:  (...a) => logs.push('[warn] '  + a.map(stringify).join(' ')),
    error: (...a) => logs.push('[error] ' + a.map(stringify).join(' ')),
    info:  (...a) => logs.push('[info] '  + a.map(stringify).join(' ')),
  };
  let result;
  try {
    const fn = new AsyncFunction(
      'sock', 'm', 'ctx', 'require', '__dirname', '__filename',
      'console', 'fs', 'path',
      `return (async () => { ${code} })()`
    );
    result = await fn(sock, m, ctx, require, __dirname, __filename, fakeConsole, fs, path);
  } catch (e) {
    return { error: e, logs };
  }
  return { result, logs };
}

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
          errors.push('exported object missing command or handleText');
        if (p.command && !Array.isArray(p.command) && typeof p.command !== 'string')
          errors.push('command must be a string or array');
        if (!p.execute && !p.handleText)
          errors.push('missing execute() function');
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
  const m1 = code.match(/command\s*:\s*\[\s*['"]([^'"]+)['"]/);
  if (m1) return m1[1];
  const m2 = code.match(/command\s*:\s*['"]([^'"]+)['"]/);
  if (m2) return m2[1];
  return `plugin_${Date.now()}`;
}

async function installPlugin(code, sock, m, ctx) {
  const { reply } = ctx;
  const errors = validatePlugin(code);
  if (errors.length > 0) {
    await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
    return reply(`_plugin validation failed_\n\n${errors.map((e, i) => `_${i + 1}. ${e}_`).join('\n')}`);
  }
  const name     = extractName(code);
  const filepath = path.join(EXT_DIR, `rt_${name}.js`);
  try {
    fs.writeFileSync(filepath, code, 'utf8');
  } catch (e) {
    await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
    return reply(`_failed to save: ${e.message}_`);
  }
  try {
    if (global.pluginLoader?.reload) global.pluginLoader.reload();
  } catch (e) {
    await sock.sendMessage(m.chat, { react: { text: '⚠️', key: m.key } }).catch(() => {});
    return reply(`_saved but reload failed: ${e.message}_`);
  }
  await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
  return reply(`_plugin installed:_ *${name}*`);
}

// ── Shared handler — used by execute AND handleText ───────────────────
async function handle(code, sock, m, ctx) {
  if (code.includes('module.exports')) {
    return installPlugin(code, sock, m, ctx);
  }
  await sock.sendMessage(m.chat, { react: { text: '⚙️', key: m.key } }).catch(() => {});
  const { result, error, logs } = await runCode(code, sock, m, ctx);
  let out = '';
  if (logs.length) out += `*Output:*\n\`\`\`\n${logs.join('\n')}\n\`\`\`\n\n`;
  if (error) {
    await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
    out += `*Error:*\n\`\`\`\n${stringify(error)}\n\`\`\``;
  } else {
    await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
    if (result !== undefined) out += `*Result:*\n\`\`\`\n${stringify(result)}\n\`\`\``;
    else if (!logs.length) out += '_executed (no output)_';
  }
  if (!out.trim()) return;
  if (out.length > 4000) out = out.slice(0, 3900) + '\n_...(truncated)_';
  return sock.sendMessage(m.chat, { text: out }, { quoted: m }).catch(() => {});
}

module.exports = {
  command:  ['eval', 'exec', 'code'],
  owner:    true,
  category: 'owner',
  desc:     'Eval JS or install plugin. Also triggered by > prefix.',

  async execute(sock, m, ctx) {
    if (!ctx.isOwner) return;
    const { command, text, reply } = ctx;

    if (command === 'code') {
      // Get code from quoted message or inline text
      const code = (
        m.quoted?.body?.trim() ||
        m.quoted?.text?.trim() ||
        m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() ||
        text?.trim() ||
        ''
      );
      if (!code) return reply(
        `_reply to plugin code with_ *.code*\n_or paste inline:_ *.code <plugin code>*`
      );
      return installPlugin(code, sock, m, ctx);
    }

    // .eval / .exec
    const code = text?.trim();
    if (!code) return reply('_provide code to evaluate_');
    return handle(code, sock, m, ctx);
  },

  // ── FIX: > prefix handler ─────────────────────────────────────────
  // main.js only calls onText for non-fromMe messages.
  // Owner often tests from their own number (fromMe=true).
  // So we ALSO register > as a real command prefix in execute()
  // AND keep handleText for non-fromMe case.
  async handleText(sock, m, ctx) {
    if (!ctx.isOwner) return;
    const body = m.body || '';
    // Support both "> code" and ">" at start of line
    if (!body.trimStart().startsWith('>')) return;
    const code = body.trimStart().slice(1).trim();
    if (!code) return;
    return handle(code, sock, m, ctx);
  }
};
