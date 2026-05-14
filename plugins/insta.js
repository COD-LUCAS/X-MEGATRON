const axios = require("axios");

module.exports = {
  command: ["insta"],

  async execute(sock, m, { args }) {
    const url = args[0];

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

    if (!url || !url.includes("instagram.com")) {
      await sock.sendMessage(
        m.chat,
        { text: "❌ Please provide a valid Instagram URL.\nExample: .insta https://www.instagram.com/reel/ABC123/" },
        { quoted: m }
      );
      return;
    }

    try {
      await react("⏳");

      const res = await axios.get(
        "https://lucas-insta-api.onrender.com/insta",
        {
          params: { url },
          headers: { "Content-Type": "application/json" }
        }
      );

      const data = res.data;

      if (!data || !data.status || !data.media) {
        console.log("Insta API error:", data?.message);
        await react("❌");
        await sock.sendMessage(
          m.chat,
          { text: "❌ Failed to fetch media. Make sure the link is valid and public." },
          { quoted: m }
        );
        return;
      }

      if (data.type === "video") {
        await sock.sendMessage(
          m.chat,
          { video: { url: data.media } },
          { quoted: m }
        );
      } else {
        await sock.sendMessage(
          m.chat,
          { image: { url: data.media } },
          { quoted: m }
        );
      }

      await react("✅");

    } catch (e) {
      console.log("Insta error:", e.message);
      await react("❌");
      await sock.sendMessage(
        m.chat,
        { text: "❌ Something went wrong. Try again later." },
        { quoted: m }
      );
    }
  }
};