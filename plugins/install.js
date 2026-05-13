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
  return fs.readFileSync(DB_FILE, 'utf8')
    .split('\n').filter(l => l.trim())
    .map(l => { const [name, url, filename] = l.split('|'); return { name, url, filename }; });
};

const writeDB = (plugins) => {
  fs.writeFileSync(DB_FILE, plugins.map(p => `${p.name}|${p.url}|${p.filename}`).join('\n') + (plugins.length ? '\n' : ''));
};

const addDB    = (name, url, filename) => { ensureDirs(); fs.appendFileSync(DB_FILE, `${name}|${url}|${filename}\n`); };
const removeDB = (name) => writeDB(readDB().filter(p => p.name !== name));

// Resolve raw URL from GitHub/Gist links
const rawUrl = async (url) => {
  if (url.includes('gist.github.com')) {
    const id  = url.split('/').pop().split('?')[0];
    const res = await axios.get(`https://api.github.com/gists/${id}`);
    return Object.values(res.data.files)[0].raw_url;
  }
  if (url.includes('github.com') && url.includes('/blob/'))
    return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  return url;
};

// Validate plugin code — must match X-MEGATRON plugin format
const validate = (code) => {
  try {
    if (!code.includes('module.exports')) return { ok: false, err: 'Missing module.exports' };
    if (!code.includes('execute'))        return { ok: false, err: 'Missing execute function' };

    const mod = { exports: {} };
    new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
    const p = mod.exports;

    if (typeof p.execute !== 'function') return { ok: false, err: 'execute must be a function' };
    if (!p.command && !p.onText)         return { ok: false, err: 'Missing command or onText' };

    const cmds = p.command
      ? (Array.isArray(p.command) ? p.command : [p.command])
      : ['listener'];

    return { ok: true, cmds, plugin: p };
  } catch (e) {
    return { ok: false, err: e.message };
  }
};

// Save as first_command.js (e.g. "ping" → "ping.js")
const makeFilename = (cmds, url) => {
  if (cmds?.length && cmds[0] !== 'listener') {
    return `${cmds[0].replace(/[^a-z0-9_-]/gi, '')}.js`;
  }
  const parts = url.split('/');
  let name = parts[parts.length - 1].split('?')[0];
  if (!name.endsWith('.js')) name = `plugin_${Date.now()}.js`;
  return name;
};

// Hot reload — no restart needed
const hotReload = () => {
  try {
    if (global.pluginLoader?.reload) {
      global.pluginLoader.reload();
      return true;
    }
  } catch (_) {}
  return false;
};

