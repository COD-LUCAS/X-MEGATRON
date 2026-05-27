/**
 * spotify.js — plugins/spotify.js
 * Commands: .sp <song name or spotify url>
 * Reply with a number after search to download.
 */

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

    // Input: args or quoted message text
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

      // Store pending state
      pendingSpotify[m.sender] = { key: waitMsg.key, results };

      // Auto-clear after 2 minutes
      setTimeout(() => { delete pendingSpotify[m.sender]; }, 2 * 60 * 1000);

    } catch (e) {
      console.error('Spotify search error:', e.message);
      await editMsg(sock, m.chat, waitMsg.key, '_error fetching search results_');
    }
  },

  // ── onText: handles number reply after search ────────────────
  async handleText(sock, m, ctx) {
    const state = pendingSpotify[m.sender];
    if (!state) return;

    const num = parseInt((m.body || '').trim());
    if (isNaN(num) || num < 1 || num > state.results.length) return;

    const track = state.results[num - 1];
    delete pendingSpotify[m.sender];

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
    }

    const res = await axios.get(
      `https://jerrycoder.oggyapi.workers.dev/down/spotify?url=${encodeURIComponent(url)}`,
      { timeout: 20000 }
    );

    if (!res.data?.status || !res.data?.download_link) {
      return await editMsg(sock, m.chat, msgKey, '_failed to get download link_');
    }

    const dl    = res.data;
    const title  = dl.title  || trackName || 'track';
    const dlArtist = dl.artist || artist  || '';

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

    await editMsg(sock, m.chat, msgKey, `_${title} - ${dlArtist}_`);

  } catch (e) {
    console.error('Spotify download error:', e.message);
    if (msgKey) await editMsg(sock, m.chat, msgKey, '_error downloading track_');
  }
}

async function editMsg(sock, chat, key, text) {
  try {
    await sock.sendMessage(chat, {
      text,
      edit: key
    });
  } catch {
    // fallback if edit not supported
    await sock.sendMessage(chat, { text }).catch(() => {});
  }
}
