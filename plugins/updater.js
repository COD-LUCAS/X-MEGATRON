const simpleGit = require('simple-git');
const git = simpleGit();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const GITHUB_REPO = 'COD-LUCAS/X-MEGATRON';
const GITHUB_RAW = 'https://raw.githubusercontent.com/COD-LUCAS/X-MEGATRON/main';
const REMOTE_PACKAGE_URL = `$COD-LUCAS/X-MEGATRON/package.json`;
const REMOTE_VERSION_URL = `$COD-LUCAS/X-MEGATRON/version.json`;

const localPackageJson = require('../package.json');

async function isGitRepo() {
  try {
    await fs.access('.git');
    return true;
  } catch (e) {
    return false;
  }
}

async function getRemotePackageVersion() {
  try {
    const response = await axios.get(REMOTE_PACKAGE_URL, { timeout: 10000 });
    return response.data.version;
  } catch (error) {
    throw new Error('Failed to fetch remote package version');
  }
}

async function getRemoteVersionInfo() {
  try {
    const response = await axios.get(REMOTE_VERSION_URL, { timeout: 10000 });
    return response.data;
  } catch (error) {
    return null;
  }
}

async function getLocalVersionInfo() {
  try {
    const versionFile = path.join(__dirname, '..', 'version.json');
    if (fsSync.existsSync(versionFile)) {
      return JSON.parse(fsSync.readFileSync(versionFile, 'utf8'));
    }
  } catch (e) {}
  return { version: localPackageJson.version, features: [] };
}

