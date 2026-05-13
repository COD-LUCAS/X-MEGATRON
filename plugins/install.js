'use strict';

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const EXT_DIR = path.join(__dirname, '..', 'database', 'external_plugins');
const DB_FILE = path.join(__dirname, '..', 'database', 'extplugins.txt');

const ensureDirs = () => {
  if (!fs.existsSync(EXT_DIR)) fs.mkdirSync(EXT_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '');
};

const readDB = () => {
  ensureDirs();
  const content = fs.readFileSync(DB_FILE, 'utf8');
  if (!content.trim()) return [];
  
  return content.split('\n')
    .filter(l => l.trim())
    .map(l => {
      const parts = l.split('|');
      return { name: parts[0], url: parts[1], filename: parts[2] };
    });
};

const writeDB = (list) => {
  if (list.length === 0) {
    fs.writeFileSync(DB_FILE, '');
  } else {
    fs.writeFileSync(DB_FILE, list.map(p => `${p.name}|${p.url}|${p.filename}`).join('\n') + '\n');
  }
};

const addDB = (name, url, filename) => {
  ensureDirs();
  const plugins = readDB();
  const existing = plugins.find(p => p.name === name);
  if (existing) {
    const filtered = plugins.filter(p => p.name !== name);
    filtered.push({ name, url, filename });
    writeDB(filtered);
  } else {
    fs.appendFileSync(DB_FILE, `${name}|${url}|${filename}\n`);
  }
};

const removeDB = (name) => {
  const plugins = readDB();
  const filtered = plugins.filter(p => p.name !== name);
  writeDB(filtered);
};

const getAllPlugins = () => {
  return readDB();
};

const findPlugin = (query) => {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  const plugins = readDB();
  
  // Exact match
  let found = plugins.find(p => p.name.toLowerCase() === q);
  // Starts with
  if (!found) found = plugins.find(p => p.name.toLowerCase().startsWith(q));
  // Includes
  if (!found) found = plugins.find(p => p.name.toLowerCase().includes(q));
  
  return found;
};

const rawUrl = async (url) => {
  if (url.includes('gist.github.com')) {
    const id = url.split('/').pop().split('?')[0];
    const res = await axios.get(`https://api.github.com/gists/${id}`);
    return Object.values(res.data.files)[0].raw_url;
  }
  if (url.includes('github.com') && url.includes('/blob/')) {
    return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  }
  return url;
};

const validate = (code) => {
  try {
    if (!code.includes('module.exports')) return { ok: false, err: 'Missing module.exports' };
    if (!code.includes('execute')) return { ok: false, err: 'Missing execute function' };
    
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
    const p = mod.exports;
    
    if (typeof p.execute !== 'function') return { ok: false, err: 'execute must be a function' };
    if (!p.command && !p.onText) return { ok: false, err: 'Missing command or onText' };
    
    const cmds = p.command
      ? (Array.isArray(p.command) ? p.command : [p.command])
      : ['listener'];
    
    return { ok: true, cmds };
  } catch (e) {
    return { ok: false, err: e.message };
  }
};

const makeFilename = (cmds) => `${cmds[0].replace(/[^a-z0-9_-]/gi, '')}.js`;

const hotReload = () => {
  try {
    if (global.pluginLoader && typeof global.pluginLoader.reload === 'function') {
      global.pluginLoader.reload();
      return true;
    }
  } catch (_) {}
  return false;
};

