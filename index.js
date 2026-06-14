require('./library/console');
require('dotenv').config();

const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const log   = require('./library/console');

process.on('uncaughtException',  (e) => log.error('UncaughtException: '  + e.message));
process.on('unhandledRejection', (e) => log.error('UnhandledRejection: ' + (e?.message || e)));

try {
  const extDir = path.join(__dirname, 'database', 'external_plugins');
  if (fs.existsSync(extDir)) {
    fs.readdirSync(extDir).filter(f => f.startsWith('rt_') && f.endsWith('.js'))
      .forEach(f => { try { fs.unlinkSync(path.join(extDir, f)); } catch (_) {} });
  }
  const dbDir = path.join(__dirname, 'database');
  if (fs.existsSync(dbDir)) {
    fs.readdirSync(dbDir)
      .filter(f => f.startsWith('eval_') && (f.endsWith('.txt') || f.endsWith('.js')))
      .forEach(f => { try { fs.unlinkSync(path.join(dbDir, f)); } catch (_) {} });
  }
} catch (_) {}

const customTemp = path.join(process.cwd(), 'temp');
if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });
process.env.TMPDIR = customTemp;
process.env.TEMP   = customTemp;
process.env.TMP    = customTemp;

setInterval(() => {
  fs.readdir(customTemp, (err, files) => {
    if (err) return;
    for (const file of files) {
      const fp = path.join(customTemp, file);
      fs.stat(fp, (err, stats) => {
        if (!err && Date.now() - stats.mtimeMs > 3 * 60 * 60 * 1000) fs.unlink(fp, () => {});
      });
    }
  });
}, 3 * 60 * 60 * 1000);

setInterval(() => {
  const used = process.memoryUsage().rss / 1024 / 1024;
  if (used > 400) { log.warn(`RAM ${used.toFixed(0)}MB > 400MB — restarting`); process.exit(1); }
}, 30000);

const SILENT_TYPES = new Set([
  'protocolMessage', 'senderKeyDistributionMessage', 'reactionMessage',
  'pollUpdateMessage', 'groupV2Change', 'groupNotification',
  'liveLocationMessage', 'callLogMesssage', 'stickerSyncRmrMessage',
  'keepInChatMessage',
]);

const seenIds = new Set();
const rateMap = new Map();
const RATE_MS = 1000;

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

let makeWASocket, useMultiFileAuthState, DisconnectReason,
    fetchLatestBaileysVersion, Browsers, jidDecode;

const loadBaileys = async () => {
  const B = await import('@itsliaaa/baileys');
  makeWASocket              = B.default;
  useMultiFileAuthState     = B.useMultiFileAuthState;
  DisconnectReason          = B.DisconnectReason;
  fetchLatestBaileysVersion = B.fetchLatestBaileysVersion;
  Browsers                  = B.Browsers;
  jidDecode                 = B.jidDecode;
};

const GROUP_EVENTS_DB   = path.join(__dirname, 'database', 'group_events.json');
const loadGroupEventsDB = () => {
  try { if (fs.existsSync(GROUP_EVENTS_DB)) return JSON.parse(fs.readFileSync(GROUP_EVENTS_DB, 'utf8')); } catch (_) {}
  return {};
};

