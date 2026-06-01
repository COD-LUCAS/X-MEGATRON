const fs = require("fs");
const path = require("path");

module.exports = {
  async execute(sock) {
    try {
      const pluginDir = path.join(__dirname);
      const files = fs.readdirSync(pluginDir).filter(f => f.endsWith(".js") && f !== "startup.js");
      const pluginCount = files.length;
      
      // Count total commands
      let commandCount = 0;
      for (const file of files) {
        try {
          const plugin = require(path.join(pluginDir, file));
          if (plugin.command) {
            const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
            commandCount += cmds.length;
          }
        } catch (_) {}
      }

      const mode = (process.env.MODE || "public").toUpperCase();
      const prefix = process.env.PREFIX || ".";

      const text = `
*𐍇 - 𐌼𐌴𐌾𐌰𐍄𐍂𐍈𐍀*

```DEVELOPER``` :-  ```COD-LUCAS```

_Status  : Online_
_Mode    : ${mode}_
_Prefix  : ${prefix}_
_Plugins : ${pluginCount}_
_Commands: ${commandCount}_
      `.trim();

      const ownerJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

      await sock.sendMessage(ownerJid, { text });

    } catch {
      // silent fail (no startup noise)
    }
  }
};