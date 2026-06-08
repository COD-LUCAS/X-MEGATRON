
'use strict';

const fs   = require('fs');
const path = require('path');
const axios = require('axios');

const GITHUB_ZIP = 'https://github.com/COD-LUCAS/X-MEGATRON/archive/refs/heads/main.zip';
const GITHUB_RAW = 'https://raw.githubusercontent.com/COD-LUCAS/X-MEGATRON/main';

const PROTECTED = ['database', 'session', 'sessions', 'node_modules', '.env', 'config.js', '.git', 'temp'];

function isProtected(item) {
  return PROTECTED.some(p => item === p || item.startsWith(p + '/') || item.startsWith(p + '\\'));
}

async function getRemoteVersion() {
  try {
    const { data } = await axios.get(`${GITHUB_RAW}/version.json`, { timeout: 10000 });
    return data;
  } catch (e) { return null; }
}

function getLocalVersion() {
  try {
    const f = path.join(__dirname, '..', 'version.json');
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {}
  return { version: '0.0.0', features: [] };
}

async function downloadAndUpdate() {
  const rootDir = path.join(__dirname, '..');
  const tempZip = path.join(rootDir, 'update.zip');
  const tempDir = path.join(rootDir, 'update_temp');

  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  // Download zip with axios (no unzip shell command needed)
  const res = await axios.get(GITHUB_ZIP, { responseType: 'arraybuffer', timeout: 60000 });
  fs.writeFileSync(tempZip, Buffer.from(res.data));

  // Extract using adm-zip (already in package.json)
  const AdmZip = require('adm-zip');
  const zip    = new AdmZip(tempZip);
  zip.extractAllTo(tempDir, true);
  fs.unlinkSync(tempZip);

  // Find extracted folder (X-MEGATRON-main)
  const extractedFolder = fs.readdirSync(tempDir).find(f => f.startsWith('X-MEGATRON'));
  if (!extractedFolder) throw new Error('Extracted folder not found');
  const extractedPath = path.join(tempDir, extractedFolder);

  // Check if package.json changed
  let packageChanged = false;
  const oldPkg = path.join(rootDir, 'package.json');
  const newPkg = path.join(extractedPath, 'package.json');
  if (fs.existsSync(oldPkg) && fs.existsSync(newPkg)) {
    packageChanged = fs.readFileSync(oldPkg, 'utf8') !== fs.readFileSync(newPkg, 'utf8');
  }

  // Delete old non-protected files
  for (const item of fs.readdirSync(rootDir)) {
    if (item === 'update_temp') continue;
    if (isProtected(item)) continue;
    const itemPath = path.join(rootDir, item);
    try {
      if (fs.statSync(itemPath).isDirectory()) fs.rmSync(itemPath, { recursive: true, force: true });
      else fs.unlinkSync(itemPath);
    } catch (e) {}
  }

  // Copy new files
  for (const item of fs.readdirSync(extractedPath)) {
    if (isProtected(item) && item !== 'package.json') continue;
    const src = path.join(extractedPath, item);
    const dst = path.join(rootDir, item);
    try {
      if (fs.statSync(src).isDirectory()) fs.cpSync(src, dst, { recursive: true });
      else fs.copyFileSync(src, dst);
    } catch (e) {}
  }

  fs.rmSync(tempDir, { recursive: true, force: true });

  if (packageChanged) {
    const { execSync } = require('child_process');
    try { execSync('npm install --production', { cwd: rootDir, stdio: 'inherit' }); } catch (e) {}
  }
}

let lastNotifiedVersion = null;

async function checkAndNotify(sock, ownerJid) {
  try {
    if (!ownerJid?.includes('@')) return;
    const local  = getLocalVersion();
    const remote = await getRemoteVersion();
    if (!remote || remote.version === local.version) return;
    if (lastNotifiedVersion === remote.version) return;

    let msg = `*UPDATE AVAILABLE*\n\n_Current: v${local.version}_\n_Latest: v${remote.version}_\n\n`;
    if (remote.features?.length) {
      msg += `*New Features:*\n`;
      remote.features.forEach(f => msg += `_• ${f}_\n`);
      msg += '\n';
    }
    msg += `_Use .update now to install_`;

    await sock.sendMessage(ownerJid, { text: msg });
    lastNotifiedVersion = remote.version;
  } catch (e) {}
}

module.exports = {
  command:  ['update', 'checkupdate', 'hardupdate'],
  owner:    true,
  sudo:     true,
  category: 'app',

  async execute(sock, m, ctx) {
    const { command, args } = ctx;

    if (command === 'checkupdate' || (command === 'update' && !args[0])) {
      const statusMsg = await m.reply('_checking for updates..._');
      const local     = getLocalVersion();
      const remote    = await getRemoteVersion();

      if (!remote) {
        return sock.sendMessage(m.chat, { text: '_failed to fetch remote version_', edit: statusMsg.key });
      }
      if (remote.version === local.version) {
        return sock.sendMessage(m.chat, { text: `_✅ up to date (v${local.version})_`, edit: statusMsg.key });
      }

      let msg = `*UPDATE AVAILABLE*\n\n_📦 current: v${local.version}_\n_📦 latest: v${remote.version}_\n\n`;
      if (remote.features?.length) {
        msg += `*new features:*\n`;
        remote.features.forEach(f => msg += `_• ${f}_\n`);
        msg += '\n';
      }
      msg += `_use .update now to install_`;
      return sock.sendMessage(m.chat, { text: msg, edit: statusMsg.key });
    }

    if (command === 'update' && args[0] === 'now') {
      const local  = getLocalVersion();
      const remote = await getRemoteVersion();
      if (!remote) return m.reply('_failed to fetch remote version_');
      if (remote.version === local.version) return m.reply('_already on latest. use .hardupdate to force_');

      await m.reply(`_updating v${local.version} → v${remote.version}..._`);
      downloadAndUpdate()
        .then(() => process.exit(0))
        .catch(e => m.reply(`_❌ update failed: ${e.message}_`));
      return;
    }

    if (command === 'hardupdate') {
      await m.reply('_⚠️ force updating from github..._');
      downloadAndUpdate()
        .then(() => process.exit(0))
        .catch(e => m.reply(`_❌ update failed: ${e.message}_`));
      return;
    }
  },

  init: (sock, ownerNumbers) => {
    if (!ownerNumbers?.length) return;
    let ownerJid = ownerNumbers[0];
    if (!ownerJid.includes('@')) ownerJid = ownerJid.replace(/\D/g, '') + '@s.whatsapp.net';
    if (!ownerJid.includes('@')) return;
    checkAndNotify(sock, ownerJid);
    setInterval(() => checkAndNotify(sock, ownerJid), 180000);
  }
};
