const os = require('os');

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const parts = [];
  if (d > 0) parts.push(`${d} day${d > 1 ? 's' : ''}`);
  if (h > 0) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
  if (m > 0) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
  if (s > 0 || parts.length === 0) parts.push(`${s} second${s !== 1 ? 's' : ''}`);
  
  return parts.join(', ');
}

module.exports = {
  command: ['uptime', 'runtime'],
  category: 'utility',
  desc: 'Show bot and system uptime',
  usage: '.uptime',

  async execute(sock, m, context) {
    const botUptime = formatUptime(process.uptime());
    const systemUptime = formatUptime(os.uptime());

    const text = `_*Bot Uptime:* ${botUptime}_\n\n_*System Uptime:* ${systemUptime}_`;

    return m.reply(text);
  }
};
