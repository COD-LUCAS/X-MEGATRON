require('dotenv').config();

const config = require('./config');
const fs = require('fs');
const path = require('path');

const processedMessages = new Set();

global.disabledCommands = global.disabledCommands || new Set();

const DISABLED_COMMANDS_FILE = path.join(__dirname, 'disabled_commands.json');

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
    fs.writeFileSync(DISABLED_COMMANDS_FILE, JSON.stringify(Array.from(global.disabledCommands), null, 2));
  } catch (e) {}
};

loadDisabledCommands();

const extractDigits = (jid) => {
  if (!jid) return '';
  return jid.split('@')[0].replace(/\D/g, '');
};

const checkIsSudo = (senderJid, sudoList) => {
  if (!senderJid || !sudoList.length) return false;
  const senderDigits = extractDigits(senderJid);
  if (!senderDigits) return false;
  return sudoList.some(entry => {
    const entryDigits = extractDigits(entry);
    if (!entryDigits) return false;
    if (senderDigits === entryDigits) return true;
    if (senderDigits.length >= 7 && entryDigits.length >= 7) {
      return senderDigits.slice(-10) === entryDigits.slice(-10);
    }
    return false;
  });
};

const checkIsCreator = (senderJid, botJid) => {
  if (!senderJid || !botJid) return false;
  const senderDigits = extractDigits(senderJid);
  const botDigits = extractDigits(botJid);
  if (!senderDigits || !botDigits) return false;
  return senderDigits.slice(-10) === botDigits.slice(-10);
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
        console.log(`Failed to load plugin ${file}:`, e.message);
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

      try {
        await plugin.execute(sock, m, context);
      } catch (e) {
        console.log(`Plugin error (${command}):`, e.message);
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
      arr.slice(-100).forEach(id => processedMessages.add(id));
    }

    await pluginLoader.executeAutoReveal(sock, m);

    // smsg() already set: m.chat, m.isGroup, m.mtype, m.body, m.sender, m.fromMe, m.quoted, m.reply
    const body = m.body || m.text || '';
    const senderJid = m.sender || '';
    const botJid = sock.user?.id || '';

    const sudoFromEnv = (process.env.SUDO || '').split(',').map(v => v.trim()).filter(Boolean);
    const sudoFile = path.join(__dirname, 'sudo.json');
    let sudoFromFile = [];
    try {
      if (fs.existsSync(sudoFile)) sudoFromFile = JSON.parse(fs.readFileSync(sudoFile, 'utf8'));
    } catch (e) {}
    const sudoList = [...new Set([...sudoFromEnv, ...sudoFromFile])];
    const isCreator = m.fromMe || checkIsCreator(senderJid, botJid);
    const isSudo = !isCreator && checkIsSudo(senderJid, sudoList);
    const isOwner = isCreator || isSudo;

    const mode = (process.env.MODE || 'public').toLowerCase();
    if (mode === 'private' && !isOwner) return;

    let groupMetadata = null;
    let participants = [];
    let isAdmins = false;

    const getGroupMetadata = async () => {
      if (!m.isGroup || groupMetadata) return;
      try {
        groupMetadata = await sock.groupMetadata(m.chat);
        participants = groupMetadata.participants || [];
        const admins = participants.filter(p => p.admin).map(p => p.id);
        isAdmins = admins.some(id => extractDigits(id).slice(-10) === extractDigits(senderJid).slice(-10));
      } catch (e) {}
    };

    const context = {
      command: null,
      args: [],
      text: body,
      isOwner,
      isSudo,
      isCreator,
      isAdmins,
      isGroup: m.isGroup,
      sender: senderJid,
      senderNum: extractDigits(senderJid),
      prefix: process.env.PREFIX || '.',
      reply: (txt) => m.reply(txt),
      get participants() { return participants; },
      get groupMetadata() { return groupMetadata; },
      getGroupMetadata,
      config,
    };

    pluginLoader.executeOnText(sock, m, context).catch(() => {});

    if (!body) return;

    const prefix = process.env.PREFIX || '.';
    if (!body.startsWith(prefix)) return;

    const parts = body.slice(prefix.length).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    if (!command) return;

    const args = parts.slice(1);
    context.command = command;
    context.args = args;
    context.text = args.join(' ');

    if (m.isGroup) {
      await getGroupMetadata();
      context.isAdmins = isAdmins;
    }

    await pluginLoader.executeCommand(command, sock, m, context);

  } catch (e) {
    console.error('Handler error:', e.message);
  }
};

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  delete require.cache[file];
  require(file);
});
