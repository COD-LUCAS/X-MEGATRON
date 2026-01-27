const axios = require("axios");

const IG_REGEX = /https?:\/\/(www\.)?instagram\.com\/[^\s]+/i;

module.exports = {
  onText: true,

  async execute(sock, m) {
    const text =
      m.mtype === "conversation"
        ? m.message.conversation
        : m.mtype === "extendedTextMessage"
        ? m.message.extendedTextMessage.text
        : "";

    if (!text) return;

    const match = text.match(IG_REGEX);
    if (!match) return;

    const url = match[0];

    const react = async (emoji) => {
      try {
        await sock.sendMessage(m.chat, {
          react: {
            text: emoji,
            key: m.key
          }
        });
      } catch {}
    };

    try {
      await react("⏳");

      const res = await axios.get(
        `https://api.sparky.biz.id/api/downloader/igdl?url=${encodeURIComponent(
          url
        )}`
      );

      if (!res.data?.status || !res.data.data?.length) {
        await react("❌");
        return;
      }

      for (const media of res.data.data) {
        await sock.sendMessage(
          m.chat,
          media.type === "image"
            ? { image: { url: media.url } }
            : { video: { url: media.url } },
          { quoted: m }
        );
      }

      await react("✅");

    } catch (e) {
      console.log("AutoInsta error:", e.message);
      await react("❌");
    }
  }
};