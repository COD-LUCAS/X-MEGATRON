
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
  const filtered = plugins.filter(p => p.name !== name);
  filtered.push({ name, url, filename });
  
  const content = filtered.map(p => `${p.name}|${p.url}|${p.filename}`).join('\n');
  fs.writeFileSync(DB_FILE, content + (content ? '\n' : ''));
};

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

// Convert ES Module to CommonJS
const convertToCommonJS = (code) => {
  let converted = code;
  
  // Add missing requires for common globals
  if (converted.includes('__dirname') && !converted.includes('path = require')) {
    converted = "const path = require('path');\n" + converted;
  }
  if (converted.includes('__filename') && !converted.includes('path = require')) {
    converted = "const path = require('path');\n" + converted;
  }
  if (converted.includes('fs.') && !converted.includes('fs = require')) {
    converted = "const fs = require('fs');\n" + converted;
  }
  if (converted.includes('axios.') && !converted.includes('axios = require')) {
    converted = "const axios = require('axios');\n" + converted;
  }
  
  // Convert export default
  converted = converted.replace(/export\s+default\s+{/g, 'module.exports = {');
  converted = converted.replace(/export\s+default\s+/g, 'module.exports = ');
  converted = converted.replace(/export\s+const/g, 'const');
  converted = converted.replace(/export\s+function/g, 'function');
  
  // Convert import statements
  converted = converted.replace(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g, (match, imports, module) => {
    const vars = imports.split(',').map(i => i.trim());
    const requires = vars.map(v => `const ${v} = require('${module}').${v};`).join('\n');
    return requires;
  });
  
  converted = converted.replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require(\'$2\');');
  
  // Fix __dirname and __filename
  converted = converted.replace(/__dirname/g, '__dirname');
  converted = converted.replace(/__filename/g, '__filename');
  
  return converted;
};

// Validate and convert plugin
const processPlugin = (code) => {
  try {
    let finalCode = code;
    let pluginName = 'listener';
    let isESModule = false;
    
    // Check if it's ES Module
    if (code.includes('import ') || code.includes('export default') || code.includes('export {')) {
      isESModule = true;
      finalCode = convertToCommonJS(code);
    }
    
    // Extract plugin name
    const nameMatch = finalCode.match(/command:\s*\[['"](.+?)['"]\]/);
    if (nameMatch) {
      pluginName = nameMatch[1];
    } else {
      const cmdMatch = finalCode.match(/command:\s*['"](.+?)['"]/);
      if (cmdMatch) pluginName = cmdMatch[1];
    }
    
    // Validate final code
    if (!finalCode.includes('module.exports')) {
      throw new Error('Missing module.exports');
    }
    
    // Test execute the plugin
    const mod = { exports: {} };
    const wrappedFunc = new Function('module', 'exports', 'require', finalCode);
    wrappedFunc(mod, mod.exports, require);
    const p = mod.exports;
    
    if (!p.command && !p.onText) {
      throw new Error('Missing command or onText');
    }
    
    return { ok: true, name: pluginName, code: finalCode };
  } catch (e) {
    return { ok: false, err: e.message };
  }
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
  category: 'owner',
  desc: 'Install and manage external plugins',
  usage: '.install <url> | .plugins | .remove <name>',

  async execute(sock, m, context) {
    const { command, text, isOwner, prefix } = context;
    
    if (!isOwner) return;

    // INSTALL PLUGIN
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

        await sock.sendMessage(m.chat, { text: '_Processing..._', edit: status.key });

        const result = processPlugin(originalCode);
        
        if (!result.ok) {
          return sock.sendMessage(m.chat, {
            text: `_${result.err}_`,
            edit: status.key,
          });
        }

        const pluginName = result.name;
        const filename = `${pluginName}.js`;
        const filepath = path.join(EXT_DIR, filename);

        // Remove old if exists
        const existing = getPlugins().find(p => p.name === pluginName);
        if (existing) {
          const oldPath = path.join(EXT_DIR, existing.filename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        // Save new plugin
        fs.writeFileSync(filepath, result.code, 'utf8');
        savePlugin(pluginName, url, filename);

        const reloaded = reloadPlugins();

        await sock.sendMessage(m.chat, {
          text: `_Installed: ${pluginName}_`,
          edit: status.key,
        });

      } catch (err) {
        await sock.sendMessage(m.chat, {
          text: `_${err.message}_`,
          edit: status.key,
        });
      }
    }

    // LIST PLUGINS
    if (command === 'plugins') {
      const plugins = getPlugins();
      
      if (plugins.length === 0) {
        return m.reply('_No plugins installed_');
      }
      
      let msg = `_Installed (${plugins.length})_\n\n`;
      plugins.forEach((p, i) => {
        msg += `_${i + 1}. ${p.name}_\n`;
      });
      msg += `\n_Use ${prefix}remove <name> to remove_`;
      
      return m.reply(msg);
    }

    // REMOVE PLUGIN
    if (command === 'remove') {
      const plugins = getPlugins();
      
      if (plugins.length === 0) {
        return m.reply('_No plugins installed_');
      }
      
      if (!text) {
        let msg = `_Remove a plugin_\n\n_Usage: ${prefix}remove <name>_\n\n_Installed:_\n`;
        plugins.forEach((p, i) => {
          msg += `_${i + 1}. ${p.name}_\n`;
        });
        return m.reply(msg);
      }
      
      const searchName = text.trim();
      
      let target = plugins.find(p => p.name === searchName);
      if (!target) {
        target = plugins.find(p => p.name.toLowerCase() === searchName.toLowerCase());
      }
      
      if (!target) {
        let msg = `_"${searchName}" not found_\n\n_Installed:_\n`;
        plugins.forEach((p, i) => {
          msg += `_${i + 1}. ${p.name}_\n`;
        });
        return m.reply(msg);
      }
      
      const filepath = path.join(EXT_DIR, target.filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      
      deletePlugin(target.name);
      
      const reloaded = reloadPlugins();
      
      return m.reply(`_Removed: ${target.name}_`);
    }
  }
};