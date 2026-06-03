const fs = require("fs");
const path = require("path");
const os = require("os");

const PLUGIN_DIR = __dirname;
const EXT_PLUGIN_DIR = path.join(__dirname, "..", "database", "external_plugins");
const DB_DIR = path.join(__dirname, "..", "database");
const SETTINGS_FILE = path.join(DB_DIR, "settings.json");

let settings = {
  botName: "𐍇 - 𐌼𐌴𐌾𐌰𐍄𐍂𐍈𐍀",
  menuImage: "https://files.catbox.moe/a6pqf1.jpg",
  owner: "COD-LUCAS"
};

try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    settings = { ...settings, ...saved };
  } else {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  }
} catch (e) {}

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

function buildMenuCache() {
  const categories = {};
  const pluginDirs = [PLUGIN_DIR, EXT_PLUGIN_DIR];

  for (const dir of pluginDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js") && f !== "menu.js");

    for (const file of files) {
      try {
        delete require.cache[require.resolve(path.join(dir, file))];
        const plugin = require(path.join(dir, file));
        if (!plugin?.command) continue;
        const category = (plugin.category || "basic").toUpperCase();
        if (!categories[category]) categories[category] = [];
        const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
        cmds.forEach(cmd => categories[category].push(cmd));
      } catch (e) {}
    }
  }
  return categories;
}

const getTotalCommands = () => {
  let count = 0;
  const pluginDirs = [PLUGIN_DIR, EXT_PLUGIN_DIR];
  for (const dir of pluginDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js") && f !== "menu.js");
    for (const file of files) {
      try {
        const plugin = require(path.join(dir, file));
        if (plugin?.command) {
          const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
          count += cmds.length;
        }
      } catch (e) {}
    }
  }
  return count;
};

module.exports = {
  command: ["menu", "help"],
  category: "misc",

  async execute(sock, m, context) {
    try {
      const prefix = context.prefix || ".";
      const mode = (process.env.MODE || "public").toUpperCase();
      const userName = m.pushName ? m.pushName.replace(/[\r\n]+/gm, "") : m.sender.split('@')[0];

      const botName   = settings.botName;
      const owner     = settings.owner;
      const uptime    = formatUptime(process.uptime());
      const server    = os.platform().toUpperCase();
      const freeMem   = formatBytes(os.freemem());
      const totalCmds = getTotalCommands();

      const totalPlugins = (() => {
        let count = 0;
        const dirs = [PLUGIN_DIR, EXT_PLUGIN_DIR];
        for (const dir of dirs) {
          if (fs.existsSync(dir)) {
            count += fs.readdirSync(dir).filter(f => f.endsWith(".js") && f !== "menu.js").length;
          }
        }
        return count;
      })();

      let version = "unknown";
      try {
        const vFile = path.join(__dirname, "..", "version.json");
        if (fs.existsSync(vFile)) {
          const v = JSON.parse(fs.readFileSync(vFile, "utf8"));
          version = v.version || version;
        }
      } catch {}

      // ── Header ────────────────────────────────────────────────────
      let text = `*${botName}*\n`;
      text += `\`\`\`\n`;
      text += `PREFIX   : ${prefix}\n`;
      text += `MODE     : ${mode}\n`;
      text += `OWNER    : ${owner}\n`;
      text += `USER     : ${userName}\n`;
      text += `SERVER   : ${server}\n`;
      text += `RAM      : ${freeMem}\n`;
      text += `VERSION  : ${version}\n`;
      text += `UPTIME   : ${uptime}\n`;
      text += `PLUGINS  : ${totalPlugins}\n`;
      text += `COMMANDS : ${totalCmds}\n`;
      text += `\`\`\`\n\n`;

      // ── Categories ────────────────────────────────────────────────
      const CACHED_MENU = buildMenuCache();

      for (const cat of Object.keys(CACHED_MENU).sort()) {
        const cmds = CACHED_MENU[cat];
        text += `*[ ${cat} ]*\n`;
        text += `\`\`\`\n`;
        cmds.forEach((cmd, i) => {
          text += `${String(i + 1).padStart(2, '0')}. ${prefix}${cmd}\n`;
        });
        text += `\`\`\`\n\n`;
      }

      // ── Image ─────────────────────────────────────────────────────
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

      await sock.sendMessage(m.chat, { image: imageBuffer, caption: text }, { quoted: m });

    } catch (e) {
      console.error("Menu error:", e);
      await m.reply("_Failed to load menu_");
    }
  }
};
