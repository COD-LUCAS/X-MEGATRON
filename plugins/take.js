const { Sticker } = require("wa-sticker-formatter");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

async function getQuotedMessage(m) {
  const ctx = m.message?.extendedTextMessage?.contextInfo;
  if (!ctx || !ctx.quotedMessage) return null;
  return ctx.quotedMessage;
}

async function getStickerBuffer(msg) {
  if (!msg.stickerMessage) return null;
  const stream = await downloadContentFromMessage(msg.stickerMessage, "sticker");
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return buffer;
}

module.exports = {
  command: ["take", "steal"],
  category: "converter",
  desc: "Change sticker packname and author",
  usage: ".take <packname> or .take <packname>;<author>",
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, { reply, args }) {
    try {
      const quotedMsg = await getQuotedMessage(m);
      
      if (!quotedMsg)
        return reply("❌ Reply to a sticker");

      if (!quotedMsg.stickerMessage)
        return reply("❌ Reply to a sticker with .take <packname>");

      const input = args.join(" ");
      
      if (!input)
        return reply(
          "❌ Usage:\n.take <packname>\n.take <packname>;<author>"
        );

      const parts = input.split(";");
      const newPackname = parts[0].trim();
      const newAuthor = parts[1] ? parts[1].trim() : "";

      const buffer = await getStickerBuffer(quotedMsg);
      if (!buffer) return reply("❌ Failed to read sticker");

      const sticker = new Sticker(buffer, {
        pack: newPackname,
        author: newAuthor,
        quality: 80,
        type: "full"
      });

      const out = await sticker.toBuffer();

      await sock.sendMessage(
        m.chat,
        { sticker: out },
        { quoted: m }
      );

    } catch (e) {
      console.error("Take plugin error:", e);
      reply("❌ Failed to change sticker packname");
    }
  }
};