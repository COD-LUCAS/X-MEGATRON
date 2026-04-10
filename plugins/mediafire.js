const cheerio = require("cheerio");

const MF_REGEX = /https?:\/\/(www\.)?mediafire\.com\/(file|folder)\/[^\s]+/i;

module.exports = {
  name: "mediafire",
  command: ["mediafire", "mf"],
  category: "downloader",
  onText: true,

  async execute(sock, m, args) {
    const url = args[0];
    if (!url) return m.reply("Give MediaFire URL");

    if (!MF_REGEX.test(url)) return m.reply("Invalid MediaFire link");

    await downloadMF(sock, m, url);
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

    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    const download = $("a#downloadButton").attr("href");
    if (!download) {
      await react("❌");
      return m.reply("Failed to fetch download link");
    }

    const id = url.split("/")[4];

    const infoRes = await fetch(
      `https://www.mediafire.com/api/1.5/file/get_info.php?response_format=json&quick_key=${id}`
    );
    const json = await infoRes.json();

    if (json.response.result !== "Success") {
      await react("❌");
      return m.reply("Failed to fetch file info");
    }

    const file = json.response.file_info;

    const caption = `💌 Name: ${file.filename}
📊 Size: ${formatBytes(file.size)}
📦 Type: ${file.filetype}`;

    await m.reply(caption);

    await sock.sendMessage(
      m.chat,
      {
        document: { url: download },
        fileName: file.filename,
        mimetype: file.mimetype || "application/octet-stream"
      },
      { quoted: m }
    );

    await react("✅");

  } catch (e) {
    console.log("MediaFire error:", e.message);
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