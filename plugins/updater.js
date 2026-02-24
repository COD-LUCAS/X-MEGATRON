const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const AdmZip = require('adm-zip');

const execAsync = promisify(exec);

const GITHUB_ZIP = 'https://github.com/COD-LUCAS/X-MEGATRON/archive/refs/heads/main.zip';
const GITHUB_RAW = 'https://raw.githubusercontent.com/COD-LUCAS/X-MEGATRON/main';

const SAFE_DIRS = ['database', 'session', '.env', 'config.js'];

function isSafe(itemPath) {
  for (const safe of SAFE_DIRS) {
    if (itemPath === safe || itemPath.startsWith(safe + '/') || itemPath.startsWith(safe + '\\')) {
      return true;
    }
  }
  return false;
}

async function getRemoteVersion() {
  try {
    const response = await axios.get(`${GITHUB_RAW}/version.json`, { timeout: 10000 });
    return response.data;
  } catch (error) {
    return null;
  }
}

function getLocalVersion() {
  try {
    const versionFile = path.join(__dirname, '..', 'version.json');
    if (fs.existsSync(versionFile)) {
      return JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    }
  } catch (e) {}
  return { version: '1.0.0', features: [] };
}

async function downloadUpdate() {
  const tempDir = path.join(__dirname, '..', 'update_temp');
  
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  const response = await axios.get(GITHUB_ZIP, {
    timeout: 30000,
    responseType: 'arraybuffer'
  });

  const zipPath = path.join(__dirname, '..', 'update.zip');
  fs.writeFileSync(zipPath, response.data);

  return zipPath;
}

async function extractUpdate(zipPath) {
  const tempDir = path.join(__dirname, '..', 'update_temp');
  
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tempDir, true);

  fs.unlinkSync(zipPath);

  const extracted = fs.readdirSync(tempDir)[0];
  return path.join(tempDir, extracted);
}

