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
    .map(l => {
      const parts = l.split('|');
      return { name: parts[0], url: parts[1], filename: parts[2] };
    });
};

const writeDB = (list) => {
  fs.writeFileSync(DB_FILE,
    list.map(p => `${p.name}|${p.url}|${p.filename}`).join('\n') +
    (list.length ? '\n' : '')
  );
};

const addDB    = (name, url, filename) => {
  ensureDirs();
  fs.appendFileSync(DB_FILE, `${name}|${url}|${filename}\n`);
};
const removeDB = (name) => writeDB(readDB().filter(p => p.name !== name));

// Find plugin loosely — by name, command, or filename
const findPlugin = (query) => {
  const q = query.toLowerCase().trim();
  return readDB().find(p =>
    (p.name  || '').toLowerCase().includes(q) ||
    (p.filename || '').toLowerCase().replace('.js','').includes(q)
  );
};

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
    return { ok: true, cmds };
  } catch (e) {
    return { ok: false, err: e.message };
  }
};

const makeFilename = (cmds) => `${cmds[0].replace(/[^a-z0-9_-]/gi, '')}.js`;

const hotReload = () => {
  try { if (global.pluginLoader?.reload) { global.pluginLoader.reload(); return true; } } catch (_) {}
  return false;
};

module.exports = {
  command: ['install', 'plugins', 'remove', 'plugin', 'gistupdate'],
  category: 'owner',
  desc: 'Install and manage external plugins',
  usage: '.install <url> | .plugins | .remove <name> | .plugin <name> | .gistupdate <name>',

  // NO owner:true here — we handle it manually so non-owners get a reply
  async execute(sock, m, context) {
    const { command, text, isOwner, prefix } = context;
    ensureDirs();

    // ── PLUGINS LIST — everyone can see ──────────────────────
    if (command === 'plugins') {
      const list = readDB();
      if (!list.length) return m.reply('_No external plugins installed_');
      let txt = `*EXTERNAL PLUGINS* — ${list.length}\n\n`;
      list.forEach((p, i) => { txt += `${i + 1}. *${p.name}*\n`; });
      return m.reply(txt);
    }

    // ── Owner check for all other commands ───────────────────
    if (!isOwner) return;

    // ── INSTALL ──────────────────────────────────────────────
    if (command === 'install') {
      if (!text) return m.reply(`_Usage: ${prefix}install <github/gist url>_`);

      const status = await m.reply('_⬇️ Downloading..._');
      try {
        const rUrl = await rawUrl(text.trim());
        const code = (await axios.get(rUrl, { timeout: 15000 })).data;

        await sock.sendMessage(m.chat, { text: '_🔍 Validating..._', edit: status.key });

        const v = validate(code);
        if (!v.ok) {
          return sock.sendMessage(m.chat, {
            text: `_❌ Invalid plugin_\n_${v.err}_`,
            edit: status.key,
          });
        }

        const filename   = makeFilename(v.cmds);
        const pluginPath = path.join(EXT_DIR, filename);
        fs.writeFileSync(pluginPath, code, 'utf8');

        const existing = readDB().find(p => p.name === v.cmds[0]);
        if (existing) removeDB(v.cmds[0]);
        addDB(v.cmds[0], text.trim(), filename);

        hotReload();

        return sock.sendMessage(m.chat, {
          text: `✅ *${v.cmds.join(', ')}* installed\n_Active now — no restart needed ✓_`,
          edit: status.key,
        });

      } catch (e) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Failed: ${e.message}_`,
          edit: status.key,
        });
      }
    }

    // ── REMOVE ───────────────────────────────────────────────
    if (command === 'remove') {
      if (!text) {
        const list = readDB();
        if (!list.length) return m.reply('_No external plugins installed_');
        let txt = `_Usage: ${prefix}remove <name>_\n\n*Installed plugins:*\n`;
        list.forEach((p, i) => { txt += `${i + 1}. ${p.name}\n`; });
        return m.reply(txt);
      }

      const plugin = findPlugin(text);
      if (!plugin) {
        const list = readDB();
        let txt = `_Plugin "${text}" not found_\n\n*Installed:*\n`;
        list.forEach((p, i) => { txt += `${i + 1}. ${p.name}\n`; });
        return m.reply(list.length ? txt : `_Plugin "${text}" not found — no plugins installed_`);
      }

      const fp = path.join(EXT_DIR, plugin.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      removeDB(plugin.name);
      hotReload();

      return m.reply(`_✅ *${plugin.name}* removed — no restart needed ✓_`);
    }

    // ── PLUGIN INFO ──────────────────────────────────────────
    if (command === 'plugin') {
      if (!text) return m.reply(`_Usage: ${prefix}plugin <name>_`);
      const plugin = findPlugin(text);
      if (!plugin) return m.reply('_Plugin not found_');
      return m.reply(`*Plugin:* ${plugin.name}\n*URL:* ${plugin.url}`);
    }

    // ── GIST UPDATE ──────────────────────────────────────────
    if (command === 'gistupdate') {
      if (!text) return m.reply(`_Usage: ${prefix}gistupdate <name>_`);

      const plugin = findPlugin(text);
      if (!plugin) return m.reply('_Plugin not found_');

      const status = await m.reply(`_🔄 Updating ${plugin.name}..._`);
      try {
        const rUrl = await rawUrl(plugin.url);
        const code = (await axios.get(rUrl, { timeout: 15000 })).data;

        await sock.sendMessage(m.chat, { text: '_🔍 Validating..._', edit: status.key });

        const v = validate(code);
        if (!v.ok) {
          return sock.sendMessage(m.chat, {
            text: `_❌ Update failed: ${v.err}_`,
            edit: status.key,
          });
        }

        const fp = path.join(EXT_DIR, plugin.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);

        const filename = makeFilename(v.cmds);
        fs.writeFileSync(path.join(EXT_DIR, filename), code, 'utf8');

        removeDB(plugin.name);
        addDB(v.cmds[0], plugin.url, filename);
        hotReload();

        return sock.sendMessage(m.chat, {
          text: `✅ *${v.cmds.join(', ')}* updated\n_Active now — no restart needed ✓_`,
          edit: status.key,
        });

      } catch (e) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Failed: ${e.message}_`,
          edit: status.key,
        });
      }
    }
  },
};
