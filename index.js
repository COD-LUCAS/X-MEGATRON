require('./library/console');
require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const log  = require('./library/console');

process.on('uncaughtException',  () => {});
process.on('unhandledRejection', () => {});

// ── Module-level state — survives reconnects ──────────────
const SILENT_TYPES = new Set([
  'protocolMessage', 'senderKeyDistributionMessage', 'reactionMessage',
  'pollUpdateMessage', 'groupV2Change', 'groupNotification',
  'liveLocationMessage', 'callLogMesssage', 'stickerSyncRmrMessage',
  'keepInChatMessage',
]);

const seenIds  = new Set();
const rateMap  = new Map();
const RATE_MS  = 1000;

// ── Session ────────────────────────────────────────────────
const SESSION_BACKUP = path.join(__dirname, 'library', 'session.json');

const initSession = async (sessionDir) => {
  fs.mkdirSync(path.join(__dirname, 'library'), { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(SESSION_BACKUP, 'utf8')); } catch (_) {}

  const envId = (process.env.SESSION_ID || '').trim();
  if (!envId) { log.error('SESSION_ID missing in .env'); process.exit(1); }

  if (saved.SESSION_ID && saved.SESSION_ID !== envId) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    fs.mkdirSync(sessionDir, { recursive: true });
    log.warn('Session changed — cleared old session');
  }

  fs.writeFileSync(SESSION_BACKUP, JSON.stringify({ SESSION_ID: envId }));

  const credsFile = path.join(sessionDir, 'creds.json');
  if (!fs.existsSync(credsFile)) {
    if (!envId.includes('~')) { log.error('SESSION_ID must be: xmegatron~pastebin_id'); process.exit(1); }
    const pbId = envId.split('~').pop().trim();
    log.info('Downloading session...');
    try {
      const res = await axios.get(`https://pastebin.com/raw/${pbId}`, { timeout: 15000 });
      if (!res.data || typeof res.data !== 'object') { log.error('Bad session data'); process.exit(1); }
      fs.writeFileSync(credsFile, JSON.stringify(res.data, null, 2));
      log.success('Session saved');
    } catch (e) { log.error('Session download failed: ' + e.message); process.exit(1); }
  }
};

// ── Baileys ────────────────────────────────────────────────
let makeWASocket, useMultiFileAuthState, DisconnectReason,
    fetchLatestBaileysVersion, Browsers, jidDecode;

const loadBaileys = async () => {
  const B = await import('@itsliaaa/baileys');
  makeWASocket             = B.default;
  useMultiFileAuthState    = B.useMultiFileAuthState;
  DisconnectReason         = B.DisconnectReason;
  fetchLatestBaileysVersion = B.fetchLatestBaileysVersion;
  Browsers                 = B.Browsers;
  jidDecode                = B.jidDecode;
};

// ── Start ──────────────────────────────────────────────────
const start = async () => {
  await loadBaileys();

  const cfg        = require('./config');
  const sessionDir = path.join(__dirname, cfg.session || 'sessions');

  await initSession(sessionDir);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version }          = await fetchLatestBaileysVersion();

  log.info(`Baileys ${version.join('.')}`);

  const sock = makeWASocket({
    auth:              state,
    version,
    logger:            require('pino')({ level: 'silent' }),
    printQRInTerminal: false,
    browser:           Browsers.macOS('Safari'),
    getMessage:        async () => ({ conversation: '' }),
    generateHighQualityLinkPreview: false,
    syncFullHistory:   false,
  });

  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      const d = jidDecode(jid) || {};
      return d.user && d.server ? `${d.user}@${d.server}` : jid;
    }
    return jid;
  };

  sock.ev.on('creds.update', saveCreds);

  // ── Anticall ──────────────────────────────────────────────
  sock.ev.on('call', async (calls) => {
    try {
      const DB  = path.join(__dirname, 'database', 'group_settings.json');
      let db = {};
      try { if (fs.existsSync(DB)) db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (_) {}
      if (!db.__global?.anticall) return;
      for (const call of calls) {
        if (call.status !== 'offer') continue;
        const wl  = (db.__global.callWhitelist || '').split(',').filter(Boolean);
        const num = call.from?.split('@')[0] || '';
        if (wl.some(n => num.endsWith(n.replace(/\D/g, '').slice(-10)))) continue;
        await sock.rejectCall(call.id, call.from).catch(() => {});
        if (db.__global.callRejectMsg) {
          await sock.sendMessage(call.from, { text: db.__global.callRejectMsg }).catch(() => {});
        }
      }
    } catch (_) {}
  });

  // ── Connection ────────────────────────────────────────────
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      log.success(`Connected as +${sock.user?.id?.split(':')[0]}`);
      try {
        const upd = require('./plugins/updater');
        if (upd.init) {
          const owners = (process.env.OWNER || '').split(',').map(v => v.trim()).filter(Boolean);
          if (owners.length) upd.init(sock, owners);
        }
      } catch (_) {}
      try {
        const sp = path.join(__dirname, 'plugins', 'startup.js');
        if (fs.existsSync(sp)) require('./plugins/startup').execute(sock);
      } catch (_) {}
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        log.error('Logged out — get a new SESSION_ID');
        process.exit(1);
      }
      log.warn(`Reconnecting (${code})...`);
      setTimeout(start, 5000);
    }
  });

  // ── Message handler ───────────────────────────────────────
  const handler = require('./main');

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const raw = messages[0];
    if (!raw?.message) return;

    // Unwrap ephemeral
    if (raw.message.ephemeralMessage) {
      raw.message = raw.message.ephemeralMessage.message;
    }

    // Drop system types
    const mtype = Object.keys(raw.message)[0];
    if (SILENT_TYPES.has(mtype)) return;
    if (raw.messageStubType) return;

    // IMPORTANT: For fromMe messages, skip dedup and rate limit
    // This ensures bot commands work properly
    if (!raw.key.fromMe) {
      // Dedup only for incoming messages
      if (seenIds.has(raw.key.id)) return;
      seenIds.add(raw.key.id);
      if (seenIds.size > 300) seenIds.delete(seenIds.values().next().value);

      // Rate limit only for incoming messages
      const rlKey = `${raw.key.participant || raw.key.remoteJid}::${raw.key.remoteJid}`;
      const now   = Date.now();
      if (rateMap.has(rlKey) && now - rateMap.get(rlKey) < RATE_MS) return;
      rateMap.set(rlKey, now);
      if (rateMap.size > 500) rateMap.delete(rateMap.keys().next().value);
    }

    // Process all messages (both fromMe and others)
    try {
      const { smsg } = require('./library/manager');
      const m = smsg(sock, raw);
      if (m) {
        // Log to see if messages are being received
        if (raw.key.fromMe) {
          log.debug(`Processing fromMe message in ${m.isGroup ? 'group' : 'private'}: ${m.body?.substring(0, 50)}`);
        }
        await handler(sock, m);
      }
    } catch (err) {
      log.error(`Error handling message: ${err.message}`);
    }
  });
};

start();