module.exports = {
  command: ['install', 'plugins', 'remove', 'plugin', 'gistupdate'],
  category: 'owner',
  desc: 'Install and manage external plugins',
  usage: '.install <url> | .plugins | .remove <name> | .plugin <name>',

  async execute(sock, m, context) {
    const { command, text, isOwner, prefix } = context;
    ensureDirs();

    // ── PLUGINS LIST ──────────────────────────────────────────
    if (command === 'plugins') {
      const plugins = getAllPlugins();
      if (!plugins.length) {
        return m.reply('_No external plugins installed_');
      }
      
      let txt = `_External plugins (${plugins.length})_\n\n`;
      plugins.forEach((p, i) => {
        txt += `_${i + 1}. ${p.name}_\n`;
      });
      txt += `\n_Use ${prefix}remove <name> to remove_`;
      return m.reply(txt);
    }

    // ── OWNER CHECK ───────────────────────────────────────────
    if (!isOwner) return m.reply('_Owner only_');

    // ── INSTALL ───────────────────────────────────────────────
    if (command === 'install') {
      if (!text) {
        return m.reply(`_Usage: ${prefix}install <url>_`);
      }

      const status = await m.reply('_Downloading..._');
      
      try {
        const rUrl = await rawUrl(text.trim());
        const res = await axios.get(rUrl, { timeout: 15000 });
        const code = res.data;

        await sock.sendMessage(m.chat, { text: '_Validating..._', edit: status.key });

        const v = validate(code);
        if (!v.ok) {
          return sock.sendMessage(m.chat, {
            text: `_Invalid plugin_\n_Error: ${v.err}_`,
            edit: status.key,
          });
        }

        const filename = makeFilename(v.cmds);
        const pluginPath = path.join(EXT_DIR, filename);
        
        // Remove existing if any
        const existing = findPlugin(v.cmds[0]);
        if (existing) {
          const oldPath = path.join(EXT_DIR, existing.filename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          removeDB(existing.name);
        }

        fs.writeFileSync(pluginPath, code, 'utf8');
        addDB(v.cmds[0], text.trim(), filename);

        const reloaded = hotReload();

        return sock.sendMessage(m.chat, {
          text: `_Installed: ${v.cmds[0]}_\n${reloaded ? '_Plugin loaded instantly_' : '_Restart to activate_'}`,
          edit: status.key,
        });

      } catch (e) {
        return sock.sendMessage(m.chat, {
          text: `_Install failed_\n_${e.message}_`,
          edit: status.key,
        });
      }
    }

    // ── REMOVE ────────────────────────────────────────────────
    if (command === 'remove') {
      const plugins = getAllPlugins();
      
      // No plugins installed
      if (!plugins.length) {
        return m.reply('_No plugins installed to remove_');
      }
      
      // No plugin name provided - show list
      if (!text) {
        let txt = `_Remove a plugin_\n\n_Usage: ${prefix}remove <plugin_name>_\n\n_Installed plugins:_\n`;
        plugins.forEach((p, i) => {
          txt += `_${i + 1}. ${p.name}_\n`;
        });
        txt += `\n_Example: ${prefix}remove ${plugins[0].name}_`;
        return m.reply(txt);
      }

      // Find plugin to remove
      const plugin = findPlugin(text);
      
      if (!plugin) {
        let txt = `_Plugin "${text}" not found_\n\n_Installed plugins:_\n`;
        plugins.forEach((p, i) => {
          txt += `_${i + 1}. ${p.name}_\n`;
        });
        return m.reply(txt);
      }

      // Delete the file
      const filePath = path.join(EXT_DIR, plugin.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Remove from database
      removeDB(plugin.name);
      
      // Clean up orphaned files
      const remainingPlugins = getAllPlugins();
      const validFiles = remainingPlugins.map(p => p.filename);
      const allFiles = fs.readdirSync(EXT_DIR).filter(f => f.endsWith('.js'));
      for (const file of allFiles) {
        if (!validFiles.includes(file)) {
          const orphanPath = path.join(EXT_DIR, file);
          if (fs.existsSync(orphanPath)) fs.unlinkSync(orphanPath);
        }
      }

      const reloaded = hotReload();
      
      return m.reply(`_Removed: ${plugin.name}_\n${reloaded ? '_Unloaded instantly_' : '_Restart to complete_'}`);
    }

    // ── PLUGIN INFO ───────────────────────────────────────────
    if (command === 'plugin') {
      const plugins = getAllPlugins();
      
      if (!plugins.length) {
        return m.reply('_No plugins installed_');
      }
      
      if (!text) {
        let txt = `_View plugin details_\n\n_Usage: ${prefix}plugin <plugin_name>_\n\n_Installed plugins:_\n`;
        plugins.forEach((p, i) => {
          txt += `_${i + 1}. ${p.name}_\n`;
        });
        return m.reply(txt);
      }

      const plugin = findPlugin(text);
      if (!plugin) {
        let txt = `_Plugin "${text}" not found_\n\n_Installed plugins:_\n`;
        plugins.forEach((p, i) => {
          txt += `_${i + 1}. ${p.name}_\n`;
        });
        return m.reply(txt);
      }

      return m.reply(`_Plugin: ${plugin.name}_\n\n_URL: ${plugin.url}_`);
    }

    // ── GIST UPDATE ───────────────────────────────────────────
    if (command === 'gistupdate') {
      const plugins = getAllPlugins();
      
      if (!plugins.length) {
        return m.reply('_No plugins installed to update_');
      }
      
      if (!text) {
        let txt = `_Update a plugin_\n\n_Usage: ${prefix}gistupdate <plugin_name>_\n\n_Installed plugins:_\n`;
        plugins.forEach((p, i) => {
          txt += `_${i + 1}. ${p.name}_\n`;
        });
        return m.reply(txt);
      }

      const plugin = findPlugin(text);
      if (!plugin) {
        let txt = `_Plugin "${text}" not found_\n\n_Installed plugins:_\n`;
        plugins.forEach((p, i) => {
          txt += `_${i + 1}. ${p.name}_\n`;
        });
        return m.reply(txt);
      }

      const status = await m.reply(`_Updating ${plugin.name}..._`);

      try {
        const rUrl = await rawUrl(plugin.url);
        const res = await axios.get(rUrl, { timeout: 15000 });
        const code = res.data;

        await sock.sendMessage(m.chat, { text: '_Validating..._', edit: status.key });

        const v = validate(code);
        if (!v.ok) {
          return sock.sendMessage(m.chat, {
            text: `_Update failed_\n_Error: ${v.err}_`,
            edit: status.key,
          });
        }

        // Remove old file
        const oldPath = path.join(EXT_DIR, plugin.filename);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

        // Save new file
        const filename = makeFilename(v.cmds);
        const newPath = path.join(EXT_DIR, filename);
        fs.writeFileSync(newPath, code, 'utf8');

        // Update database
        removeDB(plugin.name);
        addDB(v.cmds[0], plugin.url, filename);

        const reloaded = hotReload();

        return sock.sendMessage(m.chat, {
          text: `_Updated: ${v.cmds[0]}_\n${reloaded ? '_Reloaded instantly_' : '_Restart to complete_'}`,
          edit: status.key,
        });

      } catch (e) {
        return sock.sendMessage(m.chat, {
          text: `_Update failed_\n_${e.message}_`,
          edit: status.key,
        });
      }
    }
  },
};