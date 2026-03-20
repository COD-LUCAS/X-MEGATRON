const {
  jidNormalizedUser,
  getContentType,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys')

const smsg = (sock, m) => {
  if (!m) return m

  m.id = m.key.id
  m.chat = m.key.remoteJid
  m.fromMe = m.key.fromMe
  m.isGroup = m.chat.endsWith('@g.us')
  m.sender = jidNormalizedUser(m.fromMe ? sock.user.id : (m.key.participant || m.chat))

  // Preserve pushName from raw message object
  m.pushName = m.pushName || 'User'

  if (!m.message) return m

  m.mtype = getContentType(m.message)
  m.msg = m.message[m.mtype]

  if (m.mtype === 'viewOnceMessage' || m.mtype === 'viewOnceMessageV2') {
    m.msg = m.msg.message
    m.mtype = getContentType(m.msg)
    m.msg = m.msg[m.mtype]
  }

  m.body = m.msg?.text || m.msg?.caption || m.message?.conversation || ''
  m.text = m.body

  const ctx = m.msg?.contextInfo
  if (ctx?.quotedMessage) {
    const qMsg = ctx.quotedMessage
    const qType = getContentType(qMsg)

    m.quoted = {
      mtype: qType,
      msg: qMsg[qType],
      message: qMsg,
      sender: jidNormalizedUser(ctx.participant),

      download: async () => {
        try {
          const msg = qMsg[qType]
          const stream = await downloadContentFromMessage(msg, qType.replace('Message', ''))
          let buffer = Buffer.from([])
          for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
          }
          return buffer
        } catch {
          return null
        }
      }
    }
  }

  if (m.msg?.url || m.msg?.directPath) {
    m.download = async () => {
      try {
        const stream = await downloadContentFromMessage(m.msg, m.mtype.replace('Message', ''))
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk])
        }
        return buffer
      } catch {
        return null
      }
    }
  }

  // ULTRA NULL-SAFE REPLY FUNCTION
  m.reply = (text) => {
    // Check 1: Null/undefined
    if (text === null || text === undefined) {
      console.log('⚠️ Blocked null/undefined reply');
      return Promise.resolve()
    }

    // Check 2: Empty string
    if (typeof text === 'string' && !text.trim()) {
      console.log('⚠️ Blocked empty string reply');
      return Promise.resolve()
    }

    // Check 3: Empty buffer
    if (Buffer.isBuffer(text) && text.length === 0) {
      console.log('⚠️ Blocked empty buffer reply');
      return Promise.resolve()
    }

    // Check 4: Invalid types
    if (typeof text !== 'string' && !Buffer.isBuffer(text)) {
      console.log('⚠️ Blocked invalid type reply:', typeof text);
      return Promise.resolve()
    }

    // All checks passed - send message
    try {
      return sock.sendMessage(m.chat, 
        Buffer.isBuffer(text) ? { image: text } : { text: String(text).trim() },
        { quoted: m }
      )
    } catch (e) {
      console.error('❌ Reply error:', e.message);
      return Promise.resolve()
    }
  }

  return m
}

module.exports = { smsg }
