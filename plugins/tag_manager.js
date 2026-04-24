module.exports = {
  command: ["tag", "tagall", "tagadmin"],
  category: "group",
  desc: "Tag members / admins / all",
  usage:
    ".tag <text>\n.tag (reply)\n.tagall\n.tagadmin\n.tag <groupid>",

  group: true,

  async execute(sock, m, context) {
    const { args, text, reply, isAdmin, isOwner, prefix } = context

    // =======================
    // PERMISSION
    // =======================
    if (!(isOwner || isAdmin)) return

    // =======================
    // SHOW HELP IF EMPTY
    // =======================
    if (context.command === "tag" && !text && !m.quoted) {
      return reply(
        `_*Tag Usage*_\n\n` +
        `${prefix}tag <text>\n` +
        `${prefix}tagall\n` +
        `${prefix}tagadmin\n` +
        `${prefix}tag (reply to message)\n` +
        `${prefix}tag <groupid>`
      )
    }

    let targetGroup = m.chat

    // =======================
    // CHECK GROUP ID
    // =======================
    const groupMatch = text.match(/(\d+@g\.us)/)
    if (groupMatch) {
      targetGroup = groupMatch[1]
    }

    // =======================
    // FETCH PARTICIPANTS
    // =======================
    let participants
    try {
      const meta = await sock.groupMetadata(targetGroup)
      participants = meta.participants
    } catch {
      return reply("_Failed to fetch group metadata_")
    }

    // =======================
    // MODE DETECTION
    // =======================
    const cmd = context.command
    const isTagAll = cmd === "tagall"
    const isTagAdmin = cmd === "tagadmin"
    const isReply = !!m.quoted

    const customText =
      text && !text.match(/(\d+@g\.us)/) ? text.trim() : null

    // =======================
    // BUILD TARGETS
    // =======================
    const targets = []
    let msgText = ""

    for (let i = 0; i < participants.length; i++) {
      const p = participants[i]

      if (isTagAdmin && !p.admin) continue

      const jid = p.id
      targets.push(jid)

      msgText += `${targets.length}. @${jid.split("@")[0]}\n`
    }

    // =======================
    // SEND
    // =======================
    if (!targets.length) return reply('_No matching participants found_')

    if (isReply) {
      return sock.sendMessage(
        targetGroup,
        {
          forward: m.quoted,
          mentions: targets
        },
        { quoted: m }
      )
    }

    if (customText) {
      return sock.sendMessage(
        targetGroup,
        {
          text: customText,
          mentions: targets
        },
        { quoted: m }
      )
    }

    const finalText = msgText.trim()
    if (!finalText) return reply('_Nothing to send_')

    return sock.sendMessage(
      targetGroup,
      {
        text: finalText,
        mentions: targets
      },
      { quoted: m }
    )
  }
}