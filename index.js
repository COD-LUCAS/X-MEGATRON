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

    // ── Anticall ──────────────────────────────────────────────
    sock.ev.on('call', async (calls) => {
      try {
        const fs   = require('fs');
        const path = require('path');
        const DB   = path.join(__dirname, 'database', 'group_settings.json');
        let db = {};
        try { if (fs.existsSync(DB)) db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (_) {}
        if (!db.__global?.anticall) return;

        for (const call of calls) {
          if (call.status !== 'offer') continue;
          const whitelist = (db.__global.callWhitelist || '').split(',').filter(Boolean);
          const callerNum = call.from?.split('@')[0] || '';
          if (whitelist.some(n => callerNum.endsWith(n.replace(/\D/g,'').slice(-10)))) continue;

          await sock.rejectCall(call.id, call.from).catch(() => {});

          const msg = db.__global.callRejectMsg;
          if (msg) {
            await sock.sendMessage(call.from, { text: msg }).catch(() => {});
          }
        }
      } catch (_) {}
    });

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

    // Silent system message types — defined once, not rebuilt on each message
    const SILENT_TYPES = new Set([
      'protocolMessage',              // delivery receipts, message revokes
      'senderKeyDistributionMessage', // signal key sync
      'reactionMessage',              // emoji reactions
      'pollUpdateMessage',            // poll votes
      'groupV2Change',                // group setting changes
      'groupNotification',            // join/leave (legacy)
      'liveLocationMessage',          // live location pings
      'callLogMesssage',              // missed call logs
      'stickerSyncRmrMessage',        // sticker sync
      'keepInChatMessage',            // keep-in-chat pins
    ]);

    // Dedup set — prevents double-processing (Baileys sometimes fires twice)
    const processedIds = new Set();

    // Rate limiter — 1 message per second per sender+chat
    const rateLimitMap = new Map();
    const RATE_LIMIT_MS = 1000;

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        if (type !== 'notify') return;

        const mek = messages[0];
        if (!mek?.message) return;

        // Dedup — skip already-processed message IDs
        const msgId = mek.key.id;
        if (processedIds.has(msgId)) return;
        processedIds.add(msgId);
        if (processedIds.size > 200) {
          processedIds.delete(processedIds.values().next().value);
        }

        // Unwrap ephemeral wrapper safely
        mek.message = mek.message.ephemeralMessage?.message || mek.message;

        // Drop silent system/protocol message types — no real body, no point processing
        const msgType = Object.keys(mek.message)[0];
        if (SILENT_TYPES.has(msgType)) return;

        // Drop group stub events (join/leave/promote/demote/etc.)
        if (mek.messageStubType) return;

        // ── fromMe filter ──────────────────────────────────────
        // fromMe = message sent BY the bot number itself.
        // Three cases:
        //   no body          → silent echo of bot's own sent msg  → DROP
        //   body, no prefix  → echo of bot's reply text           → DROP
        //   body, has prefix → owner typed a command              → ALLOW
        if (mek.key.fromMe) {
          const rawBody = (
            mek.message?.conversation ||
            mek.message?.extendedTextMessage?.text ||
            mek.message?.imageMessage?.caption ||
            mek.message?.videoMessage?.caption ||
            ''
          ).trim();
          if (!rawBody) return;
          const pfxList = (process.env.LIST_PREFIX || process.env.PREFIX || '.')
            .split(',').map(p => p.trim()).filter(Boolean);
          if (!pfxList.some(p => rawBody.startsWith(p))) return;
          // fromMe command passes — skip rate limit (owner should never be throttled)
          const { smsg } = require('./library/manager');
          const m = await smsg(sock, mek);
          return require('./main')(sock, m);
        }

        // ── Rate limit — non-fromMe messages only ───────────────
        const sender = mek.key.participant || mek.key.remoteJid || '';
        const chat = mek.key.remoteJid || '';
        const rlKey = `${sender}::${chat}`;
        const now = Date.now();
        if (rateLimitMap.has(rlKey) && now - rateLimitMap.get(rlKey) < RATE_LIMIT_MS) return;
        rateLimitMap.set(rlKey, now);
        if (rateLimitMap.size > 500) {
          rateLimitMap.delete(rateLimitMap.keys().next().value);
        }

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