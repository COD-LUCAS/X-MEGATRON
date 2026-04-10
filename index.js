require('./library/console');
require('dotenv').config();

const config = () => require('./config');

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const log = require('./library/console');

let makeWASocket, Browsers, useMultiFileAuthState,
    DisconnectReason, fetchLatestBaileysVersion, jidDecode;

const loadBaileys = async () => {
  const b = await import('@whiskeysockets/baileys');
  makeWASocket = b.default;
  Browsers = b.Browsers;
  useMultiFileAuthState = b.useMultiFileAuthState;
  DisconnectReason = b.DisconnectReason;
  fetchLatestBaileysVersion = b.fetchLatestBaileysVersion;
  jidDecode = b.jidDecode;
};

const SESSION_BACKUP = './library/session.json';

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

const initSession = async (sessionDir) => {
  if (!fs.existsSync('./library')) {
    fs.mkdirSync('./library', { recursive: true });
  }

  let saved = {};
  if (fs.existsSync(SESSION_BACKUP)) {
    try {
      saved = JSON.parse(fs.readFileSync(SESSION_BACKUP, 'utf8'));
    } catch (e) {}
  }

  const envSession = process.env.SESSION_ID;
  if (!envSession || envSession.trim().length === 0) {
    log.error('SESSION_ID missing or empty in .env');
    process.exit(1);
  }

  if (saved.SESSION_ID && saved.SESSION_ID !== envSession) {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  fs.writeFileSync(SESSION_BACKUP, JSON.stringify({ SESSION_ID: envSession }, null, 2));
};

const clientstart = async () => {
  try {
    await loadBaileys();

    const sessionDir = `./${config().session}`;
    const sessionFile = `${sessionDir}/creds.json`;

    await initSession(sessionDir);

    if (!fs.existsSync(sessionFile)) {
      const sessionId = process.env.SESSION_ID;

      if (!sessionId.includes('~')) process.exit(1);

      const code = sessionId.split('~').pop().trim();
      if (!code) process.exit(1);

      try {
        const res = await axios.get(`https://pastebin.com/raw/${code}`, { timeout: 10000 });
        if (!res.data || typeof res.data !== 'object') process.exit(1);
        fs.writeFileSync(sessionFile, JSON.stringify(res.data, null, 2));
      } catch (error) {
        process.exit(1);
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      version,
      logger: require('pino')({ level: 'fatal' }),
      printQRInTerminal: false,
      browser: Browsers.macOS('Chrome'),
      getMessage: async () => ({ conversation: '' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        try {
          if (fs.existsSync('./plugins/startup.js')) {
            require('./plugins/startup').execute(sock);
          }
        } catch (e) {}
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;

        if (code !== DisconnectReason.loggedOut) {
          setTimeout(clientstart, 5000);
        } else {
          process.exit(1);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        if (type !== 'notify') return;
        const mek = messages[0];
        if (!mek?.message) return;
        if (mek.key.fromMe) return;

        mek.message = mek.message.ephemeralMessage?.message || mek.message;

        if (!mek.message.conversation && !mek.message.extendedTextMessage) return;

        const { smsg } = require('./library/manager');
        const m = await smsg(sock, mek);
        require('./main')(sock, m);
      } catch (e) {}
    });

    sock.decodeJid = (jid) => {
      if (/:\d+@/gi.test(jid)) {
        const d = jidDecode(jid) || {};
        return d.user && d.server ? `${d.user}@${d.server}` : jid;
      }
      return jid;
    };

  } catch (error) {
    process.exit(1);
  }
};

clientstart();