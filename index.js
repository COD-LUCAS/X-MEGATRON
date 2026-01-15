const blockedPatterns = [
'SessionEntry',
'Closing session',
'_chains',
'ephemeralKeyPair',
'registrationId',
'currentRatchet',
'lastRemoteEphemeralKey',
'rootKey',
'indexInfo',
'pendingPreKey',
'DeprecationWarning',
'fs.Stats',
'node:'
]

const rawWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, encoding, cb) => {
const msg = chunk.toString()
if (blockedPatterns.some(p => msg.includes(p))) return true
return rawWrite(chunk, encoding, cb)
}

require('dotenv').config()
const config = () => require('./config')
process.on("uncaughtException", () => {})
process.on("unhandledRejection", () => {})

const fs = require('fs')
const path = require('path')
const axios = require('axios')
const chalk = require('chalk')
const pino = require('pino')
const { Boom } = require('@hapi/boom')
const { smsg } = require('./library/manager')

const log = {
info: t => console.log(chalk.blueBright(t)),
ok: t => console.log(chalk.cyanBright(t)),
good: t => console.log(chalk.blue(t)),
warn: t => console.log(chalk.yellow(t)),
err: t => console.log(chalk.red(t))
}

let makeWASocket, Browsers, useMultiFileAuthState,
DisconnectReason, fetchLatestBaileysVersion, jidDecode

const loadBaileys = async () => {
const b = await import('@whiskeysockets/baileys')
makeWASocket = b.default
Browsers = b.Browsers
useMultiFileAuthState = b.useMultiFileAuthState
DisconnectReason = b.DisconnectReason
fetchLatestBaileysVersion = b.fetchLatestBaileysVersion
jidDecode = b.jidDecode
}

const SESSION_BACKUP = './library/session.json'

const initSession = async sessionDir => {
if (!fs.existsSync('./library')) fs.mkdirSync('./library')

let saved = {}
if (fs.existsSync(SESSION_BACKUP)) {
try { saved = JSON.parse(fs.readFileSync(SESSION_BACKUP)) } catch {}
}

const envSession = process.env.SESSION_ID
if (!envSession) {
log.err('SESSION_ID missing in .env')
process.exit(1)
}

if (saved.SESSION_ID && saved.SESSION_ID !== envSession) {
fs.rmSync(sessionDir, { recursive: true, force: true })
}

fs.mkdirSync(sessionDir, { recursive: true })
fs.writeFileSync(
SESSION_BACKUP,
JSON.stringify({ SESSION_ID: envSession }, null, 2)
)
}

const clientstart = async () => {
await loadBaileys()

log.info('CHECKING DEPENDENCIES')
log.good('DEPENDENCIES OK')

const sessionDir = `./${config().session}`
const sessionFile = `${sessionDir}/creds.json`

log.info('INITIALIZING SESSION')
await initSession(sessionDir)

if (!fs.existsSync(sessionFile)) {
const code = process.env.SESSION_ID.split('~').pop().trim()
const url = `https://pastebin.com/raw/${code}`
const res = await axios.get(url)
fs.writeFileSync(sessionFile, JSON.stringify(res.data, null, 2))
}

log.good('SESSION INITIALIZED')

const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
const { version } = await fetchLatestBaileysVersion()

log.info('STARTING SOCKET')

const sock = makeWASocket({
auth: state,
version,
logger: pino({ level: 'silent' }),
printQRInTerminal: false,
browser: Browsers.macOS('Chrome'),
getMessage: async () => ({ conversation: '' })
})

sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
if (connection === 'open') {
log.good('PLUGINS LOADED')
const num = sock.user.id.split(':')[0]
log.ok(`CONNECTED AS ${num}`)
try { require('./plugins/startup').execute(sock) } catch {}
}

if (connection === 'close') {
const code = lastDisconnect?.error?.output?.statusCode
if (code !== DisconnectReason.loggedOut) {
setTimeout(clientstart, 5000)
}
}
})

sock.ev.on('messages.upsert', async ({ messages, type }) => {
try {
const mek = messages[0]
if (!mek?.message) return

mek.message = mek.message.ephemeralMessage?.message || mek.message
if (!sock.public && !mek.key.fromMe && type === 'notify') return

const m = await smsg(sock, mek)
require('./main')(sock, m)
} catch {}
})

sock.decodeJid = jid => {
if (/:\d+@/gi.test(jid)) {
const d = jidDecode(jid) || {}
return d.user && d.server ? d.user + '@' + d.server : jid
}
return jid
}

sock.public = config().status.public
}

clientstart()
