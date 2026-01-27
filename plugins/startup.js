const fs = require("fs");
const path = require("path");

module.exports = {
  async execute(sock) {
    try {
      const pluginDir = path.join(__dirname);
      const pluginCount = fs
        .readdirSync(pluginDir)
        .filter(f => f.endsWith(".js") && f !== "startup.js")
        .length;

      const mode = (process.env.MODE || "public").toUpperCase();
      const prefix = process.env.PREFIX || ".";

      const text = `
_*𝚾 𝚳𝚵𝐆𝚫𝚻𝚪𝚯𝚴*_

_Status  : Online_
_Mode    : ${mode}_
_Prefix  : ${prefix}_
_Plugins : ${pluginCount}_
      `.trim();

      const ownerJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

      await sock.sendMessage(ownerJid, { text });

    } catch {
      // silent fail (no startup noise)
    }
  }
};