module.exports = {
  command: ['install', 'plugins', 'remove', 'plugin', 'gistupdate'],
  category: 'owner',
  desc: 'Install and manage external plugins — no restart needed',
  usage: '.install <url> | .plugins | .remove <name> | .plugin <name> | .gistupdate <name>',
  owner: true,

  async execute(sock, m, context) {
    const { command, text } = context;
    ensureDirs();

    // ── INSTALL ───────────────────────────────────────────────
    if (command === 'install') {
      if (!text) return m.reply(
        `_Usage: ${context.prefix}install <url>_\n\n` +
        `_Supports: GitHub Gist, raw.githubusercontent.com, GitHub blob_`
      );

      const url    = text.trim();
      const status = await m.reply('_⬇️ Downloading..._');

      try {
        const rUrl = await rawUrl(url);
        const code = (await axios.get(rUrl, { timeout: 15000 })).data;

        await sock.sendMessage(m.chat, { text: '_🔍 Validating..._', edit: status.key });

        const v = validate(code);
        if (!v.ok) {
          return sock.sendMessage(m.chat, {
            text: `_❌ Invalid plugin_\n*Error:* _${v.err}_\n\n_Must follow X-MEGATRON plugin format_`,
            edit: status.key,
          });
        }

        // Save as commandname.js — not random
        const filename   = makeFilename(v.cmds, url);
        const pluginPath = path.join(EXT_DIR, filename);

        // If same file exists, overwrite (update)
        fs.writeFileSync(pluginPath, code, 'utf8');

        const cmdName = v.cmds[0];

        // Remove old DB entry if same command existed, add new
        const existing = readDB();
        const oldEntry = existing.find(p => p.name === cmdName);
        if (oldEntry) removeDB(cmdName);
        addDB(cmdName, url, filename);

        // Hot reload — works instantly, no restart needed
        const reloaded = hotReload();

        await sock.sendMessage(m.chat, {
          text:
            `_✅ Installed: *${v.cmds.join(', ')}*_\n\n` +
            (reloaded
              ? `_Plugin loaded instantly — use *${context.prefix}${cmdName}* now ✓_`
              : `_Restart bot to activate plugin_`),
          edit: status.key,
        });

      } catch (e) {
        await sock.sendMessage(m.chat, {
          text: `_❌ Install failed_\n_${e.message}_`,
          edit: status.key,
        });
      }
    }

    // ── PLUGINS LIST ──────────────────────────────────────────
    if (command === 'plugins') {
      const list = readDB();
      if (!list.length) return m.reply('_No external plugins installed_');

      let txt = `_*EXTERNAL PLUGINS* — ${list.length}_\n\n`;
      list.forEach((p, i) => {
        txt += `${i + 1}. *${p.name}*_\n_`;
      });
      txt += `_Use .plugin <name> for details_`;
      return m.reply(txt);
    }

    // ── REMOVE ────────────────────────────────────────────────
    if (command === 'remove') {
      if (!text) return m.reply(`_Usage: ${context.prefix}remove <name>_`);

      const name   = text.trim().toLowerCase();
      const plugin = readDB().find(p => p.name.toLowerCase().includes(name));
      if (!plugin) return m.reply('_Plugin not found — use .plugins to list_');

      const fp = path.join(EXT_DIR, plugin.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      removeDB(plugin.name);

      const reloaded = hotReload();
      return m.reply(
        `_✅ Removed: ${plugin.name}_\n` +
        (reloaded ? `_Unloaded instantly ✓_` : `_Restart to fully unload_`)
      );
    }

    // ── PLUGIN INFO ───────────────────────────────────────────
    if (command === 'plugin') {
      if (!text) return m.reply(`_Usage: ${context.prefix}plugin <name>_`);

      const name   = text.trim().toLowerCase();
      const plugin = readDB().find(p => p.name.toLowerCase().includes(name));
      if (!plugin) return m.reply('_Plugin not found_');

      return m.reply(
        `_*Plugin:* ${plugin.name}_\n\n` +
        `_*URL:*_\n${plugin.url}`
      );
    }

    // ── GIST UPDATE ───────────────────────────────────────────
    if (command === 'gistupdate') {
      if (!text) return m.reply(`_Usage: ${context.prefix}gistupdate <name>_`);

      const name   = text.trim().toLowerCase();
      const plugin = readDB().find(p => p.name.toLowerCase().includes(name));
      if (!plugin) return m.reply('_Plugin not found — use .plugins to list_');

      const status = await m.reply(`_🔄 Updating ${plugin.name}..._`);

      try {
        const rUrl = await rawUrl(plugin.url);
        const code = (await axios.get(rUrl, { timeout: 15000 })).data;

        await sock.sendMessage(m.chat, { text: '_🔍 Validating..._', edit: status.key });

        const v = validate(code);
        if (!v.ok) {
          return sock.sendMessage(m.chat, {
            text: `_❌ Update failed_\n*Error:* _${v.err}_`,
            edit: status.key,
          });
        }

        const fp = path.join(EXT_DIR, plugin.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);

        const filename = makeFilename(v.cmds, plugin.url);
        fs.writeFileSync(path.join(EXT_DIR, filename), code, 'utf8');

        removeDB(plugin.name);
        addDB(v.cmds[0], plugin.url, filename);

        const reloaded = hotReload();

        await sock.sendMessage(m.chat, {
          text:
            `_✅ Updated: *${v.cmds.join(', ')}*_\n` +
            (reloaded ? `_Reloaded instantly ✓_` : `_Restart to reload_`),
          edit: status.key,
        });

      } catch (e) {
        await sock.sendMessage(m.chat, {
          text: `_❌ Update failed_\n_${e.message}_`,
          edit: status.key,
        });
      }
    }
  },
};