const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');

const execAsync = promisify(exec);

const GITHUB_REPO = 'https://github.com/COD-LUCAS/X-MEGATRON.git';
const GITHUB_RAW = 'https://raw.githubusercontent.com/COD-LUCAS/X-MEGATRON/main';

async function isGitRepo() {
  try {
    await execAsync('git rev-parse --git-dir');
    return true;
  } catch (e) {
    return false;
  }
}

async function setupGit() {
  try {
    if (fsSync.existsSync('.git')) {
      await execAsync('rm -rf .git');
    }
    await execAsync('git init');
    await execAsync(`git remote add origin ${GITHUB_REPO}`);
    await execAsync('git fetch origin main');
    await execAsync('git checkout -b main origin/main');
    return true;
  } catch (e) {
    throw new Error(`Git setup failed: ${e.message}`);
  }
}

async function getRemoteVersion() {
  try {
    const response = await axios.get(`${GITHUB_RAW}/version.json`, { timeout: 10000 });
    return response.data;
  } catch (error) {
    return null;
  }
}

async function getLocalVersion() {
  try {
    const versionFile = path.join(__dirname, '..', 'version.json');
    if (fsSync.existsSync(versionFile)) {
      return JSON.parse(fsSync.readFileSync(versionFile, 'utf8'));
    }
  } catch (e) {}
  return { version: '0.0.0', features: [] };
}