async function checkForUpdates() {
  try {
    await git.fetch();
    const commits = await git.log(['HEAD..origin/main']);
    const localVersion = localPackageJson.version;
    let remoteVersion;

    try {
      remoteVersion = await getRemotePackageVersion();
    } catch (error) {
      return { error: 'Failed to check remote version' };
    }

    const hasCommits = commits.total > 0;
    const versionChanged = remoteVersion !== localVersion;

    const localVersionInfo = await getLocalVersionInfo();
    const remoteVersionInfo = await getRemoteVersionInfo();

    return {
      hasCommits,
      versionChanged,
      localVersion,
      remoteVersion,
      commits: commits.all,
      totalCommits: commits.total,
      localVersionInfo,
      remoteVersionInfo,
      isBetaUpdate: hasCommits && !versionChanged,
      isStableUpdate: hasCommits && versionChanged
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function performUpdate(isBeta = false) {
  try {
    await git.reset('hard', ['HEAD']);
    await git.pull('origin', 'main');
    
    try {
      await execAsync('npm install --legacy-peer-deps');
    } catch (e) {
      console.log('NPM install warning:', e.message);
    }

    return true;
  } catch (error) {
    throw error;
  }
}

let lastNotifiedVersion = null;
let updateNotificationSent = false;

async function checkAndNotifyUpdates(sock, ownerJid) {
  try {
    if (!(await isGitRepo())) return;

    const result = await checkForUpdates();
    if (result.error) return;

    const hasUpdate = result.hasCommits || result.versionChanged;
    if (!hasUpdate) return;

    if (lastNotifiedVersion === result.remoteVersion && updateNotificationSent) {
      return;
    }

    let msg = '';

    if (result.isStableUpdate) {
      msg = `*UPDATE AVAILABLE*\n\n`;
      msg += `📦 Current: v${result.localVersion}\n`;
      msg += `📦 New: v${result.remoteVersion}\n\n`;

      if (result.remoteVersionInfo?.features?.length) {
        msg += `*New Features:*\n`;
        result.remoteVersionInfo.features.forEach(f => {
          msg += `• ${f}\n`;
        });
        msg += `\n`;
      }

      msg += `*Changelog:*\n`;
      result.commits.slice(0, 5).forEach((commit, i) => {
        msg += `${i + 1}. ${commit.message}\n`;
      });

      if (result.totalCommits > 5) {
        msg += `\n_...and ${result.totalCommits - 5} more commits_\n`;
      }

      msg += `\nUse :update start to install`;
    } else if (result.isBetaUpdate) {
      msg = `*BETA UPDATE AVAILABLE*\n\n`;
      msg += `📦 Version: v${result.localVersion}\n`;
      msg += `⚠️ ${result.totalCommits} new commit${result.totalCommits > 1 ? 's' : ''}\n\n`;

      msg += `*Changelog:*\n`;
      result.commits.slice(0, 5).forEach((commit, i) => {
        msg += `${i + 1}. ${commit.message}\n`;
      });

      if (result.totalCommits > 5) {
        msg += `\n_...and ${result.totalCommits - 5} more commits_\n`;
      }

      msg += `\nUse :update beta to install`;
    }

    if (msg && ownerJid) {
      await sock.sendMessage(ownerJid, { text: msg });
      lastNotifiedVersion = result.remoteVersion;
      updateNotificationSent = true;
    }
  } catch (e) {
    console.error('Update notification error:', e.message);
  }
}

function startUpdateChecker(sock, ownerJid) {
  checkAndNotifyUpdates(sock, ownerJid);

  setInterval(() => {
    updateNotificationSent = false;
    checkAndNotifyUpdates(sock, ownerJid);
  }, 180000);
}

module.exports = {
  command: ['update', 'checkupdate'],
  owner: true,
  sudo: true,

  async execute(sock, m, context) {
    const { command, args, text } = context;

    if (!(await isGitRepo())) {
      return m.reply("_This bot isn't running from a Git repository_");
    }

    const subCommand = args[0] ? args[0].toLowerCase() : '';

    if (command === 'checkupdate' || !subCommand) {
      const processingMsg = await m.reply('_Checking for updates..._');

      const result = await checkForUpdates();

      if (result.error) {
        return sock.sendMessage(m.chat, {
          text: `_${result.error}_`,
          edit: processingMsg.key
        });
      }

      if (!result.hasCommits && !result.versionChanged) {
        return sock.sendMessage(m.chat, {
          text: `_Bot is up to date (v${result.localVersion})_`,
          edit: processingMsg.key
        });
      }

      let updateInfo = '';

      if (result.isStableUpdate) {
        updateInfo = `*UPDATE AVAILABLE*\n\n`;
        updateInfo += `📦 Current: v${result.localVersion}\n`;
        updateInfo += `📦 New: v${result.remoteVersion}\n\n`;

        if (result.remoteVersionInfo?.features?.length) {
          updateInfo += `*New Features:*\n`;
          result.remoteVersionInfo.features.forEach(f => {
            updateInfo += `• ${f}\n`;
          });
          updateInfo += `\n`;
        }

        updateInfo += `*Changelog:*\n\n`;
        result.commits.forEach((commit, i) => {
          updateInfo += `${i + 1}. ${commit.message}\n`;
        });
        updateInfo += `\nUse :update start to install`;
      } else if (result.isBetaUpdate) {
        updateInfo = `*BETA UPDATE AVAILABLE*\n\n`;
        updateInfo += `📦 Version: v${result.localVersion}\n`;
        updateInfo += `⚠️ ${result.totalCommits} new commit${result.totalCommits > 1 ? 's' : ''}\n\n`;

        updateInfo += `*Changelog:*\n\n`;
        result.commits.forEach((commit, i) => {
          updateInfo += `${i + 1}. ${commit.message}\n`;
        });
        updateInfo += `\nUse :update beta to install`;
      }

      return sock.sendMessage(m.chat, {
        text: updateInfo,
        edit: processingMsg.key
      });
    }

    if (subCommand === 'start') {
      const processingMsg = await m.reply('_Checking for stable updates..._');

      const result = await checkForUpdates();

      if (result.error) {
        return sock.sendMessage(m.chat, {
          text: `_${result.error}_`,
          edit: processingMsg.key
        });
      }

      if (!result.isStableUpdate) {
        if (result.isBetaUpdate) {
          return sock.sendMessage(m.chat, {
            text: '_Only beta updates available. Use :update beta_',
            edit: processingMsg.key
          });
        }
        return sock.sendMessage(m.chat, {
          text: '_No stable updates available_',
          edit: processingMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: `_Updating to v${result.remoteVersion}..._`,
        edit: processingMsg.key
      });

      try {
        await performUpdate(false);

        await sock.sendMessage(m.chat, {
          text: `_✅ Successfully updated to v${result.remoteVersion}_\n\n_Restarting bot..._`,
          edit: processingMsg.key
        });

        setTimeout(() => process.exit(0), 2000);
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Update failed: ${error.message}_`,
          edit: processingMsg.key
        });
      }
    }

    if (subCommand === 'beta') {
      const processingMsg = await m.reply('_Checking for beta updates..._');

      const result = await checkForUpdates();

      if (result.error) {
        return sock.sendMessage(m.chat, {
          text: `_${result.error}_`,
          edit: processingMsg.key
        });
      }

      if (!result.hasCommits) {
        return sock.sendMessage(m.chat, {
          text: '_No beta updates available_',
          edit: processingMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: `_Applying beta update (${result.totalCommits} commit${result.totalCommits > 1 ? 's' : ''})..._`,
        edit: processingMsg.key
      });

      try {
        await performUpdate(true);

        await sock.sendMessage(m.chat, {
          text: `_✅ Successfully applied beta update_\n\n_Restarting bot..._`,
          edit: processingMsg.key
        });

        setTimeout(() => process.exit(0), 2000);
      } catch (error) {
        return sock.sendMessage(m.chat, {
          text: `_❌ Update failed: ${error.message}_`,
          edit: processingMsg.key
        });
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
