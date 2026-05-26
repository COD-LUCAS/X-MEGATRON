'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const getTempPath = (filename) => path.join(TMP_DIR, `${Date.now()}_${filename}`);
const cleanTemp = (file) => {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
};

let pendingSpotify = {};

module.exports = {
  command: ['spotify', 'sp'],
  category: 'downloader',
  desc: 'Search & Download Spotify songs',
  usage: '.spotify <song name or Spotify URL>',

  async execute(sock, m, context) {
    const { reply, args, react } = context;
    
    let query = args.join(' ').trim();
    
    // Check if replying to a message
    if (!query && m.quoted?.body) {
      query = m.quoted.body.trim();
    }
    
    if (!query) {
      return reply('_Give me a song name or Spotify URL!_');
    }
    
    // Handle Spotify URL directly
    if (query.startsWith('http') && query.includes('spotify.com/track/')) {
      try {
        await react('⏳');
        
        const res = await axios.get(`https://jerrycoder.oggyapi.workers.dev/down/spotify?url=${encodeURIComponent(query)}`);
        
        if (!res.data.status || !res.data.download_link) {
          await react('❌');
          return reply('_Failed to get download link!_');
        }
        
        const track = res.data;
        
        // Download audio
        const audioRes = await axios.get(track.download_link, { responseType: 'arraybuffer', timeout: 60000 });
        const audioPath = getTempPath(`spotify.mp3`);
        fs.writeFileSync(audioPath, audioRes.data);
        
        // Send audio
        await sock.sendMessage(m.chat, {
          audio: fs.readFileSync(audioPath),
          mimetype: 'audio/mpeg',
          fileName: `${track.title} - ${track.artist}.mp3`
        }, { quoted: m });
        
        cleanTemp(audioPath);
        await react('✅');
        
      } catch (err) {
        console.error('Spotify error:', err);
        await react('❌');
        return reply('_Error downloading track!_');
      }
      return;
    }
    
    // Search for songs
    try {
      await react('⏳');
      
      const res = await axios.get(`https://jerrycoder.oggyapi.workers.dev/search/spotify?q=${encodeURIComponent(query)}`);
      
      if (!res.data.tracks || res.data.tracks.length === 0) {
        await react('❌');
        return reply('_No tracks found!_');
      }
      
      const results = res.data.tracks.slice(0, 8);
      let list = results.map((t, i) => 
        `_${i + 1}. ${t.trackName}_\n_by ${t.artist} • ${t.durationMs}_`
      ).join('\n\n');
      
      const statusMsg = await reply(`_Search results for: ${query}_\n\n${list}\n\n_Reply with a number (1-${results.length}) to download_`);
      
      pendingSpotify[m.sender] = { 
        key: statusMsg.key, 
        results, 
        chat: m.chat 
      };
      
      await react('✅');
      
    } catch (err) {
      console.error('Spotify search error:', err);
      await react('❌');
      return reply('_Error fetching search results!_');
    }
  },
  
  // Handle number selection
  onText: true,
  
  async handleText(sock, m, context) {
    const userState = pendingSpotify[m.sender];
    if (!userState) return;
    if (userState.chat !== m.chat) return;
    
    const selected = parseInt(m.body.trim());
    if (isNaN(selected) || selected < 1 || selected > userState.results.length) return;
    
    const track = userState.results[selected - 1];
    delete pendingSpotify[m.sender];
    
    try {
      await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
      
      const res = await axios.get(`https://jerrycoder.oggyapi.workers.dev/down/spotify?url=${encodeURIComponent(track.spotifyUrl)}`);
      
      if (!res.data.status || !res.data.download_link) {
        await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
        return;
      }
      
      const dl = res.data;
      const audioRes = await axios.get(dl.download_link, { responseType: 'arraybuffer', timeout: 60000 });
      const audioPath = getTempPath(`spotify.mp3`);
      fs.writeFileSync(audioPath, audioRes.data);
      
      await sock.sendMessage(m.chat, {
        audio: fs.readFileSync(audioPath),
        mimetype: 'audio/mpeg',
        fileName: `${dl.title} - ${dl.artist}.mp3`
      }, { quoted: m });
      
      cleanTemp(audioPath);
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
      
    } catch (err) {
      console.error('Spotify download error:', err);
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
    }
  }
};