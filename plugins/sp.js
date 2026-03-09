const axios = require('axios');

let pendingSpotify = {};

module.exports = {
  command: ['spotify', 'sp'],
  category: 'downloader',
  desc: 'Search & Download Spotify songs',
  usage: '.sp <song name or Spotify URL>',

  async execute(sock, m, context) {
    let query = context.text?.trim();

    if (!query && m.quoted) {
      query = m.quoted.text?.trim();
    }

    if (!query) {
      return m.reply('_Give me a song name or Spotify URL_');
    }

    if (query.startsWith('http') && query.includes('spotify.com/track/')) {
      try {
        const waitMsg = await m.reply('_⬇️ Fetching track info..._');

        const res = await axios.get(`https://jerrycoder.oggyapi.workers.dev/dspotify?url=${encodeURIComponent(query)}`);

        if (!res.data.status || !res.data.download_link) {
          return sock.sendMessage(m.chat, {
            text: '_Failed to get download link_',
            edit: waitMsg.key
          });
        }

        const track = res.data;

        await sock.sendMessage(m.chat, {
          text: `_⬇️ Downloading: ${track.title} - ${track.artist}_`,
          edit: waitMsg.key
        });

        const response = await axios.get(track.download_link, { responseType: 'arraybuffer' });

        await sock.sendMessage(m.chat, {
          audio: Buffer.from(response.data),
          mimetype: 'audio/mpeg',
          fileName: `${track.title} - ${track.artist}.mp3`
        }, { quoted: m });

        await sock.sendMessage(m.chat, {
          text: `_✅ ${track.title} - ${track.artist}_`,
          edit: waitMsg.key
        });

      } catch (err) {
        return m.reply('_Error downloading track_');
      }

      return;
    }

    try {
      const waitMsg = await m.reply(`_Searching for: ${query}_`);

      const res = await axios.get(`https://jerrycoder.oggyapi.workers.dev/spotify?search=${encodeURIComponent(query)}`);

      if (!res.data.tracks || res.data.tracks.length === 0) {
        return sock.sendMessage(m.chat, {
          text: '_No tracks found_',
          edit: waitMsg.key
        });
      }

      const results = res.data.tracks.slice(0, 8);

      let list = results.map((t, i) =>
        `${i + 1}. *${t.trackName}*\n_${t.artist} • ${t.durationMs}_`
      ).join('\n\n');

      await sock.sendMessage(m.chat, {
        text: `*🎵 Search results for:* _"${query}"_\n\n${list}\n\n_Reply with number (1–${results.length}) to download_`,
        edit: waitMsg.key
      });

      pendingSpotify[m.sender] = { 
        key: waitMsg.key, 
        results,
        chat: m.chat 
      };

    } catch (err) {
      return m.reply('_Error fetching search results_');
    }
  },

  onText: true,

  async handleText(sock, m, context) {
    const userState = pendingSpotify[m.sender];
    if (!userState) return;

    const selected = parseInt(m.body.trim());

    if (isNaN(selected) || selected < 1 || selected > userState.results.length) return;

    const track = userState.results[selected - 1];
    delete pendingSpotify[m.sender];

    try {
      await sock.sendMessage(userState.chat, {
        text: `_⬇️ Downloading: ${track.trackName} - ${track.artist}_`,
        edit: userState.key
      });

      const res = await axios.get(`https://jerrycoder.oggyapi.workers.dev/dspotify?url=${encodeURIComponent(track.spotifyUrl)}`);

      if (!res.data.status || !res.data.download_link) {
        return sock.sendMessage(userState.chat, {
          text: '_Failed to fetch download link_',
          edit: userState.key
        });
      }

      const dl = res.data;

      const response = await axios.get(dl.download_link, { responseType: 'arraybuffer' });

      await sock.sendMessage(userState.chat, {
        audio: Buffer.from(response.data),
        mimetype: 'audio/mpeg',
        fileName: `${dl.title} - ${dl.artist}.mp3`
      }, { quoted: m });

      await sock.sendMessage(userState.chat, {
        text: `_✅ ${dl.title} - ${dl.artist}_`,
        edit: userState.key
      });

    } catch (err) {
      await sock.sendMessage(userState.chat, {
        text: '_Error downloading_',
        edit: userState.key
      });
    }
  }
};
