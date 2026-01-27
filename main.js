require('dotenv').config()

const config = require('./config')
const fs = require('fs')
const path = require('path')

let jidNormalizedUser
const processedMessages = new Set()

const loadBaileysUtils = async () => {
  const baileys = await import('@whiskeysockets/baileys')
  jidNormalizedUser = baileys.jidNormalizedUser
}

global.disabledCommands = global.disabledCommands || new Set()

// Persist disabled commands to file
const DISABLED_COMMANDS_FILE = path.join(__dirname, 'disabled_commands.json')

// Load disabled commands on startup
const loadDisabledCommands = () => {
  try {
    if (fs.existsSync(DISABLED_COMMANDS_FILE)) {
      const data = fs.readFileSync(DISABLED_COMMANDS_FILE, 'utf8')
      const commands = JSON.parse(data)
      global.disabledCommands = new Set(commands)
      console.log('Loaded disabled commands:', Array.from(global.disabledCommands))
    }
  } catch (e) {
    console.log('Failed to load disabled commands:', e.message)
  }
}

// Save disabled commands to file
global.saveDisabledCommands = () => {
  try {
    const commands = Array.from(global.disabledCommands)
    fs.writeFileSync(DISABLED_COMMANDS_FILE, JSON.stringify(commands, null, 2))
    console.log('Saved disabled commands:', commands)
  } catch (e) {
    console.log('Failed to save disabled commands:', e.message)
  }
}

// Load on startup
loadDisabledCommands()

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
        if (plugin?.command || plugin?.onText || plugin?.autoReveal) {
          this.plugins.push(plugin)
        }
      } catch (e) {
        console.log(`Failed to load plugin ${file}:`, e.message)
      }
    }
  }

  async execute(command, sock, m, context) {
    if (command && global.disabledCommands.has(command)) {
      return context.reply('_❌ This command has been disabled by the owner_')
    }

    for (const plugin of this.plugins) {
      try {
        if (plugin.onText) {
          await plugin.execute(sock, m, context)
          continue
        }

        if (!command) continue

        const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command]
        if (!cmds.includes(command)) continue

        await plugin.execute(sock, m, context)
        return true
        
      } catch (e) {
        console.log(`Plugin error (${command}):`, e.message)
      }
    }
    return false
  }

  async executeOnText(sock, m, context) {
    for (const plugin of this.plugins) {
      try {
        if (plugin.onText) {
          await plugin.execute(sock, m, context)
        }
      } catch (e) {
        // Silent fail for onText plugins
      }
    }
  }

  async executeAutoReveal(sock, m) {
    for (const plugin of this.plugins) {
      try {
        if (plugin.autoReveal) {
          await plugin.autoReveal(sock, m)
        }
      } catch (e) {
        // Silent fail for auto-reveal
      }
    }
  }
}

const pluginLoader = new PluginLoader()

const checkIsSudo = (senderNumber, sudoList) => {
  if (!senderNumber || !sudoList || sudoList.length === 0) return false
  
  const senderDigits = senderNumber.replace(/\D/g, '')
  
  return sudoList.some(sudoEntry => {
    const sudoDigits = sudoEntry.replace(/\D/g, '')
    if (senderDigits === sudoDigits) return true
    if (senderDigits.length >= 10 && sudoDigits.length >= 10) {
      return senderDigits.slice(-10) === sudoDigits.slice(-10)
    }
    return false
  })
}

