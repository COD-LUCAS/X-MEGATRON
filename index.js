require('./library/console');
require('dotenv').config();

const config = () => require('./config');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

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

const initSession = async (sessionDir) => {
  if (!fs.existsSync('./library')) {
    fs.mkdirSync('./library', { recursive: true });
  }

  let saved = {};
  if (fs.existsSync(SESSION_BACKUP)) {
    try {
      saved = JSON.parse(fs.readFileSync(SESSION_BACKUP, 'utf8'));
    } catch (e) {
      console.error('Failed to read session backup:', e.message);
    }
  }

  const envSession = process.env.SESSION_ID;
  if (!envSession || envSession.trim().length === 0) {
    log.error('SESSION_ID missing or empty in .env');
    process.exit(1);
  }

  if (saved.SESSION_ID && saved.SESSION_ID !== envSession) {
    log.warn('Session changed, clearing old session');
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

    log.info('Checking dependencies');
    log.success('Dependencies loaded');

    const sessionDir = `./${config().session}`;
    const sessionFile = `${sessionDir}/creds.json`;

    log.info('Initializing session');
    await initSession(sessionDir);

    if (!fs.existsSync(sessionFile)) {
      log.info('Downloading session from pastebin');

      const sessionId = process.env.SESSION_ID;
      if (!sessionId.includes('~')) {
        log.error('Invalid SESSION_ID format. Expected: PREFIX~PASTEBIN_CODE');
        process.exit(1);
      }

      const code = sessionId.split('~').pop().trim();
      if (!code) {
        log.error('Invalid pastebin code in SESSION_ID');
        process.exit(1);
      }

      try {
        const res = await axios.get(`https://pastebin.com/raw/${code}`, { timeout: 10000 });
        if (!res.data || typeof res.data !== 'object') {
          log.error('Invalid session data from pastebin');
          process.exit(1);
        }
        fs.writeFileSync(sessionFile, JSON.stringify(res.data, null, 2));
        log.success('Session downloaded successfully');
      } catch (error) {
        log.error('Failed to download session:', error.message);
        process.exit(1);
      }
    }

    log.success('Session initialized');

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    log.info('Starting socket connection');

    const sock = makeWASocket({
      auth: state,
      version,
      logger: require('pino')({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.macOS('Chrome'),
      getMessage: async () => ({ conversation: '' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        log.success('Plugins loaded');
        const num = sock.user.id.split(':')[0];
        log.success(`Connected as +${num}`);
        try {
          if (fs.existsSync('./plugins/startup.js')) {
            require('./plugins/startup').execute(sock);
          }
        } catch (e) {
          console.error('Startup plugin error:', e.message);
        }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          log.warn('Connection closed, reconnecting in 5s');
          setTimeout(clientstart, 5000);
        } else {
          log.error('Logged out, please get new SESSION_ID');
          process.exit(1);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        if (type !== 'notify') return;
        const mek = messages[0];
        if (!mek?.message) return;

        mek.message = mek.message.ephemeralMessage?.message || mek.message;

        const { smsg } = require('./library/manager');
        const m = await smsg(sock, mek);
        require('./main')(sock, m);
      } catch (e) {
        console.error('Message handler error:', e.message);
      }
    });

    sock.decodeJid = (jid) => {
      if (/:\d+@/gi.test(jid)) {
        const d = jidDecode(jid) || {};
        return d.user && d.server ? `${d.user}@${d.server}` : jid;
      }
      return jid;
    };

  } catch (error) {
    log.error('Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  }
};

clientstart();
