const config = require('./config')
const fs = require('fs')
const path = require('path')

let jidNormalizedUser

const loadBaileysUtils = async () => {
  const baileys = await import('@whiskeysockets/baileys')
  jidNormalizedUser = baileys.jidNormalizedUser
}

// Global disabled commands storage
global.disabledCommands = global.disabledCommands || new Set()

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
    // Check if command is disabled
    if (command && global.disabledCommands.has(command)) {
      await sock.sendMessage(m.chat, { react: { text: '🚫', key: m.key } });
      return context.reply('_OWNER DISABLED THIS COMMAND_');
    }

    for (const plugin of this.plugins) {
      try {
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
      } catch (e) {
        console.log(`Plugin error (${command}):`, e.message)
      }
    }
    return false
  }
}

const pluginLoader = new PluginLoader()

module.exports = async (sock, m, chatUpdate, store) => {
  try {
    if (!jidNormalizedUser) await loadBaileysUtils()

    // Quick rejections
    if (!m.message || m.key?.remoteJid === 'status@broadcast') return
    if (m.message.protocolMessage || m.message.senderKeyDistributionMessage) return

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

    if (!body || !body.trim()) return

    const prefix = process.env.PREFIX || '.'
    const isCmd = body.startsWith(prefix)
    
    // Extract command early for performance
    const command = isCmd ? body.slice(prefix.length).trim().split(/ +/)[0].toLowerCase() : null

    // Quick check for disabled commands
    if (command && global.disabledCommands.has(command)) {
      await sock.sendMessage(m.chat, { react: { text: '🚫', key: m.key } });
      return sock.sendMessage(m.chat, { text: '_OWNER DISABLED THIS COMMAND_' }, { quoted: m });
    }

    const senderJid = m.key.fromMe ? sock.user.id : (m.key.participant || m.key.remoteJid)
    const botJid = await sock.decodeJid(sock.user.id)
    const senderNorm = jidNormalizedUser(senderJid)
    const botNorm = jidNormalizedUser(botJid)
    const senderNum = senderNorm.split('@')[0]

    const sudo = process.env.SUDO?.split(',').map(v => v.trim()).filter(Boolean) || []
    const isCreator = senderNorm === botNorm
    const isSudo = sudo.includes(senderNum)
    const isOwner = isCreator || isSudo

    // Optimized private mode check - reject early
    const mode = (process.env.MODE || 'public').toLowerCase()
    if (mode === 'private' && !isOwner) return

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
        const quotedMsgObj = {
          key: {
            remoteJid: m.chat,
            id: m.message.extendedTextMessage.contextInfo.stanzaId,
            participant: m.message.extendedTextMessage.contextInfo.participant
          },
          message: quotedMsg
        }
        return await sock.downloadMediaMessage(quotedMsgObj)
      }
    } : null

    const mime = quoted?.msg?.mimetype || ''
    const isMedia = /image|video|audio|sticker/.test(mime)

    // Lazy load group data only when needed
    let groupMetadata = {}
    let participants = []
    let isAdmins = false

    if (m.isGroup) {
      groupMetadata = await sock.groupMetadata(m.chat).catch(() => ({}))
      participants = groupMetadata.participants || []
      const groupAdmins = participants.filter(p => p.admin).map(p => p.id)
      isAdmins = groupAdmins.includes(senderNorm)
    }

    const args = isCmd ? body.trim().split(/ +/).slice(1) : []
    const text = args.join(' ')

    const reply = async (txt) => {
      if (!txt || !txt.trim()) return
      return sock.sendMessage(m.chat, { text: String(txt).trim() }, { quoted: m })
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
    console.log('Message handler error:', e.message)
  }
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
  fs.unwatchFile(file)
  delete require.cache[file]
  require(file)
})
