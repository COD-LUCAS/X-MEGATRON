require('./library/console');
require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const log  = require('./library/console');

process.on('uncaughtException',  () => {});
process.on('unhandledRejection', () => {});

// ── Module-level state — never reset on reconnect ─────────
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
  if (!envId) { log.error('SESSION_ID missing'); process.exit(1); }

  if (saved.SESSION_ID && saved.SESSION_ID !== envId) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    fs.mkdirSync(sessionDir, { recursive: true });
    log.warn('Session changed — cleared');
  }
  fs.writeFileSync(SESSION_BACKUP, JSON.stringify({ SESSION_ID: envId }));

  const creds = path.join(sessionDir, 'creds.json');
  if (!fs.existsSync(creds)) {
    if (!envId.includes('~')) { log.error('SESSION_ID format: xmegatron~pastebin_id'); process.exit(1); }
    const pbId = envId.split('~').pop().trim();
    log.info('Downloading session...');
    try {
      const res = await axios.get(`https://pastebin.com/raw/${pbId}`, { timeout: 10000 });
      if (!res.data || typeof res.data !== 'object') { log.error('Bad session data'); process.exit(1); }
      fs.writeFileSync(creds, JSON.stringify(res.data, null, 2));
      log.success('Session saved');
    } catch (e) { log.error('Session download failed: ' + e.message); process.exit(1); }
  }
};

// ── Baileys ────────────────────────────────────────────────
let makeWASocket, useMultiFileAuthState, DisconnectReason,
    fetchLatestBaileysVersion, Browsers, jidDecode;

const loadBaileys = async () => {
  const B = await import('@whiskeysockets/baileys');
  makeWASocket             = B.default;
  useMultiFileAuthState    = B.useMultiFileAuthState;
  DisconnectReason         = B.DisconnectReason;
  fetchLatestBaileysVersion = B.fetchLatestBaileysVersion;
  Browsers                 = B.Browsers;
  jidDecode                = B.jidDecode;
};

const clientstart = async () => {
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
    logger:            require('pino')({ level: 'fatal' }),
    printQRInTerminal: false,
    browser:           Browsers.macOS('Chrome'),
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
      const DB = path.join(__dirname, 'database', 'group_settings.json');
      let db = {};
      try { if (fs.existsSync(DB)) db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (_) {}
      if (!db.__global?.anticall) return;
      for (const call of calls) {
        if (call.status !== 'offer') continue;
        const wl  = (db.__global.callWhitelist || '').split(',').filter(Boolean);
        const num = (call.from || '').split('@')[0];
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
        log.error('Logged out — get new SESSION_ID');
        process.exit(1);
      }
      log.warn(`Reconnecting (${code})...`);
      setTimeout(clientstart, 5000);
    }
  });

  // ── Message handler ───────────────────────────────────────
  const handler = require('./main');

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (type !== 'notify') return;
      const raw = messages[0];
      if (!raw?.message) return;

      // Dedup
      if (seenIds.has(raw.key.id)) return;
      seenIds.add(raw.key.id);
      if (seenIds.size > 300) seenIds.delete(seenIds.values().next().value);

      // Unwrap ephemeral
      raw.message = raw.message.ephemeralMessage?.message || raw.message;

      // Drop system types
      const mtype = Object.keys(raw.message)[0];
      if (SILENT_TYPES.has(mtype)) return;
      if (raw.messageStubType) return;

      // ── fromMe filter ──────────────────────────────────────
      // fromMe = the bot number itself sent this message.
      // Allow: stickers (bond trigger) + messages with a valid prefix
      // Block: everything else (reply echoes, media without prefix, empty)
      if (raw.key.fromMe) {
        const isSticker = mtype === 'stickerMessage';
        if (!isSticker) {
          const body = (
            raw.message?.conversation ||
            raw.message?.extendedTextMessage?.text ||
            raw.message?.imageMessage?.caption ||
            raw.message?.videoMessage?.caption || ''
          ).trim();
          if (!body) return; // empty echo — drop
          const pfx = (process.env.LIST_PREFIX || process.env.PREFIX || '.')
            .split(',').map(p => p.trim()).filter(Boolean);
          if (!pfx.some(p => body.startsWith(p))) return; // no prefix — bot reply echo — drop
        }
        // fromMe passes (owner command or sticker bond) — skip rate limit
        try {
          const { smsg } = require('./library/manager');
          const m = smsg(sock, raw);
          if (m) await handler(sock, m);
        } catch (_) {}
        return;
      }

      // ── Rate limit (non-fromMe only) ──────────────────────
      const rlKey = `${raw.key.participant || raw.key.remoteJid}::${raw.key.remoteJid}`;
      const now   = Date.now();
      if (rateMap.has(rlKey) && now - rateMap.get(rlKey) < RATE_MS) return;
      rateMap.set(rlKey, now);
      if (rateMap.size > 500) rateMap.delete(rateMap.keys().next().value);

      const { smsg } = require('./library/manager');
      const m = smsg(sock, raw);
      if (m) await handler(sock, m);
    } catch (_) {}
  });
};

clientstart();