module.exports = async (sock, m, chatUpdate, store) => {
  try {
    if (!jidNormalizedUser) await loadBaileysUtils()

    // Strict message validation
    if (!m.key?.id) return
    if (processedMessages.has(m.key.id)) return
    processedMessages.add(m.key.id)
    
    if (processedMessages.size > 100) {
      const arr = Array.from(processedMessages)
      processedMessages.clear()
      arr.slice(-50).forEach(id => processedMessages.add(id))
    }

    if (!m.message) return
    if (m.key.remoteJid === 'status@broadcast') return
    if (m.message.protocolMessage) return
    if (m.message.senderKeyDistributionMessage) return
    if (m.message.reactionMessage) return

    // ============ AUTO ANTI-VIEWONCE ============
    // Check for view once messages BEFORE processing anything else
    await pluginLoader.executeAutoReveal(sock, m)

    // Get message body
    const body =
      m.mtype === 'conversation' ? m.message.conversation :
      m.mtype === 'imageMessage' ? m.message.imageMessage.caption :
      m.mtype === 'videoMessage' ? m.message.videoMessage.caption :
      m.mtype === 'extendedTextMessage' ? m.message.extendedTextMessage.text :
      ''

    // Calculate sender info ONCE
    const senderJid = m.key.fromMe ? sock.user.id : (m.key.participant || m.key.remoteJid)
    const botJid = sock.user?.id || await sock.decodeJid(sock.user.id)
    const senderNorm = jidNormalizedUser(senderJid)
    const botNorm = jidNormalizedUser(botJid)
    const senderNum = senderNorm.split('@')[0]

    // Calculate sudo status ONCE
    const sudoEnv = process.env.SUDO || ''
    const sudoList = sudoEnv.split(',').map(v => v.trim()).filter(Boolean)
    
    const isCreator = senderNorm === botNorm
    const isSudo = checkIsSudo(senderNum, sudoList)
    const isOwner = isCreator || isSudo

    // Private mode check
    const mode = (process.env.MODE || 'public').toLowerCase()
    if (mode === 'private' && !isOwner) return

    // Group metadata - lazy load only when needed
    let groupMetadata = null
    let participants = []
    let isAdmins = false

    const getGroupMetadata = async () => {
      if (!m.isGroup || groupMetadata) return
      try {
        groupMetadata = await sock.groupMetadata(m.chat)
        participants = groupMetadata.participants || []
        const groupAdmins = participants.filter(p => p.admin).map(p => p.id)
        isAdmins = groupAdmins.includes(senderNorm)
      } catch (e) {
        // Ignore group metadata errors
      }
    }

    // Quoted message handling
    const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const quoted = quotedMsg ? {
      key: {
        remoteJid: m.chat,
        fromMe: m.message.extendedTextMessage.contextInfo.participant === botNorm,
        id: m.message.extendedTextMessage.contextInfo.stanzaId,
        participant: m.message.extendedTextMessage.contextInfo.participant
      },
      message: quotedMsg,
      mtype: Object.keys(quotedMsg)[0],
      msg: quotedMsg[Object.keys(quotedMsg)[0]],
      chat: m.chat,
      text: quotedMsg.conversation || 
            quotedMsg.extendedTextMessage?.text || 
            quotedMsg.imageMessage?.caption || 
            quotedMsg.videoMessage?.caption || '',
      isViewOnce: !!(
        quotedMsg.viewOnceMessage || 
        quotedMsg.viewOnceMessageV2 || 
        quotedMsg.imageMessage?.viewOnce === true ||
        quotedMsg.videoMessage?.viewOnce === true ||
        quotedMsg.audioMessage?.viewOnce === true
      ),
      download: async () => {
        const { downloadMediaMessage } = await import('@whiskeysockets/baileys')
        return await downloadMediaMessage(
          { key: quoted.key, message: quotedMsg },
          'buffer',
          {},
          { logger: console, reuploadRequest: sock.updateMediaMessage }
        )
      }
    } : null

    const mime = quoted?.msg?.mimetype || ''
    const isMedia = /image|video|audio|sticker/.test(mime)

    const prefix = process.env.PREFIX || '.'
    
    // Fixed reply function - no null messages
    const reply = async (txt) => {
      if (!txt || typeof txt !== 'string') return
      const cleanText = txt.trim()
      if (cleanText.length === 0) return
      
      try {
        return await sock.sendMessage(m.chat, { text: cleanText }, { quoted: m })
      } catch (e) {
        console.error('Reply error:', e.message)
      }
    }

    // Context object
    const context = {
      args: [],
      command: null,
      text: body || '',
      quoted,
      mime,
      isMedia,
      isAdmins,
      isOwner,
      isSudo,
      isCreator,
      get participants() { return participants },
      get groupMetadata() { return groupMetadata },
      getGroupMetadata,
      sender: senderNorm,
      senderNum,
      prefix,
      reply,
      config,
      isGroup: m.isGroup,
      store
    }

    // Execute onText plugins (no await for speed)
    pluginLoader.executeOnText(sock, m, context).catch(() => {})

    // Check if it's a command
    if (!body || typeof body !== 'string' || body.trim().length === 0) return

    const isCmd = body.startsWith(prefix)
    if (!isCmd) return
    
    const command = body.slice(prefix.length).trim().split(/ +/)[0].toLowerCase()
    if (!command) return

    // Check disabled commands BEFORE executing
    if (global.disabledCommands.has(command)) {
      return reply('_❌ This command has been disabled by the owner_')
    }

    const args = body.trim().split(/ +/).slice(1)
    const text = args.join(' ')

    // Update context for command
    context.command = command
    context.args = args
    context.text = text

    // Load group metadata only if command needs it
    if (m.isGroup && !groupMetadata) {
      await getGroupMetadata()
      context.isAdmins = isAdmins
    }

    // Execute plugin
    await pluginLoader.execute(command, sock, m, context)

  } catch (e) {
    console.error('Handler error:', e.message)
  }
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
  fs.unwatchFile(file)
  delete require.cache[file]
  require(file)
})
