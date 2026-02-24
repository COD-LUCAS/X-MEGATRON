require('dotenv').config();

const config = require('./config');
const fs = require('fs');
const path = require('path');

const processedMessages = new Set();

const DATABASE_DIR = path.join(__dirname, 'database');
if (!fs.existsSync(DATABASE_DIR)) {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

global.disabledCommands = global.disabledCommands || new Set();
const DISABLED_COMMANDS_FILE = path.join(DATABASE_DIR, 'disabled_commands.json');
const BOND_FILE = path.join(DATABASE_DIR, 'sticker_bonds.json');
const SUDO_FILE = path.join(DATABASE_DIR, 'sudo.json');

const loadDisabledCommands = () => {
  try {
    if (fs.existsSync(DISABLED_COMMANDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(DISABLED_COMMANDS_FILE, 'utf8'));
      global.disabledCommands = new Set(data);
    }
  } catch (e) {}
};

global.saveDisabledCommands = () => {
  try {
    fs.writeFileSync(
      DISABLED_COMMANDS_FILE,
      JSON.stringify(Array.from(global.disabledCommands), null, 2)
    );
  } catch (e) {}
};

loadDisabledCommands();

const readBonds = () => {
  try {
    if (fs.existsSync(BOND_FILE)) {
      return JSON.parse(fs.readFileSync(BOND_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
};

const extractDigits = (jid) => {
  if (!jid) return '';
  return jid.split('@')[0].replace(/\D/g, '');
};

const normalizeJid = (input) => {
  if (!input) return '';
  const digits = extractDigits(input);
  if (!digits) return '';
  if (input.includes('@lid')) return digits + '@lid';
  if (input.includes('@s.whatsapp.net')) return digits + '@s.whatsapp.net';
  return digits + '@s.whatsapp.net';
};

const jidMatchesSuffix = (a, b) => {
  const da = extractDigits(a);
  const db = extractDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 7 && db.length >= 7) return da.slice(-10) === db.slice(-10);
  return false;
};

const loadSudoList = () => {
  const fromEnv = (process.env.SUDO || '')
    .split(',')
    .map((v) => normalizeJid(v.trim()))
    .filter(Boolean);

  let fromFile = [];
  try {
    if (fs.existsSync(SUDO_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SUDO_FILE, 'utf8'));
      fromFile = Array.isArray(raw) ? raw.map(normalizeJid) : [];
    }
  } catch (e) {}

  return [...new Set([...fromEnv, ...fromFile])];
};

const checkIsSudo = (senderJid, sudoList) => {
  if (!senderJid || !sudoList.length) return false;
  return sudoList.some((entry) => jidMatchesSuffix(senderJid, entry));
};

const SPECIAL_PREFIX_RE = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@()#,'"*+÷/\%^&.©^]/gi;
const EMOJI_PREFIX_RE = /^[\uD800-\uDBFF][\uDC00-\uDFFF]/gi;

const getListPrefix = () => {
  const raw = process.env.LIST_PREFIX || process.env.PREFIX || '.';
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
};

const detectPrefix = (body, multiprefix) => {
  if (!body) return null;

  const listPrefix = getListPrefix();

  if (multiprefix) {
    if (SPECIAL_PREFIX_RE.test(body)) {
      const match = body.match(SPECIAL_PREFIX_RE);
      return match ? match[0] : null;
    }
    if (EMOJI_PREFIX_RE.test(body)) {
      const match = body.match(EMOJI_PREFIX_RE);
      return match ? match[0] : null;
    }
  }

  for (const prefix of listPrefix) {
    if (body.startsWith(prefix)) return prefix;
  }

  return null;
};

class PluginLoader {
  constructor() {
    this.plugins = [];
    this.loadPlugins();
  }

  loadPlugins() {
    const pluginDir = path.join(__dirname, 'plugins');
    if (!fs.existsSync(pluginDir)) return;
    this.plugins = [];
    for (const file of fs.readdirSync(pluginDir)) {
      if (!file.endsWith('.js')) continue;
      try {
        delete require.cache[require.resolve(path.join(pluginDir, file))];
        const plugin = require(path.join(pluginDir, file));
        if (plugin?.command || plugin?.onText || plugin?.autoReveal) {
          this.plugins.push(plugin);
        }
      } catch (e) {
        console.log(`[PluginLoader] Failed to load ${file}:`, e.message);
      }
    }
  }

  async executeCommand(command, sock, m, context) {
    if (global.disabledCommands.has(command)) {
      await m.reply('_❌ This command has been disabled by the owner_');
      return;
    }

    for (const plugin of this.plugins) {
      if (!plugin.command) continue;
      const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
      if (!cmds.includes(command)) continue;

      if (plugin.owner === true && !context.isOwner) {
        await m.reply('_❌ This command is for the owner only_');
        return;
      }
      if (plugin.sudo === true && !context.isOwner && !context.isSudo) {
        await m.reply('_❌ This command is for sudo/owner only_');
        return;
      }
      if (plugin.admin === true && !context.isAdmins && !context.isOwner) {
        await m.reply('_❌ This command is for group admins only_');
        return;
      }
      if (plugin.group === true && !context.isGroup) {
        await m.reply('_❌ This command can only be used in groups_');
        return;
      }
      if (plugin.private === true && context.isGroup) {
        await m.reply('_❌ This command can only be used in private chat_');
        return;
      }

      try {
        await plugin.execute(sock, m, context);
      } catch (e) {
        console.error(`[Plugin error] (${command}):`, e.message);
      }
      return;
    }
  }

  async executeOnText(sock, m, context) {
    for (const plugin of this.plugins) {
      if (!plugin.onText) continue;
      try {
        await plugin.execute(sock, m, context);
      } catch (e) {}
    }
  }

  async executeAutoReveal(sock, m) {
    for (const plugin of this.plugins) {
      if (!plugin.autoReveal) continue;
      try {
        await plugin.autoReveal(sock, m);
      } catch (e) {}
    }
  }
}

const pluginLoader = new PluginLoader();

module.exports = async (sock, m) => {
  try {
    if (!m?.key?.id) return;
    if (!m.message) return;
    if (m.key.remoteJid === 'status@broadcast') return;
    if (m.message.protocolMessage) return;
    if (m.message.senderKeyDistributionMessage) return;
    if (m.message.reactionMessage) return;

    if (processedMessages.has(m.key.id)) return;
    processedMessages.add(m.key.id);
    if (processedMessages.size > 200) {
      const arr = Array.from(processedMessages);
      processedMessages.clear();
      arr.slice(-100).forEach((id) => processedMessages.add(id));
    }

    await pluginLoader.executeAutoReveal(sock, m);

    const body =
      m.body ||
      m.text ||
      m.message?.conversation ||
      m.message?.imageMessage?.caption ||
      m.message?.videoMessage?.caption ||
      m.message?.extendedTextMessage?.text ||
      m.message?.buttonsResponseMessage?.selectedButtonId ||
      m.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      m.message?.templateButtonReplyMessage?.selectedId ||
      (m.message?.interactiveResponseMessage?.nativeFlowResponseMessage
        ? (() => {
            try {
              return JSON.parse(
                m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson
              ).id;
            } catch {
              return '';
            }
          })()
        : '') ||
      m.message?.editedMessage?.message?.protocolMessage?.editedMessage?.extendedTextMessage?.text ||
      m.message?.editedMessage?.message?.protocolMessage?.editedMessage?.conversation ||
      '';

    const senderJid = m.sender || m.key?.participant || m.key?.remoteJid || '';
    const botJid = sock.user?.id || '';

    const sudoList = loadSudoList();
    const isOwner = m.fromMe || checkIsSudo(senderJid, sudoList);
    const isSudo = !m.fromMe && checkIsSudo(senderJid, sudoList);

    const mode = (process.env.MODE || 'public').toLowerCase();

    if (mode === 'private' && !isOwner) return;
    if (mode === 'group' && !m.isGroup && !isOwner) return;
    if (mode === 'pm' && m.isGroup && !isOwner) return;

    if (m.isBot && !m.fromMe) return;

    let groupMetadata = null;
    let participants = [];
    let isAdmins = false;
    let isBotAdmin = false;

    const getGroupMetadata = async () => {
      if (!m.isGroup || groupMetadata) return;
      try {
        groupMetadata = await sock.groupMetadata(m.chat || m.key.remoteJid);
        participants = groupMetadata.participants || [];
        const admins = participants.filter((p) => p.admin).map((p) => p.id);
        isAdmins = admins.some((id) => jidMatchesSuffix(id, senderJid));
        isBotAdmin = admins.some((id) => jidMatchesSuffix(id, botJid));
      } catch (e) {}
    };

    if (m.isGroup) await getGroupMetadata();

    const multiprefix = (process.env.MULTI_PREFIX || 'false').toLowerCase() === 'true';

    const context = {
      command: null,
      args: [],
      text: body,

      isOwner,
      isSudo,
      isCreator: m.fromMe,
      isAdmins,
      isBotAdmin,

      isGroup: m.isGroup,
      sender: senderJid,
      senderNum: extractDigits(senderJid),
      chat: m.chat || m.key?.remoteJid,

      get prefix() {
        return detectPrefix(body, multiprefix) || getListPrefix()[0] || '.';
      },

      get participants() {
        return participants;
      },
      get groupMetadata() {
        return groupMetadata;
      },
      getGroupMetadata,

      reply: (txt) => m.reply(txt),

      ownerNumbers: sudoList.map(extractDigits),

      config,
    };

    pluginLoader.executeOnText(sock, m, context).catch(() => {});

    if (m.message?.stickerMessage) {
      let stickerHash = null;

      if (m.message.stickerMessage.fileSha256) {
        stickerHash = m.message.stickerMessage.fileSha256.toString('base64');
      } else if (m.msg?.fileSha256) {
        stickerHash = m.msg.fileSha256.toString('base64');
      }

      if (stickerHash) {
        const bonds = readBonds();

        if (bonds[stickerHash]) {
          const boundCommand = bonds[stickerHash];
          const parts = boundCommand.trim().split(/\s+/);
          const command = parts[0]?.toLowerCase();
          const args = parts.slice(1);

          if (m.message.stickerMessage.contextInfo?.quotedMessage) {
            if (!m.quoted) m.quoted = {};
            m.quoted.message = m.message.stickerMessage.contextInfo.quotedMessage;
          }

          context.command = command;
          context.args = args;
          context.text = args.join(' ');

          await pluginLoader.executeCommand(command, sock, m, context);
          return;
        }
      }
    }

    if (!body || body.trim().length === 0) return;

    const detectedPrefix = detectPrefix(body, multiprefix);
    if (!detectedPrefix) return;

    const parts = body.slice(detectedPrefix.length).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    if (!command || command.length === 0) return;

    const args = parts.slice(1);
    context.command = command;
    context.args = args;
    context.text = args.join(' ');

    await pluginLoader.executeCommand(command, sock, m, context);
  } catch (e) {
    console.error('[Handler error]', e.message);
  }
};

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  delete require.cache[file];
  require(file);
});