const start = async () => {
  await loadBaileys();

  const cfg        = require('./config');
  const sessionDir = path.join(__dirname, cfg.session || 'sessions');
  await initSession(sessionDir);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version }          = await fetchLatestBaileysVersion();
  log.info(`Baileys ${version.join('.')}`);

  const sock = makeWASocket({
    auth: state, version,
    logger: require('pino')({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.macOS('Safari'),
    getMessage: async () => ({ conversation: '' }),
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
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

  const antiCallNotified = new Set();
  sock.ev.on('call', async (calls) => {
    try {
      const DB = path.join(__dirname, 'database', 'group_settings.json');
      let db = {};
      try { if (fs.existsSync(DB)) db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (_) {}
      if (!db.__global?.anticall) return;
      for (const call of calls) {
        if (call.status !== 'offer') continue;
        const wl  = (db.__global.callWhitelist || '').split(',').filter(Boolean);
        const num = call.from?.split('@')[0] || '';
        if (wl.some(n => num.endsWith(n.replace(/\D/g, '').slice(-10)))) continue;
        try { if (typeof sock.rejectCall === 'function') await sock.rejectCall(call.id, call.from).catch(() => {}); } catch (_) {}
        if (!antiCallNotified.has(call.from)) {
          antiCallNotified.add(call.from);
          setTimeout(() => antiCallNotified.delete(call.from), 60000);
          const msg = db.__global.callRejectMsg || '_anticall is enabled. your call was rejected_';
          await sock.sendMessage(call.from, { text: msg }).catch(() => {});
        }
      }
    } catch (_) {}
  });

  sock.ev.on('group-participants.update', async ({ id, participants, action, author }) => {
    try {
      const db      = loadGroupEventsDB();
      const groupDb = db[id] || {};
      let groupName = id;
      try { const meta = await sock.groupMetadata(id); groupName = meta.subject || id; } catch (_) {}

      if (action === 'add' && groupDb.welcome?.enabled) {
        const template = groupDb.welcome.message || '{user} joined {group}';
        for (const jid of participants) {
          const jidStr   = typeof jid === 'string' ? jid : (jid.id || String(jid));
          const user     = jidStr.split('@')[0];
          const finalMsg = '_' + template.replace(/{user}/g, `@${user}`).replace(/{group}/g, groupName) + '_';
          if (!finalMsg || finalMsg.trim() === '__') continue;
          await sock.sendMessage(id, { text: finalMsg, mentions: [jidStr] }).catch(() => {});
        }
      }

      if ((action === 'remove' || action === 'leave') && groupDb.goodbye?.enabled) {
        const template = groupDb.goodbye.message || '{user} left {group}';
        for (const jid of participants) {
          const jidStr   = typeof jid === 'string' ? jid : (jid.id || String(jid));
          const user     = jidStr.split('@')[0];
          const finalMsg = '_' + template.replace(/{user}/g, `@${user}`).replace(/{group}/g, groupName) + '_';
          if (!finalMsg || finalMsg.trim() === '__') continue;
          await sock.sendMessage(id, { text: finalMsg, mentions: [jidStr] }).catch(() => {});
        }
      }

      if (action === 'promote' || action === 'demote') {
        let gsDb = {};
        try {
          const gsFile = path.join(__dirname, 'database', 'group_settings.json');
          if (fs.existsSync(gsFile)) gsDb = JSON.parse(fs.readFileSync(gsFile, 'utf8'));
        } catch (_) {}
        if (gsDb[id]?.pdm) {
          const verb = action === 'promote' ? 'promoted as admin' : 'demoted as admin';
          for (const jid of participants) {
            const jidStr   = typeof jid === 'string' ? jid : (jid.id || String(jid));
            const mentions = [jidStr];
            if (author) mentions.push(author);
            const byText = author ? ` by @${author.split('@')[0]}` : '';
            await sock.sendMessage(id, {
              text: `@${jidStr.split('@')[0]} _${verb}${byText}_`,
              mentions
            }).catch(() => {});
          }
        }
      }
    } catch (e) { log.error('group-participants.update error: ' + e.message); }
  });

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
      if (code === DisconnectReason.loggedOut) { log.error('Logged out — get a new SESSION_ID'); process.exit(1); }
      log.warn(`Reconnecting (${code})...`);
      setTimeout(start, 5000);
    }
  });

  const handler = require('./main');

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const raw = messages[0];
    if (!raw?.message) return;
    if (!raw?.key?.id) return;

    if (raw.key?.id?.startsWith('BAE5') && raw.key.id.length === 16) return;
    if (raw.key.remoteJid === 'status@broadcast') return;

    // Dedup by message ID
    if (seenIds.has(raw.key.id)) return;
    seenIds.add(raw.key.id);
    if (seenIds.size > 500) seenIds.delete(seenIds.values().next().value);

    // ── fromMe filter ─────────────────────────────────────────────
    // We need to let through:
    //   1. Sticker messages (bond trigger from owner's device)
    //   2. Commands with prefix (.ping, .menu etc)
    //   3. Number replies (1, 2, 100) for handleText flows (spotify, fancychecker)
    //   4. > eval shorthand
    // We must BLOCK:
    //   - Bot-generated responses (warnings, media sends etc) → causes null spam loops
    if (raw.key.fromMe) {
      const isSticker = !!raw.message?.stickerMessage;
      if (!isSticker) {
        const selfBody = (
          raw.message?.conversation?.trim() ||
          raw.message?.extendedTextMessage?.text?.trim() ||
          ''
        );
        if (!selfBody) return; // empty bot message — drop

        const cfgPrefixes = (process.env.LIST_PREFIX || process.env.PREFIX || '.').split(',').map(p => p.trim());
        const hasPrefix   = cfgPrefixes.some(p => selfBody.startsWith(p));
        const hasEval     = selfBody.trimStart().startsWith('>');
        const isNumber    = /^\d+$/.test(selfBody); // number reply for spotify/fancychecker

        // Drop anything that isn't a command, eval, or number reply
        if (!hasPrefix && !hasEval && !isNumber) return;
      }
    }

    if (raw.message.ephemeralMessage) {
      raw.message = raw.message.ephemeralMessage.message;
    }

    const mtype = Object.keys(raw.message)[0];
    if (SILENT_TYPES.has(mtype)) return;
    if (raw.messageStubType) return;

    const messageContent = (
      raw.message.conversation?.trim() ||
      raw.message.extendedTextMessage?.text?.trim() ||
      raw.message.imageMessage?.caption?.trim() ||
      raw.message.videoMessage?.caption?.trim() ||
      raw.message.documentMessage?.caption?.trim() ||
      raw.message.buttonsResponseMessage?.selectedButtonId?.trim() ||
      raw.message.templateButtonReplyMessage?.selectedId?.trim() ||
      ''
    );

    const isMediaMsg = !!(
      raw.message.stickerMessage ||
      raw.message.imageMessage   ||
      raw.message.videoMessage   ||
      raw.message.audioMessage   ||
      raw.message.documentMessage
    );

    if (!isMediaMsg && !messageContent) return;

    // Rate limiting — non-bot messages only
    if (!raw.key.fromMe) {
      const rlKey = `${raw.key.participant || raw.key.remoteJid}::${raw.key.remoteJid}`;
      const now   = Date.now();
      if (rateMap.has(rlKey) && now - rateMap.get(rlKey) < RATE_MS) return;
      rateMap.set(rlKey, now);
      if (rateMap.size > 500) rateMap.delete(rateMap.keys().next().value);
    }

    try {
      const { smsg } = require('./library/manager');
      const m = smsg(sock, raw);
      if (!m) return;
      await handler(sock, m);
    } catch (err) {
      log.error(`Error handling message: ${err.message}`);
    }
  });
};

start();
