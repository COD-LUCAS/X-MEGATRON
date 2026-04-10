const cheerio = require("cheerio");

const MF_REGEX = /https?:\/\/(www\.)?mediafire\.com\/(file|folder)\/[^\s]+/i;

module.exports = {
  name: "mediafire",
  command: ["mediafire", "mf"],
  category: "downloader",

  async execute(sock, m, args) {
    const input = m.quoted?.text || args.join(" ");
    if (!input) return m.reply("Give MediaFire URL");

    const match = input.match(MF_REGEX);
    if (!match) return m.reply("Invalid MediaFire link");

    await downloadMF(sock, m, match[0]);
  },

  async auto(sock, m) {
    try {
      if (!m.text) return;

      const match = m.text.match(MF_REGEX);
      if (!match) return; // 🔥 IMPORTANT: stop here if no link

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

    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    const download = $("a#downloadButton").attr("href");
    if (!download) {
      await react("❌");
      return;
    }

    const idMatch = url.match(/mediafire\.com\/file\/([^\/]+)/);
    const id = idMatch ? idMatch[1] : null;

    let filename = "file";
    let size = "Unknown";

    if (id) {
      const infoRes = await fetch(
        `https://www.mediafire.com/api/1.5/file/get_info.php?response_format=json&quick_key=${id}`
      );
      const json = await infoRes.json();

      if (json.response.result === "Success") {
        const file = json.response.file_info;
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

  } catch {
    await react("❌");
  }
}

function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}