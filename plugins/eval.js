'use strict';

const fs   = require('fs');
const path = require('path');
const util = require('util');

const DB_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ── Safe stringify for any value ──────────────────────────────────────
function stringify(val) {
  if (val === undefined) return 'undefined';
  if (val === null)      return 'null';
  if (typeof val === 'string') return val;
  if (val instanceof Error) return `${val.name}: ${val.message}\n${val.stack || ''}`;
  try { return util.inspect(val, { depth: 4, colors: false, breakLength: 120 }); }
  catch (_) { return String(val); }
}

// ── Run code safely ───────────────────────────────────────────────────
async function runCode(code, sock, m, ctx) {
  // Capture console.log output
  const logs = [];
  const fakeConsole = {
    log:   (...a) => logs.push(a.map(stringify).join(' ')),
    warn:  (...a) => logs.push('[warn] ' + a.map(stringify).join(' ')),
    error: (...a) => logs.push('[error] ' + a.map(stringify).join(' ')),
    info:  (...a) => logs.push('[info] ' + a.map(stringify).join(' ')),
  };

  // Wrap user code so:
  // 1. It runs as async (await works)
  // 2. Bare try blocks at top level don't break the wrapper
  // 3. Return value is captured
  const wrapped = `
  (async () => {
    ${code}
  })()
  `;

  let result;
  try {
    const fn = new AsyncFunction(
      'sock', 'm', 'ctx', 'require', '__dirname', '__filename',
      'console', 'fs', 'path',
      `return ${wrapped}`
    );
    result = await fn(
      sock, m, ctx, require, __dirname, __filename,
      fakeConsole, fs, path
    );
  } catch (e) {
    return { error: e, logs };
  }

  return { result, logs };
}

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

module.exports = {
  command:  ['eval', 'exec', '>'],
  owner:    true,
  category: 'owner',
  desc:     'Evaluate JavaScript code',
  usage:    '.eval <code>  or  > <code>',

  async execute(sock, m, ctx) {
    const { text, reply, isOwner } = ctx;
    if (!isOwner) return;

    const code = text?.trim();
    if (!code) return reply('_provide code to evaluate_');

    await sock.sendMessage(m.chat, { react: { text: '⚙️', key: m.key } }).catch(() => {});

    const { result, error, logs } = await runCode(code, sock, m, ctx);

    let out = '';

    if (logs.length) {
      out += `*Output:*\n\`\`\`\n${logs.join('\n')}\n\`\`\`\n\n`;
    }

    if (error) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      out += `*Error:*\n\`\`\`\n${stringify(error)}\n\`\`\``;
    } else {
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
      if (result !== undefined) {
        out += `*Result:*\n\`\`\`\n${stringify(result)}\n\`\`\``;
      } else if (!logs.length) {
        out += '_executed (no output)_';
      }
    }

    if (!out.trim()) return;

    // Trim if too long for WhatsApp
    if (out.length > 4000) out = out.slice(0, 3900) + '\n...(truncated)';

    return sock.sendMessage(m.chat, { text: out }, { quoted: m }).catch(() => {});
  },

  // handleText for > shorthand (no dot prefix)
  async handleText(sock, m, ctx) {
    if (!ctx.isOwner) return;
    const body = (m.body || '').trimStart();
    if (!body.startsWith('>')) return;
    // strip the > and delegate to execute
    ctx.text = body.slice(1).trim();
    return this.execute(sock, m, ctx);
  }
};