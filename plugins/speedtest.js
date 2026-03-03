const axios = require('axios');
const { performance } = require('perf_hooks');

module.exports = {
  command: ['speed'],
  category: 'utility',
  description: 'Test bot and server speed',

  async execute(sock, m, { reply }) {
    const startTime = performance.now();
    
    await reply('_⏳ Running speed test..._');

    try {
      // 1. Ping Test
      const pingStart = performance.now();
      await sock.sendPresenceUpdate('available', m.chat);
      const pingTime = (performance.now() - pingStart).toFixed(2);

      // 2. Download Test (5MB file)
      const downloadStart = performance.now();
      const downloadUrl = 'https://speed.cloudflare.com/__down?bytes=5000000'; // 5MB
      const downloadResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 15000
      });
      const downloadTime = (performance.now() - downloadStart) / 1000; // seconds
      const downloadSize = downloadResponse.data.length / (1024 * 1024); // MB
      const downloadSpeed = (downloadSize / downloadTime).toFixed(2);

      // 3. Upload Test (1MB data)
      const uploadStart = performance.now();
      const uploadData = Buffer.alloc(1024 * 1024); // 1MB
      await axios.post('https://httpbin.org/post', uploadData, {
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 10000,
        maxBodyLength: 2 * 1024 * 1024
      });
      const uploadTime = (performance.now() - uploadStart) / 1000; // seconds
      const uploadSize = 1; // MB
      const uploadSpeed = (uploadSize / uploadTime).toFixed(2);

      // 4. Response Time
      const responseTime = (performance.now() - startTime).toFixed(2);

      // 5. Server Location Test
      let serverLocation = 'Unknown';
      try {
        const locationResponse = await axios.get('https://ipapi.co/json/', { timeout: 5000 });
        serverLocation = `${locationResponse.data.city}, ${locationResponse.data.country_name}`;
      } catch (e) {
        console.log('Location fetch failed:', e.message);
      }

      const result = `*╭─────〔 SPEED TEST 〕─────╮*

*┃ ⚡ RESPONSE*
*┃* • Bot Response: ${responseTime} ms
*┃* • Network Ping: ${pingTime} ms

*┃ ⬇️ DOWNLOAD*
*┃* • Speed: ${downloadSpeed} MB/s
*┃* • Time: ${downloadTime.toFixed(2)}s
*┃* • Size: ${downloadSize.toFixed(2)} MB

*┃ ⬆️ UPLOAD*
*┃* • Speed: ${uploadSpeed} MB/s
*┃* • Time: ${uploadTime.toFixed(2)}s
*┃* • Size: ${uploadSize} MB

*┃ 🌍 SERVER*
*┃* • Location: ${serverLocation}
*┃* • Platform: ${process.platform}
*┃* • Node: ${process.version}

*┃ 📊 RATING*
*┃* • ${getRating(parseFloat(downloadSpeed), parseFloat(uploadSpeed))}

*╰──────────────────────────╯*`;

      await reply(result);

    } catch (error) {
      console.error('Speed test error:', error);
      
      let errorMsg = '_❌ Speed test failed_\n\n';
      
      if (error.message.includes('timeout')) {
        errorMsg += '_⏱️ Connection timeout - Check your network_';
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMsg += '_🌐 Connection refused - Network issue_';
      } else {
        errorMsg += `_Error: ${error.message}_`;
      }
      
      await reply(errorMsg);
    }
  }
};

function getRating(download, upload) {
  const avgSpeed = (download + upload) / 2;
  
  if (avgSpeed >= 50) {
    return '🔥 Excellent - Lightning Fast!';
  } else if (avgSpeed >= 25) {
    return '✅ Great - Very Good Speed';
  } else if (avgSpeed >= 10) {
    return '👍 Good - Decent Speed';
  } else if (avgSpeed >= 5) {
    return '⚠️ Fair - Moderate Speed';
  } else {
    return '🐌 Slow - Poor Connection';
  }
}