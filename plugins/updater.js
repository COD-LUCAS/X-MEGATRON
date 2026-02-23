const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const GITHUB_REPO = 'COD-LUCAS/X-MEGATRON';
const GITHUB_ZIP = 'https://github.com/COD-LUCAS/X-MEGATRON/archive/refs/heads/main.zip';
const VERSION_URL = 'https://raw.githubusercontent.com/COD-LUCAS/X-MEGATRON/main/version.json';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

const LOCAL_VERSION_FILE = path.join(__dirname, '..', 'version.json');
const UPDATE_CHECK_FILE = path.join(__dirname, '..', '.last_update_check');

const PRESERVE_FILES = [
  '.env',
  'disabled_commands.json',
  'sticker_bonds.json',
  'sudo.json',
  'owner.json',
  'config.js',
  'session',
  'database'
];

const httpsGet = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'X-MEGATRON-Bot' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
};

const getLocalVersion = () => {
  try {
    if (fs.existsSync(LOCAL_VERSION_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_VERSION_FILE, 'utf8'));
    }
  } catch (e) {}
  return { version: '0.0.0', features: [] };
};

const getRemoteVersion = async () => {
  try {
    const data = await httpsGet(VERSION_URL);
    return JSON.parse(data);
  } catch (e) {
    throw new Error('Failed to fetch remote version');
  }
};

const getLatestRelease = async () => {
  try {
    const data = await httpsGet(RELEASES_API);
    const release = JSON.parse(data);
    return {
      version: release.tag_name.replace(/^v/, ''),
      name: release.name,
      body: release.body,
      url: release.html_url
    };
  } catch (e) {
    return null;
  }
};

const compareVersions = (v1, v2) => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
};

const performUpdate = async () => {
  const tmpDir = path.join(__dirname, '..', '.tmp_update');
  const rootDir = path.join(__dirname, '..');

  try {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });

    await execAsync(`cd "${tmpDir}" && curl -L "${GITHUB_ZIP}" -o update.zip`);
    await execAsync(`cd "${tmpDir}" && unzip -q update.zip`);

    const extractedDir = path.join(tmpDir, 'X-MEGATRON-main');
    
    if (!fs.existsSync(extractedDir)) {
      throw new Error('Failed to extract update');
    }

    const backupFiles = {};
    for (const file of PRESERVE_FILES) {
      const filePath = path.join(rootDir, file);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          backupFiles[file] = { type: 'dir', path: filePath + '_backup' };
          fs.renameSync(filePath, filePath + '_backup');
        } else {
          backupFiles[file] = { type: 'file', content: fs.readFileSync(filePath) };
        }
      }
    }

    const entries = fs.readdirSync(extractedDir);
    for (const entry of entries) {
      if (PRESERVE_FILES.includes(entry)) continue;
      
      const src = path.join(extractedDir, entry);
      const dest = path.join(rootDir, entry);
      
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      
      fs.renameSync(src, dest);
    }

    for (const [file, backup] of Object.entries(backupFiles)) {
      const filePath = path.join(rootDir, file);
      if (backup.type === 'dir') {
        if (fs.existsSync(backup.path)) {
          fs.renameSync(backup.path, filePath);
        }
      } else {
        fs.writeFileSync(filePath, backup.content);
      }
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });

    return true;
  } catch (e) {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    throw e;
  }
};

let updateNotificationSent = false;

const checkForUpdates = async (sock, notifyJid = null) => {
  try {
    const local = getLocalVersion();
    const remote = await getRemoteVersion();
    const release = await getLatestRelease();

    if (compareVersions(remote.version, local.version) > 0) {
      let msg = `*UPDATE AVAILABLE*\n\n`;
      msg += `Current: v${local.version}\n`;
      msg += `Latest: v${remote.version}\n\n`;
      
      if (remote.features && remote.features.length) {
        msg += `*New Features:*\n`;
        remote.features.forEach(f => msg += `• ${f}\n`);
        msg += `\n`;
      }
      
      msg += `Use :update to install`;

      if (notifyJid && !updateNotificationSent) {
        await sock.sendMessage(notifyJid, { text: msg });
        updateNotificationSent = true;
      }

      return { available: true, local: local.version, remote: remote.version, features: remote.features, message: msg };
    }

    if (release && compareVersions(release.version, local.version) > 0) {
      let msg = `*NEW RELEASE AVAILABLE*\n\n`;
      msg += `Current: v${local.version}\n`;
      msg += `Release: v${release.version}\n`;
      if (release.name) msg += `Name: ${release.name}\n`;
      msg += `\n${release.url}\n\n`;
      msg += `Use :update to install`;

      if (notifyJid && !updateNotificationSent) {
        await sock.sendMessage(notifyJid, { text: msg });
        updateNotificationSent = true;
      }

      return { available: true, local: local.version, remote: release.version, message: msg };
    }

    return { available: false };
  } catch (e) {
    return { available: false, error: e.message };
  }
};

const startUpdateChecker = (sock, ownerJid) => {
  setInterval(async () => {
    try {
      const lastCheck = fs.existsSync(UPDATE_CHECK_FILE) 
        ? parseInt(fs.readFileSync(UPDATE_CHECK_FILE, 'utf8'))
        : 0;
      
      const now = Date.now();
      if (now - lastCheck < 180000) return;

      fs.writeFileSync(UPDATE_CHECK_FILE, now.toString());

      await checkForUpdates(sock, ownerJid);
    } catch (e) {}
  }, 180000);
};

module.exports = {
  command: ['update', 'checkupdate'],
  owner: true,
  sudo: true,

  async execute(sock, m, context) {
    const { command, sender } = context;

    if (command === 'checkupdate') {
      const result = await checkForUpdates(sock);

      if (result.error) {
        return m.reply(`_Failed to check updates: ${result.error}_`);
      }

      if (result.available) {
        return m.reply(result.message);
      }

      return m.reply(`_Bot is up to date (v${getLocalVersion().version})_`);
    }

    if (command === 'update') {
      const check = await checkForUpdates(sock);

      if (check.error) {
        return m.reply(`_Failed to check updates: ${check.error}_`);
      }

      if (!check.available) {
        return m.reply(`_Bot is already up to date (v${getLocalVersion().version})_`);
      }

      await m.reply(`_Updating from v${check.local} to v${check.remote}..._`);

      try {
        await performUpdate();
        
        await m.reply(`_✅ Update completed successfully!_\n\n_Restarting bot..._`);
        
        setTimeout(() => process.exit(0), 2000);
      } catch (e) {
        console.error('Update error:', e);
        return m.reply(`_❌ Update failed: ${e.message}_`);
      }
    }
  },

  init: (sock, ownerNumbers) => {
    if (ownerNumbers && ownerNumbers.length > 0) {
      const ownerJid = ownerNumbers[0].includes('@') 
        ? ownerNumbers[0] 
        : ownerNumbers[0] + '@s.whatsapp.net';
      
      startUpdateChecker(sock, ownerJid);
    }
  }
};
