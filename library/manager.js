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

  m.reply = (text) => {
    if (!text || (typeof text === 'string' && !text.trim())) return Promise.resolve()
    
    if (m.isGroup && (!text || (typeof text === 'string' && !text.trim()))) return Promise.resolve()

    return sock.sendMessage(m.chat, 
      Buffer.isBuffer(text) ? { image: text } : { text: String(text) },
      { quoted: m }
    )
  }

  return m
}

const wrapSock = (sock) => {
  const originalSendMessage = sock.sendMessage.bind(sock)
  
  sock.sendMessage = async (jid, content, options = {}) => {
    if (!content) return null
    
    const isGroup = jid.endsWith('@g.us')
    
    if (content.text !== undefined) {
      if (!content.text || (typeof content.text === 'string' && !content.text.trim())) {
        return null
      }
      
      if (isGroup && (!content.text || content.text.trim().length === 0)) {
        return null
      }
    }
    
    if (content.caption !== undefined) {
      if (!content.caption || (typeof content.caption === 'string' && !content.caption.trim())) {
        delete content.caption
      }
    }
    
    try {
      return await originalSendMessage(jid, content, options)
    } catch (e) {
      return null
    }
  }
  
  return sock
}

module.exports = { smsg, wrapSock }