async function applyUpdate(extractedPath) {
  const rootDir = path.join(__dirname, '..');

  const newPackageJson = path.join(extractedPath, 'package.json');
  if (fs.existsSync(newPackageJson)) {
    const tempPackage = path.join(rootDir, 'package.json.update');
    fs.copyFileSync(newPackageJson, tempPackage);
    
    try {
      await execAsync('npm install --legacy-peer-deps');
    } catch (e) {
      console.log('NPM install during update:', e.message);
    }
    
    if (fs.existsSync(tempPackage)) {
      fs.unlinkSync(tempPackage);
    }
  }

  for (const item of fs.readdirSync(rootDir)) {
    if (item === 'update_temp') continue;
    if (item === 'node_modules') continue;
    if (isSafe(item)) continue;
    if (item.startsWith('.git')) continue;

    const itemPath = path.join(rootDir, item);
    
    try {
      if (fs.statSync(itemPath).isFile()) {
        fs.unlinkSync(itemPath);
      } else {
        fs.rmSync(itemPath, { recursive: true, force: true });
      }
    } catch (e) {}
  }

  for (const item of fs.readdirSync(extractedPath)) {
    if (isSafe(item)) continue;

    const src = path.join(extractedPath, item);
    const dst = path.join(rootDir, item);

    try {
      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dst, { recursive: true });
      } else {
        fs.copyFileSync(src, dst);
      }
    } catch (e) {}
  }

  const tempDir = path.join(rootDir, 'update_temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

let lastNotifiedVersion = null;

async function checkAndNotify(sock, ownerJid) {
  try {
    if (!ownerJid || !ownerJid.includes('@')) return;

    const local = getLocalVersion();
    const remote = await getRemoteVersion();

    if (!remote) return;

    if (remote.version === local.version) return;
    if (lastNotifiedVersion === remote.version) return;

    let msg = `*UPDATE AVAILABLE*\n\n`;
    msg += `_Current: v${local.version}_\n`;
    msg += `_Latest: v${remote.version}_\n\n`;

    if (remote.features?.length) {
      msg += `*New Features:*\n`;
      remote.features.forEach(f => msg += `_• ${f}_\n`);
      msg += `\n`;
    }

    msg += `_Use :update now to install_`;

    await sock.sendMessage(ownerJid, { text: msg });
    lastNotifiedVersion = remote.version;
  } catch (e) {
    console.error('Update notification error:', e.message);
  }
}

function startUpdateChecker(sock, ownerJid) {
  checkAndNotify(sock, ownerJid);
  setInterval(() => checkAndNotify(sock, ownerJid), 180000);
}

module.exports = {
  command: ['update', 'checkupdate'],
  owner: true,
  sudo: true,

  async execute(sock, m, context) {
    const { command, args } = context;

    if (command === 'checkupdate') {
      const statusMsg = await m.reply('_Checking for updates..._');

      const local = getLocalVersion();
      const remote = await getRemoteVersion();

      if (!remote) {
        return sock.sendMessage(m.chat, {
          text: '_Failed to check remote version_',
          edit: statusMsg.key
        });
      }

      if (remote.version === local.version) {
        return sock.sendMessage(m.chat, {
          text: `_Bot is up to date (v${local.version})_`,
          edit: statusMsg.key
        });
      }

      let msg = `*UPDATE AVAILABLE*\n\n`;
      msg += `_📦 Current: v${local.version}_\n`;
      msg += `_📦 GitHub: v${remote.version}_\n\n`;

      if (remote.features?.length) {
        msg += `*New Features:*\n`;
        remote.features.forEach(f => msg += `_• ${f}_\n`);
        msg += `\n`;
      }

      msg += `_Use :update now to install_`;

      return sock.sendMessage(m.chat, {
        text: msg,
        edit: statusMsg.key
      });
    }

    if (command === 'update') {
      const subCommand = args[0] ? args[0].toLowerCase() : '';

      if (subCommand !== 'now' && subCommand !== 'start') {
        return m.reply('_Use :checkupdate first, then :update now to install_');
      }

      const statusMsg = await m.reply('_Checking for updates..._');

      const local = getLocalVersion();
      const remote = await getRemoteVersion();

      if (!remote) {
        return sock.sendMessage(m.chat, {
          text: '_Failed to check remote version_',
          edit: statusMsg.key
        });
      }

      if (remote.version === local.version) {
        return sock.sendMessage(m.chat, {
          text: '_Already on the same version_',
          edit: statusMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: '_⬇️ Downloading update..._',
        edit: statusMsg.key
      });

      let zipPath;
      try {
        zipPath = await downloadUpdate();
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Download failed: ${error.message}_`,
          edit: statusMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: '_📦 Extracting update..._',
        edit: statusMsg.key
      });

      let extractedPath;
      try {
        extractedPath = await extractUpdate(zipPath);
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Extraction failed: ${error.message}_`,
          edit: statusMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: '_♻️ Updating files..._',
        edit: statusMsg.key
      });

      try {
        await applyUpdate(extractedPath);
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Update failed: ${error.message}_`,
          edit: statusMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: `_✅ Update successful! (v${local.version} → v${remote.version})_\n\n_⚠️ Protected: database/, session/, .env_\n\n_Restarting bot..._`,
        edit: statusMsg.key
      });

      setTimeout(() => process.exit(0), 2000);
    }
  },

  init: (sock, ownerNumbers) => {
    if (ownerNumbers?.length > 0) {
      const extractDigits = (jid) => {
        if (!jid) return '';
        return jid.split('@')[0].replace(/\D/g, '');
      };

      let ownerJid = ownerNumbers[0];
      
      if (!ownerJid.includes('@')) {
        ownerJid = extractDigits(ownerJid) + '@s.whatsapp.net';
      }

      if (ownerJid && ownerJid.includes('@')) {
        startUpdateChecker(sock, ownerJid);
      }
    }
  }
};
