require('dotenv').config();

const config = require('./config');
const fs = require('fs');
const path = require('path');

const DATABASE_DIR = path.join(__dirname, 'database');
const EXT_PLUGINS_DIR = path.join(DATABASE_DIR, 'external_plugins');

if (!fs.existsSync(DATABASE_DIR)) fs.mkdirSync(DATABASE_DIR, { recursive: true });
if (!fs.existsSync(EXT_PLUGINS_DIR)) fs.mkdirSync(EXT_PLUGINS_DIR, { recursive: true });

global.disabledCommands = global.disabledCommands || new Set();

const loadDisabled = () => {
  try {
    const file = path.join(DATABASE_DIR, 'disabled_commands.json');
    if (fs.existsSync(file)) global.disabledCommands = new Set(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {}
};

global.saveDisabledCommands = () => {
  try {
    fs.writeFileSync(
      path.join(DATABASE_DIR, 'disabled_commands.json'),
      JSON.stringify([...global.disabledCommands])
    );
  } catch (e) {}
};

loadDisabled();

const readBonds = () => {
  try {
    const file = path.join(DATABASE_DIR, 'sticker_bonds.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return {};
};

const loadSudo = () => {
  const owners = (process.env.OWNER || '').split(',').map(v => v.trim()).filter(Boolean);
  const env = (process.env.SUDO || '').split(',').map(v => v.trim()).filter(Boolean);
  let file = [];
  try {
    const sudoFile = path.join(DATABASE_DIR, 'sudo.json');
    if (fs.existsSync(sudoFile)) file = JSON.parse(fs.readFileSync(sudoFile, 'utf8'));
  } catch (e) {}
  return [...new Set([...owners, ...env, ...file])];
};

const isSudo = (sender, list) => {
  if (!sender || !list.length) return false;
  const num = sender.split('@')[0].replace(/\D/g, '');
  return list.some(s => {
    const sNum = s.replace(/\D/g, '');
    return num === sNum || num.endsWith(sNum.slice(-10));
  });
};

const prefixes = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',').map(p => p.trim());

const getPrefix = (text) => {
  if (!text) return null;
  for (const p of prefixes) { if (text.startsWith(p)) return p; }
  return null;
};

const GROUP_EVENTS_DB = path.join(DATABASE_DIR, 'group_events.json');
const loadGroupEventsDB = () => {
  try { if (fs.existsSync(GROUP_EVENTS_DB)) return JSON.parse(fs.readFileSync(GROUP_EVENTS_DB, 'utf8')); } catch (_) {}
  return {};
};
const saveGroupEventsDB = (data) => {
  try { fs.writeFileSync(GROUP_EVENTS_DB, JSON.stringify(data, null, 2)); } catch (_) {}
};

class Loader {
  constructor() { this.plugins = []; this.map = new Map(); this.load(); }

  load() {
    const dirs = [path.join(__dirname, 'plugins'), EXT_PLUGINS_DIR];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
      for (const file of files) {
        try {
          delete require.cache[require.resolve(path.join(dir, file))];
          const p = require(path.join(dir, file));
          if (!p?.command && !p?.onText && !p?.handleText) continue;
          this.plugins.push(p);
          if (p.command) {
            const cmds = Array.isArray(p.command) ? p.command : [p.command];
            cmds.forEach(c => this.map.set(c.toLowerCase(), p));
          }
        } catch (e) { console.log(`Failed to load ${file}:`, e.message); }
      }
    }
  }

  reload() {
    this.plugins = []; this.map.clear(); this.load();
    console.log('[LOADER] Reloaded —', this.map.size, 'commands');
  }

  exec(cmd, sock, m, ctx) {
    if (global.disabledCommands.has(cmd)) return;
    const p = this.map.get(cmd);
    if (!p) return;
    if (p.owner && !ctx.isOwner) return;
    if (p.sudo && !ctx.isOwner && !ctx.isSudo) return;
    if (p.admin && !ctx.isAdmin && !ctx.isOwner) return;
    if (p.group && !m.isGroup) return;
    if (p.private && m.isGroup) return;
    p.execute(sock, m, ctx);
  }

  onText(sock, m, ctx) {
    if (!m.body?.trim() || !ctx.text?.trim()) return;
    for (const p of this.plugins) {
      if (!p.onText && !p.handleText) continue;
      if (p.handleText) p.handleText(sock, m, ctx);
      else if (p.onText) p.execute(sock, m, ctx);
    }
  }

  autoReveal(sock, m) {
    for (const p of this.plugins) { if (p.autoReveal) p.autoReveal(sock, m); }
  }
}

const loader = new Loader();
global.pluginLoader = loader;

const groupMetaCache = new Map();

function getStickerFingerprint(stickerMsg) {
  if (!stickerMsg) return null;

  const tryBuffer = (val) => {
    if (!val) return null;
    try {
      if (Buffer.isBuffer(val)) return val.toString('hex');
      if (val instanceof Uint8Array) return Buffer.from(val).toString('hex');
      if (typeof val === 'string') return val;
      if (val?.type === 'Buffer' && val.data) return Buffer.from(val.data).toString('hex');
    } catch (_) {}
    return null;
  };

  return (
    tryBuffer(stickerMsg.fileEncSha256) ||
    tryBuffer(stickerMsg.fileSha256) ||
    tryBuffer(stickerMsg.mediaKey) ||
    null
  );
}

function extractSticker(message, isQuoted = false) {
  if (isQuoted) {
    return (
      message.quoted?.message?.stickerMessage ||
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage ||
      null
    );
  }
  return (
    message.message?.stickerMessage ||
    message.msg ||
    null
  );
}

module.exports = async (sock, m) => {
  if (!m?.key?.id || !m.message) return;
  if (m.key.remoteJid === 'status@broadcast') return;
  if (m.isSystem) return;

  const isFromMe = m.fromMe === true;

  if (isFromMe && !m.message?.conversation && !m.message?.extendedTextMessage?.text) return;

  const body = (
    m.message?.conversation?.trim() ||
    m.message?.extendedTextMessage?.text?.trim() ||
    m.message?.imageMessage?.caption?.trim() ||
    m.message?.videoMessage?.caption?.trim() ||
    m.message?.documentMessage?.caption?.trim() ||
    m.message?.buttonsResponseMessage?.selectedButtonId?.trim() ||
    m.body?.trim() ||
    ''
  );

  m.body = body;
  m.text = body;

  const sender = m.sender || '';
  if (!sender && !isFromMe) return;

  try {
    const { isBanned } = require('./plugins/ban');
    if (isBanned(m.chat)) {
      if (!isFromMe) {
        const sudoList = loadSudo();
        if (!isSudo(sender, sudoList)) return;
      }
      const hasPrefix = prefixes.some(p => body.startsWith(p));
      if (!hasPrefix) return;
      const cmd = body.slice(prefixes.find(p => body.startsWith(p))?.length || 1).trim().split(/\s+/)[0]?.toLowerCase();
      if (cmd !== 'unban') return;
    }
  } catch (_) {}

  const sudoList = loadSudo();
  const isOwner = isFromMe || isSudo(sender, sudoList);
  const isSudoUser = !isFromMe && isSudo(sender, sudoList);

  const mode = (process.env.MODE || 'public').toLowerCase();
  if (!isFromMe) {
    if (mode === 'private' && !isOwner) return;
    if (mode === 'group' && !m.isGroup && !isOwner) return;
    if (mode === 'pm' && m.isGroup && !isOwner) return;
  }

  let meta = null, isAdmin = false, isBotAdmin = false;

  if (m.isGroup) {
    try {
      meta = groupMetaCache.has(m.chat)
        ? groupMetaCache.get(m.chat)
        : await sock.groupMetadata(m.chat).catch(() => null);

      if (meta) {
        groupMetaCache.set(m.chat, meta);
        if (groupMetaCache.size > 30) groupMetaCache.delete(groupMetaCache.keys().next().value);
        const admins = meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
        const sNum = sender?.split('@')[0] || '';
        const bNum = sock.user?.id?.split(':')[0] || '';
        isAdmin = admins.some(a => a.split('@')[0] === sNum);
        isBotAdmin = admins.some(a => a.split('@')[0] === bNum);
      }
    } catch (_) {}
  }

  const getMeta = async () => {
    if (!m.isGroup || meta) return;
    try {
      meta = await sock.groupMetadata(m.chat);
      groupMetaCache.set(m.chat, meta);
      if (groupMetaCache.size > 30) groupMetaCache.delete(groupMetaCache.keys().next().value);
      const admins = meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
      const sNum = sender?.split('@')[0] || '';
      const bNum = sock.user?.id?.split(':')[0] || '';
      isAdmin = admins.some(a => a.split('@')[0] === sNum);
      isBotAdmin = admins.some(a => a.split('@')[0] === bNum);
    } catch (_) {}
  };

  const ctx = {
    command: null, args: [], text: body,
    prefix: getPrefix(body) || prefixes[0],
    isOwner, isSudo: isSudoUser, isCreator: isFromMe,
    isAdmin, isBotAdmin, isGroup: m.isGroup,
    sender,
    senderNum: sender?.split('@')[0].replace(/\D/g, '') || '',
    chat: m.chat,
    participants: meta?.participants || [],
    groupMetadata: meta,
    getGroupMetadata: getMeta,
    reply: (txt) => {
      if (!txt || typeof txt !== 'string') return Promise.resolve();
      if (txt.trim() === '' || txt === '_' || txt === '*') return Promise.resolve();
      try {
        return sock.sendMessage(m.chat, { text: txt.trim() }, { quoted: m });
      } catch { return Promise.resolve(); }
    },
    ownerNumbers: sudoList, config,
    getGroupEventsDB: loadGroupEventsDB,
    saveGroupEventsDB,
  };

  loader.autoReveal(sock, m);

  const stickerMsg = extractSticker(m, false);

  if (stickerMsg) {
    const fp = getStickerFingerprint(stickerMsg);
    if (fp) {
      const bonds = readBonds();
      if (bonds[fp]) {
        const parts = bonds[fp].trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();

        if (m.message?.stickerMessage?.contextInfo?.quotedMessage) {
          if (!m.quoted) m.quoted = {};
          m.quoted.message = m.message.stickerMessage.contextInfo.quotedMessage;
        }

        ctx.command = cmd;
        ctx.args = parts.slice(1);
        ctx.text = parts.slice(1).join(' ');

        for (const p of prefixes) {
          if (ctx.command.startsWith(p)) {
            ctx.command = ctx.command.slice(p.length);
            break;
          }
        }

        return loader.exec(ctx.command, sock, m, ctx);
      }
    }
  }

  if (!body || !body.trim()) return;

  const pre = getPrefix(body);
  if (!pre) {
    if (!isFromMe) loader.onText(sock, m, ctx);
    return;
  }

  const parts = body.slice(pre.length).trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  if (!cmd) return;

  ctx.command = cmd;
  ctx.args = parts.slice(1);
  ctx.text = parts.slice(1).join(' ');

  loader.exec(cmd, sock, m, ctx);
};