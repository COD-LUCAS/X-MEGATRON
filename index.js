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

    log.info('Checking dependencies');
    log.success('Dependencies loaded');

    const sessionDir = `./${config().session}`;
    const sessionFile = `${sessionDir}/creds.json`;

    log.info('Initializing session');
    await initSession(sessionDir);

    if (!fs.existsSync(sessionFile)) {
      log.info('Downloading session from Database');

      const sessionId = process.env.SESSION_ID;
      if (!sessionId.includes('~')) {
        log.error('Invalid SESSION_ID.');
        process.exit(1);
      }

      const code = sessionId.split('~').pop().trim();
      if (!code) {
        log.error('Invalid SESSION_ID');
        process.exit(1);
      }

      try {
        const res = await axios.get(`https://pastebin.com/raw/${code}`, { timeout: 10000 });
        if (!res.data || typeof res.data !== 'object') {
          log.error('Invalid session data');
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
      logger: require('pino')({ level: 'fatal' }),
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
          const updater = require('./plugins/updater');
          if (updater.init) {
            const ownerFromEnv = (process.env.OWNER || '').split(',').map(v => v.trim()).filter(Boolean);
            const ownerFromFile = [];
            try {
              const ownerFile = path.join(__dirname, 'owner.json');
              if (fs.existsSync(ownerFile)) {
                const raw = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
                if (Array.isArray(raw)) ownerFromFile.push(...raw);
              }
            } catch (e) {}
            
            const allOwners = [...ownerFromEnv, ...ownerFromFile];
            if (allOwners.length > 0) {
              updater.init(sock, allOwners);
              log.success('Update checker started');
            }
          }
        } catch (e) {}

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
    log.error('Fatal error:', error.message);
    process.exit(1);
  }
};

clientstart();
