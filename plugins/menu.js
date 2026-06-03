const fs = require("fs");
const path = require("path");
const os = require("os");

const PLUGIN_DIR = __dirname;
const EXT_PLUGIN_DIR = path.join(__dirname, "..", "database", "external_plugins");
const DB_DIR = path.join(__dirname, "..", "database");
const SETTINGS_FILE = path.join(DB_DIR, "settings.json");

// Default settings
let settings = {
  botName: "𐍇 - 𐌼𐌴𐌾𐌰𐍄𐍂𐍈𐍀",
  menuImage: "https://files.catbox.moe/a6pqf1.jpg",
  owner: "COD-LUCAS"
};

// Load settings
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    settings = { ...settings, ...saved };
  } else {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  }
} catch (e) {}

// Track plugin file count to detect changes
let lastPluginCount = 0;
let lastExternalPluginsCount = 0;

function formatBytes(bytes) {
  const gb = (bytes / (1024 ** 3)).toFixed(2);
  return `${gb} GB`;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Check if plugins have changed
function havePluginsChanged() {
  let currentCount = 0;
  const pluginsDir = PLUGIN_DIR;
  if (fs.existsSync(pluginsDir)) {
    currentCount = fs.readdirSync(pluginsDir).filter(f => f.endsWith(".js") && f !== "menu.js").length;
  }
  
  let externalCount = 0;
  if (fs.existsSync(EXT_PLUGIN_DIR)) {
    externalCount = fs.readdirSync(EXT_PLUGIN_DIR).filter(f => f.endsWith(".js")).length;
  }
  
  const changed = (currentCount !== lastPluginCount) || (externalCount !== lastExternalPluginsCount);
  
  if (changed) {
    lastPluginCount = currentCount;
    lastExternalPluginsCount = externalCount;
  }
  
  return changed;
}

// ─── CACHING SYSTEM ─────────────────────────────────────────────────
let cachedMenu = null;
let cachedTotalPlugins = null;
let cachedTotalCommands = null;
let lastCacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds cache

function refreshCache(prefix) {
  const now = Date.now();
  const pluginsChanged = havePluginsChanged();
  
  if (cachedMenu && !pluginsChanged && (now - lastCacheTime) < CACHE_TTL) {
    return;
  }

  const categories = {};
  const pluginDirs = [PLUGIN_DIR, EXT_PLUGIN_DIR];
  let pluginCount = 0;
  let commandCount = 0;

  for (const dir of pluginDirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js") && f !== "menu.js");
    pluginCount += files.length;

    for (const file of files) {
      try {
        delete require.cache[require.resolve(path.join(dir, file))];
        const plugin = require(path.join(dir, file));

        if (!plugin?.command) continue;

        const category = plugin.category || "basic";
        if (!categories[category]) categories[category] = [];

        const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
        commandCount += cmds.length;
        cmds.forEach(cmd => {
          categories[category].push(cmd);
        });
      } catch (e) {}
    }
  }

  cachedMenu = categories;
  cachedTotalPlugins = pluginCount;
  cachedTotalCommands = commandCount;
  lastCacheTime = now;
}

function buildMenuCache(prefix) {
  refreshCache(prefix);
  return cachedMenu;
}

function getTotalPlugins() {
  refreshCache();
  return cachedTotalPlugins;
}

function getTotalCommands() {
  refreshCache();
  return cachedTotalCommands;
}

module.exports = {
  command: ["menu", "help"],
  category: "misc",

  async execute(sock, m, context) {
    try {
      await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});

      const prefix = context.prefix || ".";
      const mode = (process.env.MODE || "public").toUpperCase();
      const userName = m.pushName ? m.pushName.replace(/[\r\n]+/gm, "") : m.sender.split('@')[0];

      const botName = settings.botName;
      const owner = settings.owner;
      const totalPlugins = getTotalPlugins();
      const totalCommands = getTotalCommands();
      const uptime = formatUptime(process.uptime());
      const server = os.platform().toUpperCase();
      const freeMem = formatBytes(os.freemem());

      let version = "unknown";
      try {
        const versionFile = path.join(__dirname, "..", "version.json");
        if (fs.existsSync(versionFile)) {
          const v = JSON.parse(fs.readFileSync(versionFile, "utf8"));
          version = v.version || version;
        }
      } catch {}

      // ── Full Monospace Menu ────────────────────────────────────────
      let text = `\`\`\`\n`;
      text += `${botName}\n`;
      text += `${'─'.repeat(20)}\n\n`;
      text += `PREFIX   : ${prefix}\n`;
      text += `MODE     : ${mode}\n`;
      text += `OWNER    : ${owner}\n`;
      text += `USER     : ${userName}\n`;
      text += `SERVER   : ${server}\n`;
      text += `RAM      : ${freeMem}\n`;
      text += `VERSION  : ${version}\n`;
      text += `UPTIME   : ${uptime}\n`;
      text += `PLUGINS  : ${totalPlugins}\n`;
      text += `COMMANDS : ${totalCommands}\n\n`;
      text += `${'='.repeat(20)}\n\n`;

      const CACHED_MENU = buildMenuCache(prefix);
      let counter = 1;

      for (const cat of Object.keys(CACHED_MENU)) {
        text += `[ ${cat} ]\n`;
        for (const cmd of CACHED_MENU[cat]) {
          text += `${String(counter).padStart(2, '0')}. ${prefix}${cmd}\n`;
          counter++;
        }
        text += `\n`;
      }
      text += `\`\`\``;

      // Get image from settings
      const imageUrl = settings.menuImage;
      let imageBuffer;

      if (imageUrl && imageUrl.startsWith('http')) {
        try {
          const axios = require('axios');
          const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
          imageBuffer = Buffer.from(response.data);
        } catch (e) {
          imageBuffer = { url: "https://files.catbox.moe/a6pqf1.jpg" };
        }
      } else {
        imageBuffer = { url: "https://files.catbox.moe/a6pqf1.jpg" };
      }

      await sock.sendMessage(m.chat, {
        image: imageBuffer,
        caption: text
      }, { quoted: m });

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (e) {
      console.error("Menu error:", e);
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
      await m.reply("_Failed to load menu_");
    }
  }
};