const config = require('./config')
const fs = require('fs')
const path = require('path')

let jidNormalizedUser

const loadBaileysUtils = async () => {
  const baileys = await import('@whiskeysockets/baileys')
  jidNormalizedUser = baileys.jidNormalizedUser
}

class PluginLoader {
  constructor() {
    this.plugins = []
    this.loadPlugins()
  }

  loadPlugins() {
    const pluginDir = path.join(__dirname, 'plugins')
    if (!fs.existsSync(pluginDir)) return

    this.plugins = []

    for (const file of fs.readdirSync(pluginDir)) {
      if (!file.endsWith('.js')) continue
      try {
        delete require.cache[require.resolve(path.join(pluginDir, file))]
        const plugin = require(path.join(pluginDir, file))
        if (plugin?.command || plugin?.onText) {
          this.plugins.push(plugin)
        }
      } catch (e) {
        console.log(`Failed to load plugin ${file}:`, e.message)
      }
    }
  }

  async execute(command, sock, m, context) {
    for (const plugin of this.plugins) {
      if (plugin.onText) {
        await plugin.execute(sock, m, context)
        continue
      }

      if (!command) continue

      const cmds = Array.isArray(plugin.command)
        ? plugin.command
        : [plugin.command]

      if (!cmds.includes(command)) continue

      if (plugin.owner && !context.isOwner) return true
      if (plugin.group && !context.isGroup) return true
      if (plugin.admin && context.isGroup && !context.isAdmins && !context.isOwner) return true

      await plugin.execute(sock, m, context)
      return true
    }
    return false
  }
}

const pluginLoader = new PluginLoader()

module.exports = async (sock, m, chatUpdate, store) => {
  try {
    if (!jidNormalizedUser) await loadBaileysUtils()

    // ========== IGNORE EMPTY MESSAGES ==========
    if (!m.message) return
    if (m.key && m.key.remoteJid === 'status@broadcast') return // Ignore status updates

    const body =
      m.mtype === 'conversation' ? m.message.conversation :
      m.mtype === 'imageMessage' ? m.message.imageMessage.caption :
      m.mtype === 'videoMessage' ? m.message.videoMessage.caption :
      m.mtype === 'extendedTextMessage' ? m.message.extendedTextMessage.text :
      m.mtype === 'buttonsResponseMessage' ? m.message.buttonsResponseMessage.selectedButtonId :
      m.mtype === 'listResponseMessage' ? m.message.listResponseMessage.singleSelectReply.selectedRowId :
      m.mtype === 'templateButtonReplyMessage' ? m.message.templateButtonReplyMessage.selectedId :
      m.mtype === 'interactiveResponseMessage' && m.msg?.nativeFlowResponseMessage?.paramsJson
        ? JSON.parse(m.msg.nativeFlowResponseMessage.paramsJson).id
        : ''

    // ========== STRICT BODY CHECK ==========
    if (!body || body.trim() === '') return

    const senderJid = m.key.fromMe
      ? sock.user.id
      : m.key.participant || m.key.remoteJid

    const botJid = await sock.decodeJid(sock.user.id)

    const senderNorm = jidNormalizedUser(senderJid)
    const botNorm = jidNormalizedUser(botJid)

    const senderNum = senderNorm.split('@')[0]

    const sudo = process.env.SUDO
      ? process.env.SUDO.split(',').map(v => v.trim()).filter(Boolean)
      : []

    const isCreator = senderNorm === botNorm
    const isSudo = sudo.includes(senderNum)
    const isOwner = isCreator || isSudo

    // ========== IGNORE BOT'S OWN MESSAGES ==========
    if (m.key.fromMe && !isOwner) return

    const mode = (process.env.MODE || 'public').toLowerCase()
    if (mode === 'private' && !isOwner) return

    // ========== FIXED QUOTED MESSAGE HANDLING ==========
    const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage

    const quoted = quotedMsg ? {
      key: {
        remoteJid: m.chat,
        fromMe: m.message.extendedTextMessage.contextInfo.participant === botNorm,
        id: m.message.extendedTextMessage.contextInfo.stanzaId,
        participant: m.message.extendedTextMessage.contextInfo.participant
      },
      message: quotedMsg,
      msg: quotedMsg[Object.keys(quotedMsg)[0]],
      chat: m.chat,
      text: quotedMsg.conversation ||
            quotedMsg.extendedTextMessage?.text ||
            quotedMsg.imageMessage?.caption ||
            quotedMsg.videoMessage?.caption || '',
      download: async () => {
        try {
          const quotedMsgObj = {
            key: {
              remoteJid: m.chat,
              id: m.message.extendedTextMessage.contextInfo.stanzaId,
              participant: m.message.extendedTextMessage.contextInfo.participant
            },
            message: quotedMsg
          }
          return await sock.downloadMediaMessage(quotedMsgObj)
        } catch (e) {
          console.log('Download error:', e)
          throw e
        }
      }
    } : null

    const mime = quoted ? (quoted.msg?.mimetype || '') : ''
    const isMedia = /image|video|audio|sticker/.test(mime)

    const groupMetadata = m.isGroup
      ? await sock.groupMetadata(m.chat).catch(() => ({}))
      : {}

    const participants = groupMetadata.participants || []
    const groupAdmins = participants.filter(p => p.admin).map(p => p.id)
    const isAdmins = m.isGroup ? groupAdmins.includes(senderNorm) : false

    const prefix = process.env.PREFIX || '.'
    const isCmd = body.startsWith(prefix)

    const command = isCmd
      ? body.slice(prefix.length).trim().split(/ +/)[0].toLowerCase()
      : null

    const args = isCmd ? body.trim().split(/ +/).slice(1) : []
    const text = args.join(' ')

    const reply = async txt => {
      if (!txt || txt.trim() === '') return // Prevent empty replies
      return sock.sendMessage(m.chat, { text: txt }, { quoted: m })
    }

    await pluginLoader.execute(command, sock, m, {
      args,
      command,
      text,
      quoted,
      mime,
      isMedia,
      isAdmins,
      isOwner,
      isSudo,
      participants,
      groupMetadata,
      sender: senderNorm,
      senderNum,
      prefix,
      reply,
      config,
      isGroup: m.isGroup,
      store
    })

  } catch (e) {
    console.log('Message handler error:', e)
  }
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
  fs.unwatchFile(file)
  delete require.cache[file]
  require(file)
})
