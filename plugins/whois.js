const axios = require('axios')

module.exports = {
  command: ['whois'],
  category: 'utility',
  desc: 'Get user information',
  usage: '.whois | .whois <number> | reply + .whois | mention + .whois',

  async execute(sock, m, context) {
    const { reply, text, quoted, sender, isGroup } = context

    let targetJid

    // 1. Reply case
    if (quoted?.key?.participant) {
      targetJid = quoted.key.participant
    }

    // 2. Mention case
    else if (
      m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length
    ) {
      targetJid =
        m.message.extendedTextMessage.contextInfo.mentionedJid[0]
    }

    // 3. Number argument
    else if (text && /\d{6,}/.test(text)) {
      const num = text.replace(/\D/g, '')
      targetJid = num + '@s.whatsapp.net'
    }

    // 4. No target → self OR show usage
    else if (!text && !quoted) {
      targetJid = sender
    }

    if (!targetJid) {
      return reply(
        `Usage: .whois

• .whois → your info
• .whois <number>
• reply to a message with .whois
• mention a user with .whois`
      )
    }

    let name = 'Unknown'
    let about = 'Hidden'
    let number = targetJid.split('@')[0]
    let jid = targetJid
    let profilePicUrl = null

    // Get name from group metadata
    if (isGroup) {
      try {
        const meta = await sock.groupMetadata(m.chat)
        const user = meta.participants.find(p => p.id === targetJid)
        if (user) {
          name = user.notify || user.name || name
        }
      } catch {}
    }

    // Own name fallback
    if (targetJid === sender && m.pushName) {
      name = m.pushName
    }

    // Fetch about
    try {
      const status = await sock.fetchStatus(targetJid)
      if (status?.status) about = status.status
    } catch {}

    // Fetch profile picture
    try {
      profilePicUrl = await sock.profilePictureUrl(targetJid, 'image')
    } catch {}

    const caption =
`User information

👤 Name: ${name}
📞 Number: +${number}
📝 About: ${about}
🆔 JID: ${jid}`

    // Send with DP if available
    if (profilePicUrl) {
      try {
        const res = await axios.get(profilePicUrl, {
          responseType: 'arraybuffer'
        })

        return await sock.sendMessage(
          m.chat,
          {
            image: Buffer.from(res.data),
            caption
          },
          { quoted: m }
        )
      } catch {
        return reply(caption)
      }
    } else {
      return reply(caption)
    }
  }
}