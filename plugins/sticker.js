const { Sticker } = require("wa-sticker-formatter");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const data = require("../data/data");

async function getQuotedMessage(m) {
  const ctx = m.message?.extendedTextMessage?.contextInfo;
  if (!ctx || !ctx.quotedMessage) return null;
  return ctx.quotedMessage;
}

async function getMediaBuffer(msg) {
  const type = Object.keys(msg)[0];
  const stream = await downloadContentFromMessage(
    msg[type],
    type.replace("Message", "")
  );
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return buffer;
}

module.exports = {
  command: ["sticker", "s"],
  category: "converter",
  desc: "Convert image or short video to sticker",
  usage: ".sticker (reply to image/video)",
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, { reply }) {
    try {
      const quotedMsg = await getQuotedMessage(m);
      if (!quotedMsg)
        return reply("❌ Reply to an image or short video");

      const mime =
        quotedMsg.imageMessage?.mimetype ||
        quotedMsg.videoMessage?.mimetype ||
        "";

      if (!/image|video/.test(mime))
        return reply("❌ Reply to an image or short video");

      if (
        quotedMsg.videoMessage &&
        quotedMsg.videoMessage.seconds > 10
      ) {
        return reply("❌ Video must be under 10 seconds");
      }

      const buffer = await getMediaBuffer(quotedMsg);
      if (!buffer) return reply("❌ Failed to read media");

      const sticker = new Sticker(buffer, {
        pack: data.STICKER.PACKNAME,
        author: m.pushName || "User",
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
      console.error("Sticker plugin error:", e);
      reply("❌ Failed to create sticker");
    }
  }
};