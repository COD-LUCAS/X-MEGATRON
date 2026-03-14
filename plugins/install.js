const axios = require('axios');
const fs = require('fs');
const path = require('path');

const EXT_PLUGINS_DIR = path.join(__dirname, '..', 'database', 'external_plugins');
const EXT_PLUGINS_DB = path.join(__dirname, '..', 'database', 'extplugins.txt');

const ensureDir = () => {
  if (!fs.existsSync(EXT_PLUGINS_DIR)) {
    fs.mkdirSync(EXT_PLUGINS_DIR, { recursive: true });
  }
  if (!fs.existsSync(EXT_PLUGINS_DB)) {
    fs.writeFileSync(EXT_PLUGINS_DB, '');
  }
};

const readPluginDB = () => {
  ensureDir();
  const content = fs.readFileSync(EXT_PLUGINS_DB, 'utf8');
  return content.split('\n').filter(line => line.trim().length > 0).map(line => {
    const [name, url] = line.split('|');
    return { name, url };
  });
};

const addPluginDB = (name, url) => {
  ensureDir();
  fs.appendFileSync(EXT_PLUGINS_DB, `${name}|${url}\n`);
};

const removePluginDB = (name) => {
  ensureDir();
  const plugins = readPluginDB().filter(p => p.name !== name);
  fs.writeFileSync(EXT_PLUGINS_DB, plugins.map(p => `${p.name}|${p.url}`).join('\n') + '\n');
};

const downloadPlugin = async (url) => {
  let rawUrl = url;

  if (url.includes('gist.github.com')) {
    const gistId = url.split('/').pop();
    const apiUrl = `https://api.github.com/gists/${gistId}`;
    
    const response = await axios.get(apiUrl);
    const files = response.data.files;
    const firstFile = Object.values(files)[0];
    rawUrl = firstFile.raw_url;
  } else if (url.includes('github.com') && url.includes('/blob/')) {
    rawUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  } else if (url.includes('raw.githubusercontent.com')) {
    rawUrl = url;
  }

  const response = await axios.get(rawUrl, { timeout: 15000 });
  return response.data;
};

const validatePlugin = (code) => {
  try {
    if (!code.includes('module.exports')) {
      return { valid: false, error: 'Missing module.exports' };
    }

    if (!code.includes('command:')) {
      return { valid: false, error: 'Missing command field' };
    }

    if (!code.includes('execute')) {
      return { valid: false, error: 'Missing execute function' };
    }

    const tempModule = { exports: {} };
    const func = new Function('module', 'exports', 'require', code);
    func(tempModule, tempModule.exports, require);

    const plugin = tempModule.exports;

    if (!plugin.command) {
      return { valid: false, error: 'Invalid command field' };
    }

    if (typeof plugin.execute !== 'function') {
      return { valid: false, error: 'execute must be a function' };
    }

    const commands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];

    return { valid: true, commands, plugin };

  } catch (e) {
    return { valid: false, error: e.message };
  }
};

const extractFilename = (url) => {
  const parts = url.split('/');
  let name = parts[parts.length - 1];
  
  if (name.includes('?')) {
    name = name.split('?')[0];
  }
  
  if (!name.endsWith('.js')) {
    name = 'plugin_' + Date.now() + '.js';
  }
  
  return name;
};

module.exports = {
  command: ['install', 'plugins', 'remove', 'plugin'],
  category: 'owner',
  desc: 'Install, list, and manage external plugins',
  usage: '.install <url> / .plugins / .remove <name> / .plugin <name>',
  owner: true,

  async execute(sock, m, context) {
    const { command, text } = context;

    if (command === 'install') {
      if (!text) {
        return m.reply('_Give me a GitHub Gist/Raw URL_\n\n_Example:_\n.install https://gist.github.com/user/id');
      }

      const url = text.trim();
      const statusMsg = await m.reply('_⬇️ Downloading plugin..._');

      try {
        const code = await downloadPlugin(url);

        await sock.sendMessage(m.chat, {
          text: '_🔍 Validating plugin..._',
          edit: statusMsg.key
        });

        const validation = validatePlugin(code);

        if (!validation.valid) {
          return sock.sendMessage(m.chat, {
            text: `_❌ Invalid plugin_\n\n*Error:* ${validation.error}\n\n_Framework doesn't match X-MEGATRON_`,
            edit: statusMsg.key
          });
        }

        const filename = extractFilename(url);
        const pluginPath = path.join(EXT_PLUGINS_DIR, filename);

        fs.writeFileSync(pluginPath, code, 'utf8');

        const commandNames = validation.commands.join(', ');
        addPluginDB(commandNames, url);

        await sock.sendMessage(m.chat, {
          text: `_✅ Installed: ${commandNames}_\n\n_Saved to database/external_plugins/_\n_Restart to load plugin_`,
          edit: statusMsg.key
        });

      } catch (e) {
        await sock.sendMessage(m.chat, {
          text: `_❌ Failed to install_\n\n_${e.message}_`,
          edit: statusMsg.key
        });
      }
    }

    if (command === 'plugins') {
      const plugins = readPluginDB();

      if (plugins.length === 0) {
        return m.reply('_No external plugins installed_');
      }

      let list = '*📦 EXTERNAL PLUGINS*\n\n';
      plugins.forEach((p, i) => {
        list += `${i + 1}. *${p.name}*\n${p.url}\n\n`;
      });

      return m.reply(list);
    }

    if (command === 'remove') {
      if (!text) {
        return m.reply('_Give me plugin name to remove_\n\n_Example:_\n.remove ytdl');
      }

      const name = text.trim();
      const plugins = readPluginDB();

      const plugin = plugins.find(p => p.name.toLowerCase().includes(name.toLowerCase()));

      if (!plugin) {
        return m.reply('_Plugin not found_');
      }

      const filename = extractFilename(plugin.url);
      const pluginPath = path.join(EXT_PLUGINS_DIR, filename);

      if (fs.existsSync(pluginPath)) {
        fs.unlinkSync(pluginPath);
      }

      removePluginDB(plugin.name);

      return m.reply(`_✅ Removed: ${plugin.name}_\n\n_Deleted from database/external_plugins/_\n_Restart to unload_`);
    }

    if (command === 'plugin') {
      if (!text) {
        return m.reply('_Give me plugin name_\n\n_Example:_\n.plugin ytdl');
      }

      const name = text.trim();
      const plugins = readPluginDB();

      const plugin = plugins.find(p => p.name.toLowerCase().includes(name.toLowerCase()));

      if (!plugin) {
        return m.reply('_Plugin not found_');
      }

      return m.reply(`*Plugin:* ${plugin.name}\n\n*URL:*\n${plugin.url}`);
    }
  }
};
