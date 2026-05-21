'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const EXT_DIR = path.join(__dirname, '..', 'database', 'external_plugins');
const DB_FILE = path.join(__dirname, '..', 'database', 'extplugins.txt');

const ensureDirs = () => {
  if (!fs.existsSync(EXT_DIR)) fs.mkdirSync(EXT_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '');
};

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

const savePlugin = (name, url, filename) => {
  const plugins = getPlugins();
  const filtered = plugins.filter(p => p.name !== name && p.url !== url);
  filtered.push({ name, url, filename });
  
  const content = filtered.map(p => `${p.name}|${p.url}|${p.filename}`).join('\n');
  fs.writeFileSync(DB_FILE, content + (content ? '\n' : ''));
};

const deletePlugin = (identifier) => {
  const plugins = getPlugins();
  // Delete by name or URL
  const filtered = plugins.filter(p => p.name !== identifier && p.url !== identifier);
  
  if (filtered.length === 0) {
    fs.writeFileSync(DB_FILE, '');
  } else {
    const content = filtered.map(p => `${p.name}|${p.url}|${p.filename}`).join('\n');
    fs.writeFileSync(DB_FILE, content + '\n');
  }
};

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

const convertToCommonJS = (code) => {
  let converted = code;
  
  if (converted.includes('__dirname') && !converted.includes('require(\'path\')')) {
    converted = "const path = require('path');\n" + converted;
  }
  if (converted.includes('fs.') && !converted.includes('require(\'fs\')')) {
    converted = "const fs = require('fs');\n" + converted;
  }
  if (converted.includes('axios.') && !converted.includes('require(\'axios\')')) {
    converted = "const axios = require('axios');\n" + converted;
  }
  
  converted = converted.replace(/export\s+default\s+{/g, 'module.exports = {');
  converted = converted.replace(/export\s+default\s+/g, 'module.exports = ');
  converted = converted.replace(/export\s+const/g, 'const');
  converted = converted.replace(/export\s+function/g, 'function');
  
  converted = converted.replace(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g, (match, imports, module) => {
    const vars = imports.split(',').map(i => i.trim());
    const requires = vars.map(v => `const ${v} = require('${module}').${v};`).join('\n');
    return requires;
  });
  
  converted = converted.replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require(\'$2\');');
  
  return converted;
};

const processPlugin = (code) => {
  let finalCode = code;
  let pluginName = 'listener';
  
  const isESModule = code.includes('import ') || code.includes('export default') || code.includes('export {');
  
  if (isESModule) {
    finalCode = convertToCommonJS(code);
  }
  
  const nameMatch = finalCode.match(/command:\s*\[['"](.+?)['"]\]/);
  if (nameMatch) {
    pluginName = nameMatch[1];
  } else {
    const cmdMatch = finalCode.match(/command:\s*['"](.+?)['"]/);
    if (cmdMatch) pluginName = cmdMatch[1];
  }
  
  if (!finalCode.includes('module.exports')) {
    throw new Error('Invalid plugin format');
  }
  
  const mod = { exports: {} };
  const wrappedFunc = new Function('module', 'exports', 'require', finalCode);
  wrappedFunc(mod, mod.exports, require);
  const p = mod.exports;
  
  if (!p.command && !p.onText) {
    throw new Error('Missing command or onText');
  }
  
  return { ok: true, name: pluginName, code: finalCode };
};

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
  category: 'app',
  desc: 'Install and manage plugins',
  usage: '.install <url> | .plugins | .remove <name_or_url>',

  async execute(sock, m, context) {
    const { command, text, isOwner, prefix } = context;
    
    if (!isOwner) return;

    // INSTALL
    if (command === 'install') {
      if (!text) {
        return m.reply(`_Usage: ${prefix}install <url>_`);
      }

      const status = await m.reply('_Downloading..._');
      const url = text.trim();

      try {
        const rawUrl = await getRawUrl(url);
        const response = await axios.get(rawUrl, { timeout: 15000 });
        const originalCode = response.data;

        await sock.sendMessage(m.chat, { text: '_Converting..._', edit: status.key });

        const result = processPlugin(originalCode);
        
        if (!result.ok) {
          return sock.sendMessage(m.chat, {
            text: `_Failed: ${result.err}_`,
            edit: status.key,
          });
        }

        const pluginName = result.name;
        const filename = `${pluginName}.js`;
        const filepath = path.join(EXT_DIR, filename);

        const existing = getPlugins().find(p => p.name === pluginName);
        if (existing) {
          const oldPath = path.join(EXT_DIR, existing.filename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        fs.writeFileSync(filepath, result.code, 'utf8');
        savePlugin(pluginName, url, filename);
        reloadPlugins();

        await sock.sendMessage(m.chat, {
          text: `_Installed: ${pluginName}_`,
          edit: status.key,
        });

      } catch (err) {
        await sock.sendMessage(m.chat, {
          text: `_Failed: ${err.message}_`,
          edit: status.key,
        });
      }
    }

    // LIST PLUGINS - Shows name AND Gist URL
    if (command === 'plugins') {
      const plugins = getPlugins();
      
      if (plugins.length === 0) {
        return m.reply('_No plugins installed_');
      }
      
      let msg = `_📦 Installed plugins (${plugins.length})_\n\n`;
      plugins.forEach((p, i) => {
        msg += `_${i + 1}. ${p.name}_\n`;
        msg += `_   URL: ${p.url}_\n\n`;
      });
      msg += `_Use ${prefix}remove <name_or_url> to remove_`;
      
      return m.reply(msg);
    }

    // REMOVE - Works with name OR Gist URL
    if (command === 'remove') {
      const plugins = getPlugins();
      
      if (plugins.length === 0) {
        return m.reply('_No plugins installed_');
      }
      
      if (!text) {
        let msg = `_🗑 Remove a plugin_\n\n_Usage: ${prefix}remove <name_or_url>_\n\n_Installed:_\n`;
        plugins.forEach((p, i) => {
          msg += `_${i + 1}. ${p.name}_\n`;
          msg += `_   ${p.url}_\n\n`;
        });
        return m.reply(msg);
      }
      
      const identifier = text.trim();
      
      // Find by name or URL
      let target = plugins.find(p => p.name === identifier);
      if (!target) target = plugins.find(p => p.url === identifier);
      if (!target) target = plugins.find(p => p.url.includes(identifier));
      if (!target) target = plugins.find(p => p.name.toLowerCase() === identifier.toLowerCase());
      
      if (!target) {
        let msg = `_"${identifier}" not found_\n\n_Installed:_\n`;
        plugins.forEach((p, i) => {
          msg += `_${i + 1}. ${p.name}_\n`;
        });
        return m.reply(msg);
      }
      
      // Delete the file
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
      
      reloadPlugins();
      
      return m.reply(`_Removed: ${target.name}_\n_URL: ${target.url}_`);
    }
  }
};