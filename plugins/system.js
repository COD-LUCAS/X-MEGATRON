const fs = require('fs');
const path = require('path');

module.exports = {
  command: ['reboot', 'reload'],
  owner: true,
  sudo: true,

  async execute(sock, m, context) {
    const { command, isOwner, isSudo } = context;

    if (!isOwner && !isSudo) return;

    if (command === 'reboot') {
      await m.reply('_🔄 Rebooting bot, please wait..._');
      setTimeout(() => process.exit(0), 1000);
      return;
    }

    if (command === 'reload') {
      const pluginDir = path.join(__dirname);
      const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js'));

      let success = 0;
      let failed = [];

      for (const file of files) {
        const filePath = path.join(pluginDir, file);
        try {
          delete require.cache[require.resolve(filePath)];
          require(filePath);
          success++;
        } catch {
          failed.push(file);
        }
      }

      let txt = `_✅ Reloaded ${success}/${files.length} plugin(s)_`;
      if (failed.length) txt += `\n_❌ Failed: ${failed.join(', ')}_`;

      return m.reply(txt);
    }
  },
};