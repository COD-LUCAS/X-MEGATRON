/**
 * fancycheck.js — plugins/fancycheck.js
 * Commands: .sort .onwa .offwa
 *
 * .sort  — find fancy numbers from a txt file (reply to doc)
 * .onwa  — find registered WhatsApp numbers from a txt file
 * .offwa — find unregistered WhatsApp numbers from a txt file
 *
 * After each command reply with a number to set how many to process.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Per-sender pending state ──────────────────────────────────────────
const pendingSort   = {};
const pendingWACheck = {};

// ── Helpers ───────────────────────────────────────────────────────────
function extractNumbers(text) {
  const nums = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/\d{8,15}/);
    if (m) nums.push(m[0]);
  }
  return nums;
}

function fmt(num) {
  const s = String(num || '').trim();
  return s.startsWith('+') ? s : '+' + s;
}

function findFancyPatterns(numStr) {
  const patterns = [];
  const s = numStr.toString();

  const checks = [
    { rx: /(\d)\1{2,}/g,              type: 'Consecutive Repeats', score: (m) => m.length * 10 },
    { rx: /(?:0123|1234|2345|3456|4567|5678|6789)/g, type: 'Sequential Up',   score: (m) => m.length * 8  },
    { rx: /(?:9876|8765|7654|6543|5432|4321|3210)/g, type: 'Sequential Down', score: (m) => m.length * 8  },
    { rx: /(\d\d)\1+/g,               type: 'Double Pattern',    score: (m) => m.length * 6  },
    { rx: /(\d)(\d)\2\1/g,            type: 'Palindrome',        score: ()    => 15           },
    { rx: /(\d)(\d)\1\2/g,            type: 'Alternating',       score: ()    => 12           },
  ];

  for (const { rx, type, score } of checks) {
    const matches = s.match(rx);
    if (matches) {
      matches.forEach(match => patterns.push({ type, pattern: match, score: score(match) }));
    }
  }

  return patterns;
}

async function editMsg(sock, chat, key, text) {
  try {
    await sock.sendMessage(chat, { text, edit: key });
  } catch (_) {
    await sock.sendMessage(chat, { text }).catch(() => {});
  }
}

async function sendFile(sock, m, filename, content, caption) {
  const tmpPath = path.join(TMP_DIR, filename);
  fs.writeFileSync(tmpPath, content);
  try {
    await sock.sendMessage(m.chat, {
      document: fs.readFileSync(tmpPath),
      fileName: filename,
      mimetype: 'text/plain',
      caption
    }, { quoted: m });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

// ── handleText: fires on number replies after .sort / .onwa / .offwa ──
async function handleText(sock, m, ctx) {
  if (!ctx.isOwner) return;

  const body = (m.body || '').trim();
  const count = parseInt(body);
  if (isNaN(count) || count < 1) return;

  const sender = m.sender;

  // ── SORT pending ────────────────────────────────────────────────
  if (pendingSort[sender]) {
    const data = pendingSort[sender];
    delete pendingSort[sender];

    const total   = data.numbers.length;
    const sent    = await sock.sendMessage(m.chat, { text: '_processing 0%_' }, { quoted: m });
    const thresholds = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    let tIdx = 0;

    const fancy = [];
    for (let i = 0; i < total; i++) {
      const patterns = findFancyPatterns(data.numbers[i]);
      if (patterns.length > 0) {
        fancy.push({
          number:       data.numbers[i],
          score:        patterns.reduce((s, p) => s + p.score, 0),
          patternCount: patterns.length
        });
      }

      const pct = Math.round(((i + 1) / total) * 100);
      if (tIdx < thresholds.length && pct >= thresholds[tIdx]) {
        await editMsg(sock, m.chat, sent.key, `_processing ${thresholds[tIdx]}%_`);
        tIdx++;
      }
    }

    await editMsg(sock, m.chat, sent.key, '_processing complete_');

    if (fancy.length === 0) {
      return sock.sendMessage(m.chat, {
        text: `_total checked: ${total}_\n_fancy found: 0_\n_no fancy patterns found_`
      }, { quoted: m });
    }

    fancy.sort((a, b) => b.score - a.score);

    const display  = Math.min(count, fancy.length);
    const topNums  = fancy.slice(0, display);
    let result     = `_fancy numbers found_\n\n_total checked: ${total}_\n_fancy found: ${fancy.length}_\n\n_top ${display}:_\n\`\`\`\n`;
    result        += topNums.map(x => fmt(x.number)).join('\n');
    result        += '\n```';

    if (fancy.length > display) result += `\n\n_${fancy.length - display} more will be sent as file_`;

    await sock.sendMessage(m.chat, { text: result }, { quoted: m });

    if (fancy.length > display) {
      let fileContent = `Fancy Numbers\n=============\n\nTotal: ${total}\nFancy: ${fancy.length}\nShown: ${display}\n\nRemaining:\n\n`;
      fileContent += fancy.slice(display).map(x => fmt(x.number)).join('\n');
      await sendFile(sock, m, `fancy_${Date.now()}.txt`, fileContent,
        `_remaining fancy numbers: ${fancy.length - display}_`);
    }

    if (data.filePath && fs.existsSync(data.filePath)) {
      try { fs.unlinkSync(data.filePath); } catch (_) {}
    }
    return;
  }

  // ── WA CHECK pending ────────────────────────────────────────────
  if (pendingWACheck[sender]) {
    const data       = pendingWACheck[sender];
    delete pendingWACheck[sender];

    const checkCount = Math.min(count, data.numbers.length);
    const toCheck    = data.numbers.slice(0, checkCount);
    const unchecked  = data.numbers.slice(checkCount);

    const sent = await sock.sendMessage(m.chat, {
      text: `_checking ${checkCount} numbers_`
    }, { quoted: m });

    const results = [];
    let done = 0;

    for (const num of toCheck) {
      done++;
      try {
        let n = num.replace(/\D/g, '');
        if (n.length === 10) n = '91' + n;
        const jid = n + '@s.whatsapp.net';
        let exists = false;

        try {
          const res = await sock.onWhatsApp(jid);
          if (Array.isArray(res) && res[0]?.exists) exists = true;
        } catch (_) {
          try { await sock.fetchStatus(jid); exists = true; } catch (_2) {}
        }

        if (data.type === 'registered'   &&  exists) results.push(num);
        if (data.type === 'unregistered' && !exists) results.push(num);
      } catch (_) {}

      if (done % 10 === 0 || done === checkCount) {
        await editMsg(sock, m.chat, sent.key,
          `_checking ${done}/${checkCount} - found: ${results.length}_`
        );
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    await editMsg(sock, m.chat, sent.key, '_check complete_');

    const emoji = data.type === 'registered' ? '✅' : '❌';
    const title = data.type === 'registered' ? 'registered' : 'unregistered';

    if (results.length === 0) {
      return sock.sendMessage(m.chat, {
        text: `_total checked: ${checkCount}_\n_${title}: 0_\n_no ${title} numbers found_`
      }, { quoted: m });
    }

    const show  = Math.min(50, results.length);
    let reply   = `_${title} numbers_\n\n_checked: ${checkCount}_\n_${title}: ${results.length}_\n\n_top ${show}:_\n\`\`\`\n`;
    reply      += results.slice(0, show).map(fmt).join('\n');
    reply      += '\n```';
    if (results.length > show) reply += `\n\n_${results.length - show} more will be sent as file_`;
    if (unchecked.length > 0)  reply += `\n\n_${unchecked.length} numbers not checked to avoid ban_`;

    await sock.sendMessage(m.chat, { text: reply }, { quoted: m });

    if (results.length > show) {
      let fc = `${title} Numbers\n${'='.repeat(title.length + 8)}\n\nChecked: ${checkCount}\n${title}: ${results.length}\n\nRemaining:\n\n`;
      fc += results.slice(show).map(fmt).join('\n');
      await sendFile(sock, m, `${title}_${Date.now()}.txt`, fc,
        `_remaining ${title}: ${results.length - show}_`);
    }

    if (unchecked.length > 0) {
      let uc = `Unchecked Numbers\n=================\n\nTotal: ${unchecked.length}\nReason: safety limit\n\nNumbers:\n\n`;
      uc += unchecked.map(fmt).join('\n');
      await sendFile(sock, m, `unchecked_${Date.now()}.txt`, uc,
        `_unchecked: ${unchecked.length} - check separately to avoid ban_`);
    }
  }
}

// ── Plugin export ─────────────────────────────────────────────────────
module.exports = {
  command:  ['sort', 'onwa', 'offwa'],
  category: 'utility',
  desc:     'sort=fancy numbers | onwa=registered | offwa=unregistered',
  owner:    true,

  handleText,

  async execute(sock, m, ctx) {
    const { command, reply } = ctx;

    // ── .sort ────────────────────────────────────────────────────
    if (command === 'sort') {
      if (!m.quoted || m.quoted.mtype !== 'documentMessage')
        return reply('_reply to a text file containing numbers_');

      await reply('_reading file_');

      const buffer = await m.quoted.download().catch(() => null);
      if (!buffer) return reply('_failed to download file_');

      const filePath = path.join(TMP_DIR, `sort_${Date.now()}.txt`);
      fs.writeFileSync(filePath, buffer);

      const content = fs.readFileSync(filePath, 'utf8');
      const numbers = extractNumbers(content);

      if (numbers.length === 0) {
        fs.unlinkSync(filePath);
        return reply('_no valid numbers found in file_');
      }

      pendingSort[m.sender] = { numbers, filePath };

      // Auto-clear after 5 min
      setTimeout(() => {
        if (pendingSort[m.sender]) {
          try { if (fs.existsSync(pendingSort[m.sender].filePath)) fs.unlinkSync(pendingSort[m.sender].filePath); } catch (_) {}
          delete pendingSort[m.sender];
        }
      }, 5 * 60 * 1000);

      return reply(
        `_found ${numbers.length} numbers_\n\n` +
        `_reply with a number to set how many to list_\n` +
        `_example: 100_`
      );
    }

    // ── .onwa / .offwa ───────────────────────────────────────────
    if (command === 'onwa' || command === 'offwa') {
      const type = command === 'onwa' ? 'registered' : 'unregistered';
      let numbers = [];

      if (m.quoted?.mtype === 'documentMessage') {
        const buf = await m.quoted.download().catch(() => null);
        if (!buf) return reply('_failed to download file_');
        numbers = extractNumbers(buf.toString('utf8'));
      } else if (m.quoted?.body || m.quoted?.text) {
        numbers = extractNumbers(m.quoted.body || m.quoted.text || '');
      }

      if (numbers.length === 0)
        return reply('_reply to a text file or message containing numbers_');

      numbers = [...new Set(numbers)];

      pendingWACheck[m.sender] = { numbers, type };

      setTimeout(() => { delete pendingWACheck[m.sender]; }, 5 * 60 * 1000);

      return reply(
        `_found ${numbers.length} numbers_\n\n` +
        `_reply with how many to check_\n` +
        `_recommended: max 50-100 to avoid ban_`
      );
    }
  }
};

