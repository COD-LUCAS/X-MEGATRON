const fs = require("fs");
const path = require("path");

const PLUGIN_DIR = __dirname;
const DEFAULT_MENU_IMAGE = path.join(__dirname, "..", "database", "img", "menu.jpg");

let CACHED_MENU = null;

function buildMenuCache(prefix) {
  const categories = {};

  const files = fs.readdirSync(PLUGIN_DIR).filter(
    f => f.endsWith(".js") && f !== "menu.js"
  );

  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(PLUGIN_DIR, file))];
      const plugin = require(path.join(PLUGIN_DIR, file));

      if (!plugin?.command) continue;

      const cmds = Array.isArray(plugin.command)
        ? plugin.command
        : [plugin.command];

      const category = plugin.category || "basic";

      if (!categories[category]) categories[category] = [];

      cmds.forEach(cmd => {
        categories[category].push(`${prefix}${cmd}`);
      });

    } catch {}
  }

  return categories;
}

module.exports = {
  command: ["menu", "help"],

  async execute(sock, m, context) {
    try {
      const prefix = context.prefix || ".";
      const isOwner = context.isOwner || false;
      const mode = (process.env.MODE || "public").toUpperCase();
      const ownerName = process.env.OWNER_NAME || process.env.OWNER || "COD-LUCAS";

      if (!CACHED_MENU) {
        CACHED_MENU = buildMenuCache(prefix);
      }

      let version = "unknown";
      try {
        const versionFile = path.join(__dirname, "..", "version.json");
        if (fs.existsSync(versionFile)) {
          const v = JSON.parse(fs.readFileSync(versionFile, "utf8"));
          version = v.version || version;
        }
      } catch {}

      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const mnt = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);

      let text = `*𝚾 𝚳𝚵𝐆𝚫𝚻𝚪𝚯𝚴*\n`;
      text += `────────────────────\n\n`;
      text += `*PREFIX*  : ${prefix}\n`;
      text += `*MODE*    : ${mode}\n`;
      text += `*OWNER*   : ${ownerName}\n`;
      text += `*VERSION* : ${version}\n`;
      text += `*UPTIME*  : ${h}:${mnt}:${s}\n\n`;
      text += `════════════════════\n\n`;

      for (const cat of Object.keys(CACHED_MENU)) {
        if (cat === "owner" && !isOwner) continue;

        text += `*${cat}:*\n`;
        text += CACHED_MENU[cat].map(c => `_${c}_`).join("\n");
        text += "\n\n";
      }

      let imageBuffer;
      if (fs.existsSync(DEFAULT_MENU_IMAGE)) {
        imageBuffer = fs.readFileSync(DEFAULT_MENU_IMAGE);
      } else {
        const fallbackUrl = "https://i.ibb.co/JFWLfqnY/temp.jpg";
        imageBuffer = { url: fallbackUrl };
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
      await m.reply("_Failed to load menu_");
    }
  }
};
