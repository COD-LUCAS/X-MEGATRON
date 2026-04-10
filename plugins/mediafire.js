const axios = require("axios");
const cheerio = require("cheerio");

const MF_REGEX = /https?:\/\/(www\.)?mediafire\.com\/(file|folder)\/[^\s]+/i;

module.exports = {
  name: "mediafire",
  command: ["mediafire", "mf"],
  category: "downloader",

  async execute(sock, m, args) {
    try {
      const input = m.quoted?.text || args.join(" ");
      if (!input) return m.reply("Give MediaFire URL");

      const match = input.match(MF_REGEX);
      if (!match) return m.reply("Invalid MediaFire link");

      await downloadMF(sock, m, match[0]);

    } catch (e) {
      console.log("CMD error:", e.message);
      m.reply("Error processing MediaFire link");
    }
  },

  async auto(sock, m) {
    try {
      if (!m.text) return;

      const match = m.text.match(MF_REGEX);
      if (!match) return;

      await downloadMF(sock, m, match[0]);

    } catch {}
  }
};

async function downloadMF(sock, m, url) {
  const react = async (emoji) => {
    try {
      await sock.sendMessage(m.chat, {
        react: { text: emoji, key: m.key }
      });
    } catch {}
  };

  try {
    await react("⏳");

    // ✅ FIX 1: use axios instead of fetch + headers
    const res = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const $ = cheerio.load(res.data);

    // ✅ FIX 2: safer selector
    const download = $("a#downloadButton").attr("href");

    if (!download) {
      await react("❌");
      return m.reply("Download link not found");
    }

    // ✅ FIX 3: proper ID extraction
    const idMatch = url.match(/mediafire\.com\/file\/([^\/]+)/);
    const id = idMatch ? idMatch[1] : null;

    let filename = "file";
    let size = "Unknown";

    if (id) {
      const infoRes = await axios.get(
        `https://www.mediafire.com/api/1.5/file/get_info.php?response_format=json&quick_key=${id}`
      );

      if (infoRes.data.response.result === "Success") {
        const file = infoRes.data.response.file_info;
        filename = file.filename;
        size = formatBytes(file.size);
      }
    }

    await sock.sendMessage(
      m.chat,
      {
        document: { url: download },
        fileName: filename,
        caption: `💌 ${filename}\n📊 ${size}`
      },
      { quoted: m }
    );

    await react("✅");

  } catch (e) {
    console.log("MediaFire error:", e.message);
    await react("❌");
    m.reply("Failed to download MediaFire file");
  }
}

function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}