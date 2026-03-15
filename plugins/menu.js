const fs = require("fs");
const path = require("path");
const os = require("os");

const PLUGIN_DIR = __dirname;
const EXT_PLUGIN_DIR = path.join(__dirname, "..", "database", "external_plugins");
const DEFAULT_MENU_IMAGE = path.join(__dirname, "..", "database", "img", "menu.jpg");

let CACHED_MENU = null;

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

function buildMenuCache(prefix) {
  const categories = {};

  const pluginDirs = [PLUGIN_DIR];
  if (fs.existsSync(EXT_PLUGIN_DIR)) {
    pluginDirs.push(EXT_PLUGIN_DIR);
  }

  for (const dir of pluginDirs) {
    const files = fs.readdirSync(dir).filter(
      f => f.endsWith(".js") && f !== "menu.js"
    );

    for (const file of files) {
      try {
        delete require.cache[require.resolve(path.join(dir, file))];
        const plugin = require(path.join(dir, file));

        if (!plugin?.command && !plugin?.onText) continue;

        const category = plugin.category || "basic";

        if (!categories[category]) categories[category] = [];

        if (plugin.command) {
          const cmds = Array.isArray(plugin.command)
            ? plugin.command
            : [plugin.command];

          cmds.forEach(cmd => {
            categories[category].push(`${prefix}${cmd}`);
          });
        } else if (plugin.onText) {
          categories[category].push("auto-listener");
        }

      } catch (e) {}
    }
  }

  return categories;
}

module.exports = {
  command: ["menu", "help"],
  category: "main",

  async execute(sock, m, context) {
    try {
      const prefix = context.prefix || ".";
      const mode = (process.env.MODE || "public").toUpperCase();
      const ownerName = process.env.OWNER_NAME || process.env.OWNER || "COD-LUCAS";

      // Use m.pushName directly (like the example code)
      const userName = m.pushName ? m.pushName.replace(/[\r\n]+/gm, "") : m.sender.split('@')[0];

      CACHED_MENU = buildMenuCache(prefix);

      let version = "unknown";
      try {
        const versionFile = path.join(__dirname, "..", "version.json");
        if (fs.existsSync(versionFile)) {
          const v = JSON.parse(fs.readFileSync(versionFile, "utf8"));
          version = v.version || version;
        }
      } catch {}

      const uptime = formatUptime(process.uptime());
      const server = os.platform().toUpperCase();
      const freeMem = formatBytes(os.freemem());

      let text = `*𝚾 𝚳𝚵𝐆𝚫𝚻𝚪𝚯𝚴*\n`;
      text += `────────────────────\n\n`;
      text += `*PREFIX*  : _${prefix}_\n`;
      text += `*MODE*    : _${mode}_\n`;
      text += `*OWNER*   : _${ownerName}_\n`;
      text += `*USER*    : _${userName}_\n`;
      text += `*SERVER*  : _${server}_\n`;
      text += `*RAM*     : _${freeMem}_\n`;
      text += `*VERSION* : _${version}_\n`;
      text += `*UPTIME*  : _${uptime}_\n\n`;
      text += `════════════════════\n\n`;

      let counter = 1;

      for (const cat of Object.keys(CACHED_MENU)) {
        text += `*${cat}:*\n`;
        
        for (const cmd of CACHED_MENU[cat]) {
          text += `_${counter}. ${cmd}_\n`;
          counter++;
        }
        
        text += `\n`;
      }

      let imageBuffer;
      if (fs.existsSync(DEFAULT_MENU_IMAGE)) {
        imageBuffer = fs.readFileSync(DEFAULT_MENU_IMAGE);
      } else {
        imageBuffer = { url: "https://i.ibb.co/JFWLfqnY/temp.jpg" };
      }

      await sock.sendMessage(
        m.chat,
        {
          image: imageBuffer,
          caption: text
        },
        { quoted: m }
      );

    } catch (e) {
      console.error("Menu error:", e);
      await m.reply("_Failed to load menu_");
    }
  }
};
