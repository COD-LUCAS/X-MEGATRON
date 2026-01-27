const { performance } = require('perf_hooks');
const os = require('os');

module.exports = {
  command: ['status', 'botstatus', 'info'],
  category: 'info',
  description: 'Show bot system status and performance',

  async execute(sock, m, { reply }) {
    try {
      const start = performance.now();
      
      await reply('_⏳ Collecting system information..._');

      // CPU Information
      const cpus = os.cpus();
      const cpuModel = cpus[0].model;
      const cpuCores = cpus.length;
      
      // Calculate CPU usage
      let totalIdle = 0;
      let totalTick = 0;
      
      cpus.forEach(cpu => {
        for (let type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });
      
      const cpuUsage = (100 - ~~(100 * totalIdle / totalTick)).toFixed(2);

      // Memory Information
      const totalMem = (os.totalmem() / 1024 / 1024).toFixed(2); // MB
      const freeMem = (os.freemem() / 1024 / 1024).toFixed(2); // MB
      const usedMem = (totalMem - freeMem).toFixed(2);
      const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);
      const memFreePercent = ((freeMem / totalMem) * 100).toFixed(2);

      // System Information
      const platform = os.platform();
      const osType = os.type();
      const osRelease = os.release();
      const arch = os.arch();
      const hostname = os.hostname();

      // Uptime
      const botUptime = process.uptime();
      const systemUptime = os.uptime();

      const formatUptime = (seconds) => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        parts.push(`${secs}s`);
        
        return parts.join(' ');
      };

      const botUptimeStr = formatUptime(botUptime);
      const sysUptimeStr = formatUptime(systemUptime);

      // Response time
      const ping = (performance.now() - start).toFixed(2);

      // Node version
      const nodeVersion = process.version;

      const statusText = `*BOT STATUS & SYSTEM INFO*

\`CPU INFO\`
\`\`\`OS: ${osType} ${osRelease}\`\`\`
\`\`\`Platform: ${platform}\`\`\`
\`\`\`Architecture: ${arch}\`\`\`
\`\`\`CPU Model: ${cpuModel}\`\`\`
\`\`\`CPU Cores: ${cpuCores} Core(s)\`\`\`
\`\`\`CPU Usage: ${cpuUsage}%\`\`\`

\`MEMORY INFO\`
\`\`\`RAM Total: ${totalMem} MB\`\`\`
\`\`\`RAM Used: ${usedMem} MB (${memUsagePercent}%)\`\`\`
\`\`\`RAM Free: ${freeMem} MB (${memFreePercent}%)\`\`\`

\`SYSTEM INFO\`
\`\`\`Hostname: ${hostname}\`\`\`
\`\`\`Node Version: ${nodeVersion}\`\`\`

\`UPTIME\`
\`\`\`Bot Uptime: ${botUptimeStr}\`\`\`
\`\`\`System Uptime: ${sysUptimeStr}\`\`\`

\`PERFORMANCE\`
\`\`\`Response Time: ${ping} ms\`\`\``;

      // Send with external ad reply (like original)
      await sock.sendMessage(m.chat, {
        text: statusText,
        contextInfo: {
          externalAdReply: {
            title: 'Bot System Status',
            body: 'Performance & System Information',
            mediaType: 1,
            previewType: 0,
            renderLargerThumbnail: true,
            thumbnailUrl: 'https://files.catbox.moe/aqsx3v.jpg',
            sourceUrl: ''
          }
        }
      }, { quoted: m });

    } catch (error) {
      console.error('Status command error:', error);
      return reply('_❌ Failed to collect system information_\n\n_Error: ' + error.message + '_');
    }
  }
};