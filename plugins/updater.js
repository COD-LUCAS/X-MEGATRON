const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

const GITHUB_REPO = 'https://github.com/COD-LUCAS/X-MEGATRON.git';

async function checkGit() {
  try {
    await execAsync('git --version');
    return true;
  } catch (e) {
    return false;
  }
}

async function installGit() {
  try {
    const msg = '_Installing git..._\n\n';
    
    try {
      await execAsync('apt-get update && apt-get install -y git');
      return { success: true, msg: msg + '_✅ Git installed via apt-get_' };
    } catch (e1) {
      try {
        await execAsync('yum install -y git');
        return { success: true, msg: msg + '_✅ Git installed via yum_' };
      } catch (e2) {
        return { success: false, msg: msg + '_❌ Failed to install git automatically_' };
      }
    }
  } catch (e) {
    return { success: false, msg: '_❌ Installation failed_' };
  }
}

async function setupGitRepo() {
  const steps = [];
  
  try {
    if (fs.existsSync('.git')) {
      steps.push('⚠️ Git repository already exists');
    } else {
      await execAsync('git init');
      steps.push('✅ Git repository initialized');
    }

    try {
      await execAsync('git remote remove origin');
    } catch (e) {}
    
    await execAsync(`git remote add origin ${GITHUB_REPO}`);
    steps.push('✅ Remote repository added');

    await execAsync('git fetch origin main');
    steps.push('✅ Fetched from remote');

    await execAsync('git branch -M main');
    steps.push('✅ Main branch created');

    await execAsync('git branch --set-upstream-to=origin/main main');
    steps.push('✅ Branch tracking configured');

    await execAsync('git reset --hard origin/main');
    steps.push('✅ Repository synced with remote');

    return { success: true, steps };
  } catch (error) {
    steps.push(`❌ Error: ${error.message}`);
    return { success: false, steps, error: error.message };
  }
}

module.exports = {
  command: ['setupgit', 'initgit'],
  owner: true,

  async execute(sock, m, context) {
    const { command } = context;

    const statusMsg = await m.reply('_Checking git installation..._');

    const hasGit = await checkGit();

    if (!hasGit) {
      await sock.sendMessage(m.chat, {
        text: '_Git not found. Installing..._',
        edit: statusMsg.key
      });

      const installResult = await installGit();
      
      if (!installResult.success) {
        return sock.sendMessage(m.chat, {
          text: installResult.msg + '\n\n_Please install git manually:_\n`apt-get install git`\n_or_\n`yum install git`',
          edit: statusMsg.key
        });
      }

      await sock.sendMessage(m.chat, {
        text: installResult.msg,
        edit: statusMsg.key
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await sock.sendMessage(m.chat, {
      text: '_Setting up git repository..._',
      edit: statusMsg.key
    });

    const result = await setupGitRepo();

    let responseMsg = '*GIT SETUP*\n\n';
    result.steps.forEach(step => {
      responseMsg += `${step}\n`;
    });

    if (result.success) {
      responseMsg += '\n_Setup complete!_\n\n';
      responseMsg += '_You can now use:_\n';
      responseMsg += '• :checkupdate\n';
      responseMsg += '• :update start\n';
      responseMsg += '• :update beta';
    } else {
      responseMsg += '\n_❌ Setup failed_';
      if (result.error) {
        responseMsg += `\n\n_Error: ${result.error}_`;
      }
    }

    return sock.sendMessage(m.chat, {
      text: responseMsg,
      edit: statusMsg.key
    });
  }
};
