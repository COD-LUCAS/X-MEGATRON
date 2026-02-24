const fs = require('fs');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DATABASE_DIR)) {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

const SUDO_FILE = path.join(DATABASE_DIR, 'sudo.json');

const extractDigits = (val) => val.replace(/[^0-9]/g, '');

const normalizeJid = (input) => {
  if (!input) return '';
  const digits = extractDigits(input);
  if (!digits) return '';
  if (input.includes('@lid')) return digits + '@lid';
  if (input.includes('@s.whatsapp.net')) return digits + '@s.whatsapp.net';
  return digits + '@s.whatsapp.net';
};

const readSudo = () => {
  try {
    if (fs.existsSync(SUDO_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SUDO_FILE, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    }
  } catch (e) {}
  return [];
};

const writeSudo = (list) => {
  fs.writeFileSync(SUDO_FILE, JSON.stringify(list, null, 2));
};

const jidMatchesSuffix = (a, b) => {
  const da = extractDigits(a);
  const db = extractDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 7 && db.length >= 7) return da.slice(-10) === db.slice(-10);
  return false;
};

module.exports = {
  command: ['setsudo', 'delsudo', 'listsudo'],
  owner: true,

  async execute(sock, m, context) {
    const { command, args, prefix, sender } = context;

    if (command === 'setsudo') {
      let target = m.quoted?.sender || m.mentionedJid?.[0] || (args[0] ? normalizeJid(args[0]) : null);

      if (!target || !extractDigits(target)) {
        return m.reply(
          `_Mention or provide a number!_\n\nExample:\n${prefix}setsudo @tag\n${prefix}setsudo 62xxx`
        );
      }

      target = normalizeJid(target);

      if (jidMatchesSuffix(target, sock.user?.id || '')) {
        return m.reply('_❌ Cannot add the bot itself as sudo_');
      }

      if (jidMatchesSuffix(target, sender)) {
        return m.reply('_❌ You are already the creator, no need to add yourself_');
      }

      const list = readSudo();

      if (list.some((e) => jidMatchesSuffix(e, target))) {
        return m.reply(`_❌ @${extractDigits(target)} is already in the sudo list_`);
      }

      list.push(target);
      writeSudo(list);

      return m.reply(`_✅ Successfully added @${extractDigits(target)} as sudo_`);
    }

    if (command === 'delsudo') {
      let target = m.quoted?.sender || m.mentionedJid?.[0] || (args[0] ? normalizeJid(args[0]) : null);

      if (!target || !extractDigits(target)) {
        return m.reply(
          `_Mention or provide a number!_\n\nExample:\n${prefix}delsudo @tag\n${prefix}delsudo 62xxx`
        );
      }

      target = normalizeJid(target);

      const list = readSudo();
      const index = list.findIndex((e) => jidMatchesSuffix(e, target));

      if (index === -1) {
        return m.reply(`_❌ @${extractDigits(target)} is not in the sudo list_`);
      }

      list.splice(index, 1);
      writeSudo(list);

      return m.reply(`_✅ Successfully removed @${extractDigits(target)} from sudo_`);
    }

    if (command === 'listsudo') {
      const list = readSudo();

      if (!list.length) {
        return m.reply('_📋 Sudo list is empty_');
      }

      let txt = '*------「 LIST SUDO 」------*\n\n';
      list.forEach((jid, i) => {
        txt += `${i + 1}. @${extractDigits(jid)}\n`;
      });

      return m.reply(txt);
    }
  },
};
