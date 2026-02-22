const fs = require("fs");
const path = require("path");

const PLUGIN_DIR = __dirname;
const DEFAULT_MENU_IMAGE = "https://i.ibb.co/JFWLfqnY/temp.jpg";

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

  async execute(sock, m, { reply, prefix = ".", isOwner }) {
    try {
      const realPrefix = prefix || ".";
      const mode = (process.env.MODE || "public").toUpperCase();
      const ownerName = process.env.OWNER || "COD-LUCAS";
      const menuImage = process.env.MENU_IMG || DEFAULT_MENU_IMAGE;

      if (!CACHED_MENU) {
        CACHED_MENU = buildMenuCache(realPrefix);
      }

      let version = "unknown";
      try {
        const v = require("../version.json");
        version = v.version || version;
      } catch {}

      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const mnt = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);

      let text = `*𝚾 𝚳𝚵𝐆𝚫𝚻𝚪𝚯𝚴*\n`;
      text += `────────────────────\n\n`;
      text += `*PREFIX*  : ${realPrefix}\n`;
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

      await sock.sendMessage(
        m.chat,
        {
          image: { url: menuImage },
          caption: text
        },
        { quoted: m }
      );

    } catch (e) {
      reply("Failed to load menu");
    }
  }
};