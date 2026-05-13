
'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const EXT_DIR = path.join(__dirname, '..', 'database', 'external_plugins');
const DB_FILE = path.join(__dirname, '..', 'database', 'extplugins.txt');

// Ensure directories exist
const ensureDirs = () => {
  if (!fs.existsSync(EXT_DIR)) fs.mkdirSync(EXT_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '');
};

// Get all plugins
const getPlugins = () => {
  ensureDirs();
  const content = fs.readFileSync(DB_FILE, 'utf8');
  if (!content.trim()) return [];
  
  return content.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const [name, url, filename] = line.split('|');
      return { name, url, filename };
    });
};

// Save plugin
const savePlugin = (name, url, filename) => {
  const plugins = getPlugins();
  const filtered = plugins.filter(p => p.name !== name);
  filtered.push({ name, url, filename });
  
  const content = filtered.map(p => `${p.name}|${p.url}|${p.filename}`).join('\n');
  fs.writeFileSync(DB_FILE, content + (content ? '\n' : ''));
};

// Delete plugin
const deletePlugin = (name) => {
  const plugins = getPlugins();
  const filtered = plugins.filter(p => p.name !== name);
  
  if (filtered.length === 0) {
    fs.writeFileSync(DB_FILE, '');
  } else {
    const content = filtered.map(p => `${p.name}|${p.url}|${p.filename}`).join('\n');
    fs.writeFileSync(DB_FILE, content + '\n');
  }
};

// Get raw URL from GitHub/Gist
const getRawUrl = async (url) => {
  if (url.includes('gist.github.com')) {
    const id = url.split('/').pop().split('?')[0];
    const res = await axios.get(`https://api.github.com/gists/${id}`);
    const files = Object.values(res.data.files);
    if (files.length === 0) throw new Error('No files in gist');
    return files[0].raw_url;
  }
  if (url.includes('github.com') && url.includes('/blob/')) {
    return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  }
  return url;
};

// Validate plugin
const validatePlugin = (code) => {
  try {
    if (!code.includes('module.exports')) {
      return { ok: false, err: 'Missing module.exports' };
    }
    
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
    const p = mod.exports;
    
    if (!p.command && !p.onText) {
      return { ok: false, err: 'Missing command or onText' };
    }
    
    let name = 'listener';
    if (p.command) {
      name = Array.isArray(p.command) ? p.command[0] : p.command;
    }
    
    return { ok: true, name };
  } catch (e) {
    return { ok: false, err: e.message };
  }
};

// Hot reload
const reloadPlugins = () => {
  try {
    if (global.pluginLoader && typeof global.pluginLoader.reload === 'function') {
      global.pluginLoader.reload();
      return true;
    }
  } catch (e) {}
  return false;
};

module.exports = {
  command: ['install', 'plugins', 'remove'],
  category: 'owner',
  desc: 'Install and manage external plugins',
  usage: '.install <gist_url> | .plugins | .remove <plugin_name>',

  async execute(sock, m, context) {
    const { command, text, isOwner, prefix } = context;
    
    if (!isOwner) return;

    // ──────────────────────────────────────────────────────────
    // INSTALL PLUGIN
    // ──────────────────────────────────────────────────────────
    if (command === 'install') {
      if (!text) {
        return m.reply(`_Usage: ${prefix}install <gist_url>_`);
      }

      const status = await m.reply('_Downloading..._');
      const url = text.trim();

      try {
        const rawUrl = await getRawUrl(url);
        const response = await axios.get(rawUrl, { timeout: 15000 });
        const code = response.data;

        await sock.sendMessage(m.chat, { text: '_Validating..._', edit: status.key });

        const validation = validatePlugin(code);
        if (!validation.ok) {
          return sock.sendMessage(m.chat, {
            text: `_Invalid plugin_\n_${validation.err}_`,
            edit: status.key,
          });
        }

        const pluginName = validation.name;
        const filename = `${pluginName}.js`;
        const filepath = path.join(EXT_DIR, filename);

        // Remove old if exists
        const existing = getPlugins().find(p => p.name === pluginName);
        if (existing) {
          const oldPath = path.join(EXT_DIR, existing.filename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        // Save new plugin
        fs.writeFileSync(filepath, code, 'utf8');
        savePlugin(pluginName, url, filename);

        const reloaded = reloadPlugins();

        await sock.sendMessage(m.chat, {
          text: `_Installed: ${pluginName}_\n${reloaded ? '_Ready to use_' : '_Restart to activate_'}`,
          edit: status.key,
        });

      } catch (err) {
        await sock.sendMessage(m.chat, {
          text: `_Install failed_\n_${err.message}_`,
          edit: status.key,
        });
      }
    }

    // ──────────────────────────────────────────────────────────
    // LIST PLUGINS
    // ──────────────────────────────────────────────────────────
    if (command === 'plugins') {
      const plugins = getPlugins();
      
      if (plugins.length === 0) {
        return m.reply('_No plugins installed_');
      }
      
      let msg = `_Installed plugins (${plugins.length})_\n\n`;
      plugins.forEach((p, i) => {
        msg += `_${i + 1}. ${p.name}_\n`;
      });
      msg += `\n_Use ${prefix}remove <name> to remove_`;
      
      return m.reply(msg);
    }

    // ──────────────────────────────────────────────────────────
    // REMOVE PLUGIN
    // ──────────────────────────────────────────────────────────
    if (command === 'remove') {
      const plugins = getPlugins();
      
      if (plugins.length === 0) {
        return m.reply('_No plugins installed_');
      }
      
      if (!text) {
        let msg = `_Remove a plugin_\n\n_Usage: ${prefix}remove <plugin_name>_\n\n_Installed:_\n`;
        plugins.forEach((p, i) => {
          msg += `_${i + 1}. ${p.name}_\n`;
        });
        return m.reply(msg);
      }
      
      const searchName = text.trim();
      
      // Find plugin
      let target = plugins.find(p => p.name === searchName);
      if (!target) {
        target = plugins.find(p => p.name.toLowerCase() === searchName.toLowerCase());
      }
      
      if (!target) {
        let msg = `_Plugin "${searchName}" not found_\n\n_Installed:_\n`;
        plugins.forEach((p, i) => {
          msg += `_${i + 1}. ${p.name}_\n`;
        });
        return m.reply(msg);
      }
      
      // Delete file
      const filepath = path.join(EXT_DIR, target.filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      
      // Delete from database
      deletePlugin(target.name);
      
      // Verify deletion
      const afterDelete = getPlugins();
      const stillExists = afterDelete.find(p => p.name === target.name);
      
      if (stillExists) {
        return m.reply(`_Failed to remove ${target.name}_`);
      }
      
      // Reload
      const reloaded = reloadPlugins();
      
      return m.reply(`_Removed: ${target.name}_\n${reloaded ? '_Unloaded_' : '_Restart to complete_'}`);
    }
  },
};