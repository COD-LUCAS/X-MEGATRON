require('dotenv').config();

const config = require('./config');
const fs     = require('fs');
const path   = require('path');

const DATABASE_DIR    = path.join(__dirname, 'database');
const EXT_PLUGINS_DIR = path.join(DATABASE_DIR, 'external_plugins');

if (!fs.existsSync(DATABASE_DIR))    fs.mkdirSync(DATABASE_DIR,    { recursive: true });
if (!fs.existsSync(EXT_PLUGINS_DIR)) fs.mkdirSync(EXT_PLUGINS_DIR, { recursive: true });

global.disabledCommands = global.disabledCommands || new Set();

const loadDisabled = () => {
  try {
    const file = path.join(DATABASE_DIR, 'disabled_commands.json');
    if (fs.existsSync(file)) global.disabledCommands = new Set(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {}
};
global.saveDisabledCommands = () => {
  try { fs.writeFileSync(path.join(DATABASE_DIR, 'disabled_commands.json'), JSON.stringify([...global.disabledCommands])); } catch (e) {}
};
loadDisabled();

const BOND_FILE = path.join(DATABASE_DIR, 'sticker_bonds.json');
const readBonds = () => {
  try { if (fs.existsSync(BOND_FILE)) return JSON.parse(fs.readFileSync(BOND_FILE, 'utf8')); } catch (e) {}
  return {};
};

const loadSudo = () => {
  const owners = (process.env.OWNER || '').split(',').map(v => v.trim()).filter(Boolean);
  const env    = (process.env.SUDO  || '').split(',').map(v => v.trim()).filter(Boolean);
  let file = [];
  try {
    const f = path.join(DATABASE_DIR, 'sudo.json');
    if (fs.existsSync(f)) file = JSON.parse(fs.readFileSync(f, 'utf8'));
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

const GROUP_EVENTS_DB   = path.join(DATABASE_DIR, 'group_events.json');
const loadGroupEventsDB = () => {
  try { if (fs.existsSync(GROUP_EVENTS_DB)) return JSON.parse(fs.readFileSync(GROUP_EVENTS_DB, 'utf8')); } catch (_) {}
  return {};
};
const saveGroupEventsDB = (data) => {
  try { fs.writeFileSync(GROUP_EVENTS_DB, JSON.stringify(data, null, 2)); } catch (_) {}
};

// ── Sticker hash — must match exactly what bond.js saves ─────────────
function toHex(raw) {
  if (!raw) return null;
  try {
    if (Buffer.isBuffer(raw))               return raw.toString('hex');
    if (raw instanceof Uint8Array)          return Buffer.from(raw).toString('hex');
    if (raw?.type === 'Buffer' && raw.data) return Buffer.from(raw.data).toString('hex');
    if (typeof raw === 'string')            return raw;
  } catch (_) {}
  return null;
}

function getBondKey(sm) {
  // fileSha256 only — must match exactly what bond.js saves
  return toHex(sm.fileSha256) || null;
}

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
          if (!p?.command && !p?.onText && !p?.handleText && !p?.groupFilter) continue;
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
    if (p.owner   && !ctx.isOwner) return;
    if (p.sudo    && !ctx.isOwner && !ctx.isSudo) return;
    if (p.admin   && !ctx.isAdmin && !ctx.isOwner) return;
    if (p.group   && !m.isGroup) return;
    if (p.private && m.isGroup) return;
    p.execute(sock, m, ctx);
  }

  // ── FIX: onText fires for ALL messages — fromMe and non-fromMe ───
  // This is what makes number replies (1, 100) work from owner's device
  // Plugins using handleText (spotify, fancychecker) rely on this
  onText(sock, m, ctx) {
    if (!m.body?.trim()) return;
    for (const p of this.plugins) {
      if (!p.onText && !p.handleText) continue;
      if (p.handleText) p.handleText(sock, m, ctx);
      else if (p.onText) p.execute(sock, m, ctx);
    }
  }

  groupFilter(sock, m, ctx) {
    for (const p of this.plugins) {
      if (!p.groupFilter) continue;
      try { p.groupFilter(sock, m, ctx); } catch (_) {}
    }
  }

  autoReveal(sock, m) {
    for (const p of this.plugins) { if (p.autoReveal) p.autoReveal(sock, m); }
  }
}

const loader = new Loader();
global.pluginLoader = loader;
const groupMetaCache = new Map();

module.exports = async (sock, m) => {
  if (!m?.key?.id || !m.message) return;
  if (m.key.remoteJid === 'status@broadcast') return;
  if (m.isSystem) return;

  const isFromMe = m.fromMe === true;

  // Drop bot-generated empty messages (warnings/media sent by bot)
  // Stickers are allowed through — bond trigger from owner's device
  if (isFromMe && !m.message?.stickerMessage) {
    const selfBody = (
      m.message?.conversation?.trim() ||
      m.message?.extendedTextMessage?.text?.trim() ||
      ''
    );
    if (!selfBody) return;
    // If it has no prefix, no eval, and is not a number reply — it's a bot response, drop it
    const hasPrefix  = prefixes.some(p => selfBody.startsWith(p));
    const hasEval    = selfBody.trimStart().startsWith('>');
    const isNumber   = /^\d+$/.test(selfBody);
    if (!hasPrefix && !hasEval && !isNumber) return;
  }

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
      if (!isFromMe && !isSudo(sender, loadSudo())) return;
      const hasPrefix = prefixes.some(p => body.startsWith(p));
      if (!hasPrefix) return;
      const cmd = body.slice(prefixes.find(p => body.startsWith(p))?.length || 1).trim().split(/\s+/)[0]?.toLowerCase();
      if (cmd !== 'unban') return;
    }
  } catch (_) {}

  const sudoList   = loadSudo();
  const isOwner    = isFromMe || isSudo(sender, sudoList);
  const isSudoUser = !isFromMe && isSudo(sender, sudoList);

  const mode = (process.env.MODE || 'public').toLowerCase();
  if (!isFromMe) {
    if (mode === 'private' && !isOwner) return;
    if (mode === 'group'   && !m.isGroup && !isOwner) return;
    if (mode === 'pm'      && m.isGroup  && !isOwner) return;
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
        const sNum   = sender?.split('@')[0] || '';
        const bNum   = sock.user?.id?.split(':')[0] || '';
        isAdmin      = admins.some(a => a.split('@')[0] === sNum);
        isBotAdmin   = admins.some(a => a.split('@')[0] === bNum);
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
      const sNum   = sender?.split('@')[0] || '';
      const bNum   = sock.user?.id?.split(':')[0] || '';
      isAdmin      = admins.some(a => a.split('@')[0] === sNum);
      isBotAdmin   = admins.some(a => a.split('@')[0] === bNum);
    } catch (_) {}
  };

  const ctx = {
    command: null, args: [], text: body,
    prefix:  getPrefix(body) || prefixes[0],
    isOwner, isSudo: isSudoUser, isCreator: isFromMe,
    isAdmin, isBotAdmin, isGroup: m.isGroup,
    sender,
    senderNum: sender?.split('@')[0].replace(/\D/g, '') || '',
    chat: m.chat,
    participants: meta?.participants || [],
    groupMetadata: meta,
    getGroupMetadata: getMeta,
    reply: (txt) => {
      if (txt === null || txt === undefined) return Promise.resolve();
      if (typeof txt === 'string' && !txt.trim()) return Promise.resolve();
      if (Buffer.isBuffer(txt) && txt.length === 0) return Promise.resolve();
      try {
        return sock.sendMessage(m.chat, { text: typeof txt === 'string' ? txt.trim() : txt }, { quoted: m });
      } catch { return Promise.resolve(); }
    },
    ownerNumbers: sudoList, config,
    getGroupEventsDB: loadGroupEventsDB,
    saveGroupEventsDB,
  };

  loader.autoReveal(sock, m);

  // ── Group filter: ALL group messages ─────────────────────────────
  if (m.isGroup && !isFromMe) {
    loader.groupFilter(sock, m, ctx);
  }

  // ── Sticker bond handler ─────────────────────────────────────────
  if (m.message?.stickerMessage) {
    const sm      = m.message.stickerMessage;
    const bondKey = getBondKey(sm);

    if (bondKey) {
      const bonds = readBonds();
      if (bonds[bondKey]) {
        const parts = bonds[bondKey].trim().split(/\s+/);
        const cmd   = parts[0].toLowerCase();
        if (sm.contextInfo?.quotedMessage) {
          if (!m.quoted) m.quoted = {};
          m.quoted.message = sm.contextInfo.quotedMessage;
        }
        ctx.command = cmd;
        ctx.args    = parts.slice(1);
        ctx.text    = parts.slice(1).join(' ');
        // Call plugin directly — bypass owner/admin checks for bonded stickers
        const plugin = loader.map.get(cmd);
        if (plugin?.execute) return plugin.execute(sock, m, ctx);
        return;
      }
    }
    return;
  }

  if (!body || !body.trim()) return;

  // ── > eval: works for owner regardless of fromMe ─────────────────
  if (body.trimStart().startsWith('>') && isOwner) {
    loader.onText(sock, m, ctx);
    return;
  }

  const pre = getPrefix(body);

  if (!pre) {
    // ── FIX: onText fires for EVERYONE including fromMe owner ──────
    // This is what makes "1", "100" replies work from owner's own number
    // spotify.handleText and fancychecker.handleText both need this
    loader.onText(sock, m, ctx);
    return;
  }

  const parts = body.slice(pre.length).trim().split(/\s+/);
  const cmd   = parts[0]?.toLowerCase();
  if (!cmd) return;

  ctx.command = cmd;
  ctx.args    = parts.slice(1);
  ctx.text    = parts.slice(1).join(' ');

  loader.exec(cmd, sock, m, ctx);
};
