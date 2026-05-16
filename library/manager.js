
const {
  jidNormalizedUser,
  getContentType,
  downloadContentFromMessage
} = require('@itsliaaa/baileys')

const SYSTEM_TYPES = new Set([
  'protocolMessage',
  'senderKeyDistributionMessage',
  'reactionMessage',
  'pollUpdateMessage',
  'groupV2Change',
  'groupNotification',
  'liveLocationMessage',
  'stickerSyncRmrMessage',
  'keepInChatMessage',
  'callLogMesssage',
])

const smsg = (sock, m) => {
  if (!m) return m

  m.id = m.key.id
  m.chat = m.key.remoteJid
  m.fromMe = m.key.fromMe
  m.isGroup = m.chat.endsWith('@g.us')
  m.sender = jidNormalizedUser(m.fromMe ? sock.user.id : (m.key.participant || m.chat))

  m.pushName = m.pushName || 'User'

  if (!m.message) return m

  m.mtype = getContentType(m.message)
  m.msg = m.message[m.mtype]

  if (SYSTEM_TYPES.has(m.mtype)) {
    m.isSystem = true
    m.body = ''
    m.text = ''
    return m
  }

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

  // NULL-SAFE REPLY — blocks all empty/invalid messages
  m.reply = (text) => {
    if (text === null || text === undefined) return Promise.resolve()
    if (typeof text !== 'string') return Promise.resolve()
    if (text.trim() === '') return Promise.resolve()
    if (text === '_') return Promise.resolve()
    
    const cleanText = text.replace(/[_\*~`]/g, '').trim()
    if (cleanText === '') return Promise.resolve()
    
    try {
      return sock.sendMessage(m.chat, { text: text.trim() }, { quoted: m })
    } catch {
      return Promise.resolve()
    }
  }

  return m
}

module.exports = { smsg }