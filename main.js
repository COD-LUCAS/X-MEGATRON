require('dotenv').config();

const config = require('./config');
const fs = require('fs');
const path = require('path');

const processed = new Set();
const DATABASE_DIR = path.join(__dirname, 'database');

if (!fs.existsSync(DATABASE_DIR)) {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

global.disabledCommands = global.disabledCommands || new Set();

const loadDisabled = () => {
  try {
    const file = path.join(DATABASE_DIR, 'disabled_commands.json');
    if (fs.existsSync(file)) {
      global.disabledCommands = new Set(JSON.parse(fs.readFileSync(file, 'utf8')));
    }
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
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {}
  return {};
};

const loadSudo = () => {
  const env = (process.env.SUDO || '').split(',').map(v => v.trim()).filter(Boolean);
  
  let file = [];
  try {
    const sudoFile = path.join(DATABASE_DIR, 'sudo.json');
    if (fs.existsSync(sudoFile)) {
      file = JSON.parse(fs.readFileSync(sudoFile, 'utf8'));
    }
  } catch (e) {}
  
  return [...new Set([...env, ...file])];
};

const isSudo = (sender, list) => {
  const num = sender.split('@')[0].replace(/\D/g, '');
  return list.some(s => {
    const sNum = s.replace(/\D/g, '');
    return num === sNum || num.endsWith(sNum.slice(-10));
  });
};

const prefixes = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',').map(p => p.trim());

const getPrefix = (text) => {
  for (const p of prefixes) {
    if (text.startsWith(p)) return p;
  }
  return null;
};

class Loader {
  constructor() {
    this.plugins = [];
    this.map = new Map();
    this.load();
  }

  load() {
    const dir = path.join(__dirname, 'plugins');
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    
    for (const file of files) {
      try {
        const p = require(path.join(dir, file));
        if (!p?.command) continue;
        
        this.plugins.push(p);
        
        const cmds = Array.isArray(p.command) ? p.command : [p.command];
        cmds.forEach(c => this.map.set(c, p));
      } catch (e) {}
    }
  }

  async exec(cmd, sock, m, ctx) {
    if (global.disabledCommands.has(cmd)) return;
    
    const p = this.map.get(cmd);
    if (!p) return;
    
    if (p.owner && !ctx.isOwner) return;
    if (p.sudo && !ctx.isOwner && !ctx.isSudo) return;
    if (p.admin && !ctx.isAdmin && !ctx.isOwner) return;
    if (p.group && !m.isGroup) return;
    if (p.private && m.isGroup) return;
    
    try {
      await p.execute(sock, m, ctx);
    } catch (e) {}
  }

  async onText(sock, m, ctx) {
    for (const p of this.plugins) {
      if (!p.onText) continue;
      try {
        await p.execute(sock, m, ctx);
      } catch (e) {}
    }
  }

  async autoReveal(sock, m) {
    for (const p of this.plugins) {
      if (!p.autoReveal) continue;
      try {
        await p.autoReveal(sock, m);
      } catch (e) {}
    }
  }
}

const loader = new Loader();

module.exports = async (sock, m) => {
  try {
    if (!m?.key?.id || !m.message) return;
    if (m.key.remoteJid === 'status@broadcast') return;
    
    if (processed.has(m.key.id)) return;
    processed.add(m.key.id);
    if (processed.size > 100) {
      const arr = [...processed].slice(-50);
      processed.clear();
      arr.forEach(id => processed.add(id));
    }

    const body = m.body || '';
    const sender = m.sender || '';
    
    const sudoList = loadSudo();
    const isOwner = m.fromMe || isSudo(sender, sudoList);
    const isSudoUser = !m.fromMe && isSudo(sender, sudoList);
    
    const mode = (process.env.MODE || 'public').toLowerCase();
    if (mode === 'private' && !isOwner) return;
    if (mode === 'group' && !m.isGroup && !isOwner) return;
    if (mode === 'pm' && m.isGroup && !isOwner) return;

    let meta = null;
    let isAdmin = false;
    let isBotAdmin = false;
    
    const getMeta = async () => {
      if (!m.isGroup || meta) return;
      try {
        meta = await sock.groupMetadata(m.chat);
        const admins = meta.participants.filter(p => p.admin).map(p => p.id);
        const sNum = sender.split('@')[0];
        const bNum = sock.user.id.split(':')[0];
        isAdmin = admins.some(a => a.split('@')[0].endsWith(sNum.slice(-10)));
        isBotAdmin = admins.some(a => a.split('@')[0].endsWith(bNum.slice(-10)));
      } catch (e) {}
    };

    if (m.isGroup) await getMeta();

    const ctx = {
      command: null,
      args: [],
      text: body,
      prefix: getPrefix(body) || prefixes[0],
      
      isOwner,
      isSudo: isSudoUser,
      isCreator: m.fromMe,
      isAdmin,
      isBotAdmin,
      
      isGroup: m.isGroup,
      sender,
      senderNum: sender.split('@')[0].replace(/\D/g, ''),
      chat: m.chat,
      
      participants: meta?.participants || [],
      groupMetadata: meta,
      getGroupMetadata: getMeta,
      
      reply: (txt) => {
        if (!txt || (typeof txt === 'string' && !txt.trim())) return Promise.resolve();
        return m.reply(txt);
      },
      
      ownerNumbers: sudoList,
      config
    };

    await loader.autoReveal(sock, m);

    if (m.message?.stickerMessage) {
      let hash = null;
      
      if (m.message.stickerMessage.fileSha256) {
        hash = m.message.stickerMessage.fileSha256.toString('base64');
      } else if (m.msg?.fileSha256) {
        hash = m.msg.fileSha256.toString('base64');
      }
      
      if (hash) {
        const bonds = readBonds();
        if (bonds[hash]) {
          const parts = bonds[hash].trim().split(/\s+/);
          const cmd = parts[0].toLowerCase();
          
          if (m.message.stickerMessage.contextInfo?.quotedMessage) {
            if (!m.quoted) m.quoted = {};
            m.quoted.message = m.message.stickerMessage.contextInfo.quotedMessage;
          }
          
          ctx.command = cmd;
          ctx.args = parts.slice(1);
          ctx.text = parts.slice(1).join(' ');
          
          return loader.exec(cmd, sock, m, ctx);
        }
      }
    }

    if (!body || !body.trim()) return;
    
    const pre = getPrefix(body);
    if (!pre) {
      loader.onText(sock, m, ctx);
      return;
    }
    
    const parts = body.slice(pre.length).trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    if (!cmd) return;
    
    ctx.command = cmd;
    ctx.args = parts.slice(1);
    ctx.text = parts.slice(1).join(' ');
    
    await loader.exec(cmd, sock, m, ctx);
    
  } catch (e) {}
};
