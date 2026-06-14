'use strict';

const axios = require('axios');

// Per-sender pending search state (in-memory)
const pendingSpotify = {};

const SPOTIFY_TRACK_REGEX = /https?:\/\/open\.spotify\.com\/track\/[^\s]+/i;

module.exports = {
  name: 'spotify',
  command: ['sp'],
  category: 'downloader',
  desc: 'Search and download Spotify songs',
  usage: '.sp <song name or spotify url>',

  async execute(sock, m, ctx) {
    const { args, reply } = ctx;

    let query = args.join(' ').trim();
    if (!query && m.quoted?.text) query = m.quoted.text.trim();
    if (!query) return reply('_give me a song name or spotify url_');

    // ── Direct URL download ──────────────────────────────────────
    if (SPOTIFY_TRACK_REGEX.test(query)) {
      return await downloadTrack(sock, m, query, null);
    }

    // ── Search ───────────────────────────────────────────────────
    const waitMsg = await sock.sendMessage(m.chat, {
      text: `_searching: ${query}_`
    }, { quoted: m });

    try {
      const res = await axios.get(
        `https://jerrycoder.oggyapi.workers.dev/search/spotify?q=${encodeURIComponent(query)}`,
        { timeout: 15000 }
      );

      const tracks = res.data?.tracks;
      if (!tracks || tracks.length === 0) {
        return await editMsg(sock, m.chat, waitMsg.key, '_no tracks found_');
      }

      const results = tracks.slice(0, 8);

      const list = results
        .map((t, i) => `*${i + 1}.* ${t.trackName}\n_${t.artist} • ${t.durationMs}_`)
        .join('\n\n');

      await editMsg(
        sock,
        m.chat,
        waitMsg.key,
        `_results for: ${query}_\n\n${list}\n\n_reply with a number to download_`
      );

      // Store pending — key by chat+sender so it works in both PM and group
      const stateKey = `${m.chat}::${m.sender}`;
      pendingSpotify[stateKey] = { key: waitMsg.key, results };

      // Auto-clear after 2 minutes
      setTimeout(() => { delete pendingSpotify[stateKey]; }, 2 * 60 * 1000);

    } catch (e) {
      console.error('Spotify search error:', e.message);
      await editMsg(sock, m.chat, waitMsg.key, '_error fetching search results_');
    }
  },

  // ── handleText: handles number reply after search ─────────────
  async handleText(sock, m, ctx) {
    // Key by chat+sender to support both PM and group
    const stateKey = `${m.chat}::${m.sender}`;
    const state = pendingSpotify[stateKey];
    if (!state) return;

    const body = (m.body || '').trim();
    const num  = parseInt(body);
    if (isNaN(num) || num < 1 || num > state.results.length) return;

    // Must be a plain number — ignore if it has other words
    if (body !== String(num)) return;

    const track = state.results[num - 1];
    delete pendingSpotify[stateKey];

    await downloadTrack(sock, m, track.spotifyUrl, state.key, track.trackName, track.artist);
  }
};

// ── Helpers ───────────────────────────────────────────────────────────

async function downloadTrack(sock, m, url, existingKey, trackName, artist) {
  let msgKey = existingKey;

  try {
    if (!msgKey) {
      const sent = await sock.sendMessage(m.chat, {
        text: '_fetching track info_'
      }, { quoted: m });
      msgKey = sent.key;
    } else {
      await editMsg(sock, m.chat, msgKey, '_fetching track info_');
    }

    const res = await axios.get(
      `https://jerrycoder.oggyapi.workers.dev/down/spotify?url=${encodeURIComponent(url)}`,
      { timeout: 20000 }
    );

    if (!res.data?.status || !res.data?.download_link) {
      return await editMsg(sock, m.chat, msgKey, '_failed to get download link_');
    }

    const dl       = res.data;
    const title    = dl.title  || trackName || 'track';
    const dlArtist = dl.artist || artist    || '';

    await editMsg(sock, m.chat, msgKey, `_downloading: ${title} - ${dlArtist}_`);

    const audio = await axios.get(dl.download_link, {
      responseType: 'arraybuffer',
      timeout: 60000
    });

    await sock.sendMessage(
      m.chat,
      {
        audio:    Buffer.from(audio.data),
        mimetype: 'audio/mpeg',
        fileName: `${title} - ${dlArtist}.mp3`,
        ptt:      false
      },
      { quoted: m }
    );

    await editMsg(sock, m.chat, msgKey, `_✅ ${title} - ${dlArtist}_`);

  } catch (e) {
    console.error('Spotify download error:', e.message);
    if (msgKey) await editMsg(sock, m.chat, msgKey, `_error: ${e.message}_`);
  }
}

async function editMsg(sock, chat, key, text) {
  try {
    await sock.sendMessage(chat, { text, edit: key });
  } catch {
    await sock.sendMessage(chat, { text }).catch(() => {});
  }
}
