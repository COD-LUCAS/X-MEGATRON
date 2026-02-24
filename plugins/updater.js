const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GITHUB_ZIP = 'https://github.com/COD-LUCAS/X-MEGATRON/archive/refs/heads/main.zip';
const GITHUB_RAW = 'https://raw.githubusercontent.com/COD-LUCAS/X-MEGATRON/main';

const SAFE_DIRS = ['database', 'session', '.env', 'config.js', 'node_modules'];

function isSafe(itemPath) {
  for (const safe of SAFE_DIRS) {
    if (itemPath === safe || itemPath.startsWith(safe + '/') || itemPath.startsWith(safe + '\\')) {
      return true;
    }
  }
  return false;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'X-MEGATRON-Bot' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = Buffer.alloc(0);
      res.on('data', chunk => data = Buffer.concat([data, chunk]));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getRemoteVersion() {
  try {
    const url = `${GITHUB_RAW}/version.json?t=${Date.now()}`;
    const data = await httpsGet(url);
    return JSON.parse(data.toString());
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
  const data = await httpsGet(GITHUB_ZIP);
  const zipPath = path.join(__dirname, '..', 'update.zip');
  fs.writeFileSync(zipPath, data);
  return zipPath;
}

function extractUpdate(zipPath) {
  const tempDir = path.join(__dirname, '..', 'update_temp');
  
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    execSync(`unzip -q "${zipPath}" -d "${tempDir}"`, { stdio: 'ignore' });
  } catch (e) {
    throw new Error('Unzip failed. Install unzip: apt-get install unzip');
  }

  fs.unlinkSync(zipPath);

  const extracted = fs.readdirSync(tempDir)[0];
  return path.join(tempDir, extracted);
}

function applyUpdate(extractedPath) {
  const rootDir = path.join(__dirname, '..');

  for (const item of fs.readdirSync(rootDir)) {
    if (item === 'update_temp') continue;
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
  } catch (e) {}
}

function startUpdateChecker(sock, ownerJid) {
  checkAndNotify(sock, ownerJid);
  setInterval(() => checkAndNotify(sock, ownerJid), 180000);
}

module.exports = {
  command: ['update', 'checkupdate', 'hardupdate'],
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

    if (command === 'hardupdate') {
      const statusMsg = await m.reply('_⚠️ Force updating from GitHub..._');

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
        extractedPath = extractUpdate(zipPath);
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ ${error.message}_`,
          edit: statusMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: '_♻️ Updating files..._',
        edit: statusMsg.key
      });

      try {
        applyUpdate(extractedPath);
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Update failed: ${error.message}_`,
          edit: statusMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: `_✅ Hard update successful!_\n\n_⚠️ Protected: database/, session/, .env, node_modules/_\n\n_Restarting in 3 seconds..._`,
        edit: statusMsg.key
      });

      setTimeout(() => process.exit(0), 3000);
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
          text: '_Already on the same version. Use :hardupdate to force update_',
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
        extractedPath = extractUpdate(zipPath);
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ ${error.message}_`,
          edit: statusMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: '_♻️ Updating files..._',
        edit: statusMsg.key
      });

      try {
        applyUpdate(extractedPath);
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Update failed: ${error.message}_`,
          edit: statusMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: `_✅ Update successful! (v${local.version} → v${remote.version})_\n\n_⚠️ Protected: database/, session/, .env, node_modules/_\n\n_Restarting in 3 seconds..._`,
        edit: statusMsg.key
      });

      setTimeout(() => process.exit(0), 3000);
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
