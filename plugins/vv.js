const { downloadContentFromMessage } = require("@whiskeysockets/baileys")

const extractTarget = (text) => {
  if (!text) return null
  const t = text.trim()
  if (!t) return null
  if (t.includes("@")) return t
  return null
}

module.exports = {
  command: ["vv"],
  category: "owner",
  desc: "Reveal view once media (optionally send to jid/lid)",
  usage: ".vv (reply) | .vv @jid/@lid (reply)",
  owner: true,
  sudo: true,

  async execute(sock, m, context) {

    if (!context.isOwner && !context.isSudo) return
    if (!m.quoted) return context.reply("_Reply to media_")

    const target = extractTarget(context.text) || m.chat

    let q =
      m.quoted.message ||
      m.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
      {}

    const wrap = ["viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension"]
      .find(k => q[k])

    if (wrap) q = q[wrap].message

    const media =
      q.imageMessage ? "imageMessage" :
      q.videoMessage ? "videoMessage" :
      q.audioMessage ? "audioMessage" :
      null

    if (!media) return context.reply("_Unsupported media_")

    try {
      const msg = q[media]
      const stream = await downloadContentFromMessage(msg, media.replace("Message", ""))
      let buffer = Buffer.from([])

      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
      }

      if (media === "imageMessage")
        return sock.sendMessage(target, { image: buffer }, { quoted: m })

      if (media === "videoMessage")
        return sock.sendMessage(target, { video: buffer }, { quoted: m })

      if (media === "audioMessage")
        return sock.sendMessage(target, { audio: buffer, mimetype: "audio/mpeg" }, { quoted: m })

    } catch (e) {
      console.log("VV ERROR:", e)
      return context.reply("_Failed_")
    }
  }
}