async function checkForUpdates() {
  try {
    if (!(await isGitRepo())) {
      return { needsSetup: true };
    }

    await execAsync('git fetch origin main');
    
    const localVersion = await getLocalVersion();
    const remoteVersion = await getRemoteVersion();

    const { stdout: commitCount } = await execAsync('git rev-list --count HEAD..origin/main');
    const totalCommits = parseInt(commitCount.trim());

    let commits = [];
    if (totalCommits > 0) {
      const { stdout: logOutput } = await execAsync('git log --oneline HEAD..origin/main');
      commits = logOutput.trim().split('\n').map(line => {
        const parts = line.split(' ');
        return parts.slice(1).join(' ');
      });
    }

    const versionChanged = remoteVersion && remoteVersion.version !== localVersion.version;

    return {
      hasCommits: totalCommits > 0,
      versionChanged,
      localVersion: localVersion.version,
      remoteVersion: remoteVersion?.version || localVersion.version,
      commits,
      totalCommits,
      features: remoteVersion?.features || [],
      isBeta: totalCommits > 0 && !versionChanged,
      isStable: totalCommits > 0 && versionChanged
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function performUpdate() {
  try {
    await execAsync('git reset --hard HEAD');
    await execAsync('git pull origin main');
    
    try {
      await execAsync('npm install --legacy-peer-deps');
    } catch (e) {}

    return true;
  } catch (error) {
    throw error;
  }
}

let lastNotifiedVersion = null;

async function checkAndNotify(sock, ownerJid) {
  try {
    const result = await checkForUpdates();
    
    if (result.needsSetup || result.error) return;
    if (!result.hasCommits) return;
    if (lastNotifiedVersion === result.remoteVersion) return;

    let msg = '';

    if (result.isStable) {
      msg = `*UPDATE AVAILABLE*\n\n`;
      msg += `📦 Current: v${result.localVersion}\n`;
      msg += `📦 New: v${result.remoteVersion}\n\n`;

      if (result.features?.length) {
        msg += `*New Features:*\n`;
        result.features.forEach(f => msg += `• ${f}\n`);
        msg += `\n`;
      }

      if (result.commits.length) {
        msg += `*Changelog:*\n`;
        result.commits.slice(0, 5).forEach((c, i) => msg += `${i + 1}. ${c}\n`);
        if (result.totalCommits > 5) {
          msg += `\n_...and ${result.totalCommits - 5} more commits_\n`;
        }
      }

      msg += `\nUse :update now to install`;
    } else if (result.isBeta) {
      msg = `*BETA UPDATE AVAILABLE*\n\n`;
      msg += `📦 Version: v${result.localVersion}\n`;
      msg += `⚠️ ${result.totalCommits} new commit${result.totalCommits > 1 ? 's' : ''}\n\n`;

      if (result.commits.length) {
        msg += `*Changelog:*\n`;
        result.commits.slice(0, 5).forEach((c, i) => msg += `${i + 1}. ${c}\n`);
        if (result.totalCommits > 5) {
          msg += `\n_...and ${result.totalCommits - 5} more commits_\n`;
        }
      }

      msg += `\nUse :update now to install`;
    }

    if (msg && ownerJid) {
      await sock.sendMessage(ownerJid, { text: msg });
      lastNotifiedVersion = result.remoteVersion;
    }
  } catch (e) {}
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

    if (!(await isGitRepo())) {
      const setupMsg = await m.reply('_Git not initialized. Setting up..._');

      try {
        await setupGit();
        return sock.sendMessage(m.chat, {
          text: '_✅ Git setup complete!_\n\n_Run :checkupdate again_',
          edit: setupMsg.key
        });
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Setup failed: ${error.message}_`,
          edit: setupMsg.key
        });
      }
    }

    const subCommand = args[0] ? args[0].toLowerCase() : '';

    if (command === 'checkupdate' || !subCommand) {
      const statusMsg = await m.reply('_Checking for updates..._');

      const result = await checkForUpdates();

      if (result.error) {
        return sock.sendMessage(m.chat, {
          text: `_Failed to check updates: ${result.error}_`,
          edit: statusMsg.key
        });
      }

      if (!result.hasCommits) {
        return sock.sendMessage(m.chat, {
          text: `_Bot is up to date (v${result.localVersion})_`,
          edit: statusMsg.key
        });
      }

      let msg = '';

      if (result.isStable) {
        msg = `*UPDATE AVAILABLE*\n\n`;
        msg += `📦 Current: v${result.localVersion}\n`;
        msg += `📦 New: v${result.remoteVersion}\n\n`;

        if (result.features?.length) {
          msg += `*New Features:*\n`;
          result.features.forEach(f => msg += `• ${f}\n`);
          msg += `\n`;
        }

        if (result.commits.length) {
          msg += `*Changelog:*\n\n`;
          result.commits.forEach((c, i) => msg += `${i + 1}. ${c}\n`);
        }

        msg += `\nUse :update now to install`;
      } else if (result.isBeta) {
        msg = `*BETA UPDATE AVAILABLE*\n\n`;
        msg += `📦 Version: v${result.localVersion}\n`;
        msg += `⚠️ ${result.totalCommits} new commit${result.totalCommits > 1 ? 's' : ''}\n\n`;

        if (result.commits.length) {
          msg += `*Changelog:*\n\n`;
          result.commits.forEach((c, i) => msg += `${i + 1}. ${c}\n`);
        }

        msg += `\nUse :update now to install`;
      }

      return sock.sendMessage(m.chat, {
        text: msg,
        edit: statusMsg.key
      });
    }

    if (subCommand === 'now' || subCommand === 'start') {
      const statusMsg = await m.reply('_Checking for updates..._');

      const result = await checkForUpdates();

      if (result.error) {
        return sock.sendMessage(m.chat, {
          text: `_Failed: ${result.error}_`,
          edit: statusMsg.key
        });
      }

      if (!result.hasCommits) {
        return sock.sendMessage(m.chat, {
          text: `_No updates available_`,
          edit: statusMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: `_Updating${result.isStable ? ' to v' + result.remoteVersion : ''}..._`,
        edit: statusMsg.key
      });

      try {
        await performUpdate();

        await sock.sendMessage(m.chat, {
          text: `_✅ Update complete!_\n\n_Restarting bot..._`,
          edit: statusMsg.key
        });

        setTimeout(() => process.exit(0), 2000);
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Update failed: ${error.message}_`,
          edit: statusMsg.key
        });
      }
    }
  },

  init: (sock, ownerNumbers) => {
    if (ownerNumbers?.length > 0) {
      const ownerJid = ownerNumbers[0].includes('@')
        ? ownerNumbers[0]
        : ownerNumbers[0] + '@s.whatsapp.net';
      startUpdateChecker(sock, ownerJid);
    }
  }
};
