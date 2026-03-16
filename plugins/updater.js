const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

const GITHUB_ZIP = 'https://github.com/COD-LUCAS/X-MEGATRON/archive/refs/heads/main.zip';
const GITHUB_RAW = 'https://raw.githubusercontent.com/COD-LUCAS/X-MEGATRON/main';

// Files/folders to protect from deletion
const PROTECTED = ['database', 'session', 'node_modules', '.env', 'config.js', '.git'];

function isProtected(itemPath) {
  for (const safe of PROTECTED) {
    if (itemPath === safe || itemPath.startsWith(safe + '/') || itemPath.startsWith(safe + '\\')) {
      return true;
    }
  }
  return false;
}

async function getRemoteVersion() {
  try {
    const { stdout } = await execAsync(`curl -sL --max-time 5 "${GITHUB_RAW}/version.json"`);
    return JSON.parse(stdout);
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
  return { version: '0.0.0', features: [] };
}

async function downloadAndUpdate() {
  const rootDir = path.join(__dirname, '..');
  const tempZip = path.join(rootDir, 'update.zip');
  const tempDir = path.join(rootDir, 'update_temp');

  // Clean temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  // Download update
  await execAsync(`curl -L --max-time 30 "${GITHUB_ZIP}" -o "${tempZip}"`);

  // Extract
  await execAsync(`unzip -o -q "${tempZip}" -d "${tempDir}"`);
  fs.unlinkSync(tempZip);

  const extractedFolder = fs.readdirSync(tempDir).find(f => f.startsWith('X-MEGATRON'));
  const extractedPath = path.join(tempDir, extractedFolder);

  // Check if package.json changed
  let packageChanged = false;
  const oldPackagePath = path.join(rootDir, 'package.json');
  const newPackagePath = path.join(extractedPath, 'package.json');

  if (fs.existsSync(oldPackagePath) && fs.existsSync(newPackagePath)) {
    const oldPackage = fs.readFileSync(oldPackagePath, 'utf8');
    const newPackage = fs.readFileSync(newPackagePath, 'utf8');
    packageChanged = oldPackage !== newPackage;
  }

  // Delete old files (except protected)
  for (const item of fs.readdirSync(rootDir)) {
    if (item === 'update_temp') continue;
    if (isProtected(item)) continue;

    const itemPath = path.join(rootDir, item);
    try {
      if (fs.statSync(itemPath).isDirectory()) {
        fs.rmSync(itemPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(itemPath);
      }
    } catch (e) {}
  }

  // Copy new files
  for (const item of fs.readdirSync(extractedPath)) {
    if (isProtected(item) && item !== 'package.json') continue; // Allow package.json update

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

  // Clean up temp
  fs.rmSync(tempDir, { recursive: true, force: true });

  // Install new dependencies if package.json changed
  if (packageChanged) {
    console.log('📦 package.json changed, running npm install...');
    try {
      await execAsync('npm install --production', { cwd: rootDir });
      console.log('✅ Dependencies installed successfully');
    } catch (e) {
      console.error('❌ npm install failed:', e.message);
    }
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

    msg += `_Use .update now to install_`;

    await sock.sendMessage(ownerJid, { text: msg });
    lastNotifiedVersion = remote.version;
  } catch (e) {}
}

function startUpdateChecker(sock, ownerJid) {
  checkAndNotify(sock, ownerJid);
  setInterval(() => checkAndNotify(sock, ownerJid), 180000); // Every 3 minutes
}

module.exports = {
  command: ['update', 'checkupdate', 'hardupdate'],
  owner: true,
  sudo: true,
  category: 'owner',

  async execute(sock, m, context) {
    const { command, args } = context;

    if (command === 'update' && args[0] !== 'now') {
      return m.reply('_Use .checkupdate first, then .update now_');
    }

    if (command === 'checkupdate' || (command === 'update' && !args[0])) {
      const statusMsg = await m.reply('_Checking for updates..._');

      const local = getLocalVersion();
      const remote = await getRemoteVersion();

      if (!remote) {
        return sock.sendMessage(m.chat, {
          text: '_Failed to fetch remote version_',
          edit: statusMsg.key
        });
      }

      if (remote.version === local.version) {
        return sock.sendMessage(m.chat, {
          text: `_✅ Bot is up to date (v${local.version})_`,
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

      msg += `_Use .update now to install_`;

      return sock.sendMessage(m.chat, {
        text: msg,
        edit: statusMsg.key
      });
    }

    if (command === 'update' && args[0] === 'now') {
      const local = getLocalVersion();
      const remote = await getRemoteVersion();

      if (!remote) {
        return m.reply('_Failed to fetch remote version_');
      }

      if (remote.version === local.version) {
        return m.reply('_Already on latest version. Use .hardupdate to force update_');
      }

      await m.reply(`_Updating from v${local.version} to v${remote.version}..._\n_This may take a moment if new packages are needed_`);

      downloadAndUpdate()
        .then(() => {
          process.exit(0);
        })
        .catch((error) => {
          m.reply(`_❌ Update failed: ${error.message}_`);
        });

      return;
    }

    if (command === 'hardupdate') {
      await m.reply('_⚠️ Force updating from GitHub..._\n_This may take a moment if new packages are needed_');

      downloadAndUpdate()
        .then(() => {
          process.exit(0);
        })
        .catch((error) => {
          m.reply(`_❌ Update failed: ${error.message}_`);
        });

      return;
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
