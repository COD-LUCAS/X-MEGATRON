/**
 * eval.js — plugins/eval.js
 * Owner-only JavaScript evaluator.
 * Usage: .eval <code>
 * Auto-installs missing npm packages via require() failures.
 * Tmp files wiped on restart by index.js
 */

'use strict';

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');
const { inspect }   = require('util');

const DB_DIR = path.join(__dirname, '..', 'database');

function stringify(val) {
  if (val === null)      return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return val;
  if (val instanceof Error) return val.stack || val.message;
  return inspect(val, { depth: 4, colors: false });
}

async function tryAutoInstall(pkgName) {
  try {
    execSync(`npm install ${pkgName} --no-save --legacy-peer-deps`, {
      cwd:    path.join(__dirname, '..'),
      stdio:  'pipe',
      timeout: 60000
    });
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  command:  ['eval', 'exec'],
  category: 'owner',
  desc:     'Execute JavaScript in bot context',
  usage:    '.eval <js code>',
  owner:    true,

  async execute(sock, m, ctx) {
    const { reply, text, isOwner } = ctx;

    if (!isOwner) return reply('_owner only_');
    if (!text)    return reply('_usage: .eval <code>_');

    // ── Capture console.log ───────────────────────────────────────
    const logs = [];
    const fakeConsole = {
      log:   (...a) => logs.push(a.map(stringify).join(' ')),
      error: (...a) => logs.push('[error] ' + a.map(stringify).join(' ')),
      warn:  (...a) => logs.push('[warn] '  + a.map(stringify).join(' ')),
      info:  (...a) => logs.push('[info] '  + a.map(stringify).join(' ')),
    };

    let output  = '';
    let isError = false;

    const runCode = async (code) => {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction(
        'sock', 'm', 'ctx', 'fs', 'path', 'require', 'console',
        `
          const result = (async () => {
            ${code}
          })();
          return result;
        `
      );
      return fn(sock, m, ctx, fs, path, require, fakeConsole);
    };

    try {
      const result = await runCode(text);

      if (logs.length > 0) {
        output = logs.join('\n');
      } else if (result !== undefined) {
        output = stringify(result);
      } else {
        output = 'undefined';
      }

    } catch (err) {
      // ── Auto-install missing packages ─────────────────────────
      const missingPkg = err.message?.match(/Cannot find module '([^']+)'/)?.[1];

      if (missingPkg && !missingPkg.startsWith('.')) {
        await reply(`_module not found: ${missingPkg} — installing..._`);

        const installed = await tryAutoInstall(missingPkg);

        if (installed) {
          try {
            // Retry after install
            const result = await runCode(text);
            output = logs.length > 0
              ? logs.join('\n')
              : result !== undefined ? stringify(result) : 'undefined';
            await reply(`_installed ${missingPkg} — output:_\n\`\`\`\n${output}\n\`\`\``);
            return;
          } catch (retryErr) {
            isError = true;
            output  = retryErr?.stack || retryErr?.message || String(retryErr);
          }
        } else {
          isError = true;
          output  = `auto-install failed for: ${missingPkg}`;
        }
      } else {
        isError = true;
        output  = err?.stack || err?.message || String(err);
      }
    }

    const label    = isError ? 'error' : 'output';
    const fullText = `_${label}:_\n\`\`\`\n${output}\n\`\`\``;

    // ── Too long — send as file ───────────────────────────────────
    if (fullText.length > 4000) {
      const tmpFile = path.join(DB_DIR, `eval_${Date.now()}.txt`);
      try {
        fs.writeFileSync(tmpFile, output);
        await sock.sendMessage(m.chat, {
          document: fs.readFileSync(tmpFile),
          mimetype: 'text/plain',
          fileName: 'eval_output.txt',
          caption:  `_${label}: output too long_`
        }, { quoted: m });
      } finally {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
      }
      return;
    }

    return reply(fullText);
  }
};
