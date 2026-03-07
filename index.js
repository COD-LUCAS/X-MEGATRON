require('./library/console');
require('dotenv').config();

const config = () => require('./config');
const fs = require('fs');
const path = require('path');
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

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

const clientstart = async () => {
  try {
    await loadBaileys();

    log.info('Checking dependencies');
    log.success('Dependencies loaded');

    const sessionDir = `./${config().session}`;

    log.info('Initializing session');

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

    const { wrapSock } = require('./library/manager');
    wrapSock(sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        log.success('Plugins loaded');
        const num = sock.user.id.split(':')[0];
        log.success(`Connected as +${num}`);

        try {
          const updater = require('./plugins/updater');
          if (updater.init) {
            const owners = (process.env.OWNER || '').split(',').map(v => v.trim()).filter(Boolean);
            if (owners.length > 0) {
              updater.init(sock, owners);
              log.success('Update checker started');
            }
          }
        } catch (e) {}
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          log.error('Logged out - session expired');
          log.error('Generate new SESSION_ID');
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          }
          process.exit(1);
        } else {
          log.warn('Connection closed, reconnecting in 5s');
          setTimeout(clientstart, 5000);
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
        const m = smsg(sock, mek);
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
    log.error('Fatal error: ' + error.message);
    console.error(error);
    process.exit(1);
  }
};

clientstart();
