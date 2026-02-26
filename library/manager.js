const {
  jidNormalizedUser,
  proto,
  getContentType,
  areJidsSameUser,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys')

const smsg = async (sock, m, store) => {
  if (!m) return m

  const M = proto.WebMessageInfo

  if (m.key) {
    m.id = m.key.id
    m.chat = m.key.remoteJid
    m.fromMe = m.key.fromMe
    m.isGroup = m.chat.endsWith('@g.us')

    m.sender = jidNormalizedUser(
      m.fromMe
        ? sock.user.id
        : m.key.participant || m.chat
    )

    if (m.isGroup) {
      m.participant = jidNormalizedUser(m.key.participant || '')
    }
  }

  if (!m.message) return m

  m.mtype = getContentType(m.message)

  if (m.mtype === 'viewOnceMessage' || m.mtype === 'viewOnceMessageV2' || m.mtype === 'viewOnceMessageV2Extension') {
    m.msg = m.message[m.mtype].message
    m.mtype = getContentType(m.msg)
    m.msg = m.msg[m.mtype]
    m.isViewOnce = true
  } else {
    m.msg = m.message[m.mtype]
    m.isViewOnce = false
  }

  m.text =
    m.msg?.text ||
    m.msg?.caption ||
    m.message?.conversation ||
    m.msg?.contentText ||
    m.msg?.selectedDisplayText ||
    m.msg?.title ||
    ''

  m.body = m.text

  const context = m.msg?.contextInfo || {}
  m.mentionedJid = context.mentionedJid || []

  if (context.quotedMessage) {
    const quoted = context.quotedMessage
    let qType = getContentType(quoted)

    let qMsg =
      qType === 'viewOnceMessage' || qType === 'viewOnceMessageV2' || qType === 'viewOnceMessageV2Extension'
        ? quoted[qType].message[getContentType(quoted[qType].message)]
        : quoted[qType]

    m.quoted = {
      mtype: qType,
      id: context.stanzaId,
      chat: context.remoteJid || m.chat,
      sender: jidNormalizedUser(context.participant),
      fromMe: areJidsSameUser(
        jidNormalizedUser(context.participant),
        jidNormalizedUser(sock.user.id)
      ),
      text:
        qMsg?.text ||
        qMsg?.caption ||
        qMsg?.conversation ||
        '',
      msg: qMsg,
      message: quoted,
      mentionedJid: context.mentionedJid || [],
      isViewOnce:
        qType === 'viewOnceMessage' ||
        qType === 'viewOnceMessageV2' ||
        qType === 'viewOnceMessageV2Extension'
    }

    const fakeObj = M.fromObject({
      key: {
        remoteJid: m.quoted.chat,
        fromMe: m.quoted.fromMe,
        id: m.quoted.id,
        participant: m.isGroup ? m.quoted.sender : undefined
      },
      message: quoted
    })

    m.quoted.fakeObj = fakeObj

    m.quoted.delete = () =>
      sock.sendMessage(m.quoted.chat, { delete: fakeObj.key })

    m.quoted.copyNForward = (jid, force = false, opts = {}) =>
      sock.copyNForward(jid, fakeObj, force, opts)

    m.quoted.download = async () => {
      try {
        const msg = m.quoted.msg || m.quoted.message[m.quoted.mtype]
        const stream = await downloadContentFromMessage(msg, m.quoted.mtype.replace('Message', ''))
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk])
        }
        return buffer
      } catch (e) {
        return null
      }
    }

    m.getQuotedObj = async () => {
      if (!m.quoted.id) return null
      try {
        const q = await store.loadMessage(m.chat, m.quoted.id, sock)
        return smsg(sock, q, store)
      } catch (e) {
        return null
      }
    }
  } else {
    m.quoted = null
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
      } catch (e) {
        return null
      }
    }
  }

  m.reply = (text, jid = m.chat, opts = {}) => {
    if (!text || (typeof text === 'string' && text.trim().length === 0)) {
      return Promise.resolve()
    }
    
    return Buffer.isBuffer(text)
      ? sock.sendMessage(jid, { image: text }, { quoted: m, ...opts })
      : sock.sendMessage(jid, { text: String(text) }, { quoted: m, ...opts })
  }

  m.copy = () => smsg(sock, M.fromObject(M.toObject(m)), store)

  m.copyNForward = (jid = m.chat, force = false, opts = {}) =>
    sock.copyNForward(jid, m, force, opts)

  m.isBot = m.key.id.startsWith('BAE5') || m.key.id.length === 16

  return m
}

module.exports = { smsg }
