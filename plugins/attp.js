/**
 * attp.js — plugins/attp.js
 * Command: .attp <text>
 * Creates an animated blinking text sticker using ffmpeg.
 * Requires: ffmpeg installed on server, library/exif.js
 */

'use strict';

const { spawn } = require('child_process');
const fs        = require('fs');
const { writeExifVid } = require('../library/exif');

// ── Font path (Linux server / Windows fallback) ───────────────────────
const FONT_PATH = process.platform === 'win32'
  ? 'C:/Windows/Fonts/arialbd.ttf'
  : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

// ── Escape text for ffmpeg drawtext filter ────────────────────────────
function escapeDrawtext(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/:/g,  '\\:')
    .replace(/,/g,  '\\,')
    .replace(/'/g,  "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g,  '\\%');
}

// ── Render blinking color-cycle MP4 via ffmpeg ────────────────────────
function renderBlinkingMp4(text) {
  return new Promise((resolve, reject) => {
    const safe     = escapeDrawtext(text);
    const fontFile = process.platform === 'win32'
      ? FONT_PATH.replace(/\\/g, '/').replace(':', '\\:')
      : FONT_PATH;

    const cycle = 0.3;  // seconds per color cycle
    const dur   = 1.8;  // total duration (6 cycles)

    const base = `fontfile='${fontFile}':text='${safe}':fontsize=56:borderw=2:bordercolor=black@0.6:x=(w-text_w)/2:y=(h-text_h)/2`;

    const drawRed   = `drawtext=${base}:fontcolor=red:enable='lt(mod(t\\,${cycle})\\,0.1)'`;
    const drawBlue  = `drawtext=${base}:fontcolor=blue:enable='between(mod(t\\,${cycle})\\,0.1\\,0.2)'`;
    const drawGreen = `drawtext=${base}:fontcolor=green:enable='gte(mod(t\\,${cycle})\\,0.2)'`;

    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=black:s=512x512:d=${dur}:r=20`,
      '-vf', `${drawRed},${drawBlue},${drawGreen}`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart+frag_keyframe+empty_moov',
      '-t', String(dur),
      '-f', 'mp4',
      'pipe:1'
    ];

    const ff     = spawn('ffmpeg', args);
    const chunks = [];
    const errs   = [];

    ff.stdout.on('data', d => chunks.push(d));
    ff.stderr.on('data', e => errs.push(e));
    ff.on('error', reject);
    ff.on('close', code => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      reject(new Error(Buffer.concat(errs).toString() || `ffmpeg exited ${code}`));
    });
  });
}

// ── Plugin ────────────────────────────────────────────────────────────
module.exports = {
  command:  ['attp'],
  category: 'sticker',
  desc:     'Make an animated blinking text sticker',
  usage:    '.attp <your text>',

  async execute(sock, m, ctx) {
    const { reply, text } = ctx;

    // Accept text from args OR from quoted message
    const input = text?.trim() || m.quoted?.body?.trim() || '';
    if (!input) return reply('_usage: .attp <text>_');

    await reply('_generating sticker_');

    let webpPath = null;
    try {
      const mp4Buffer = await renderBlinkingMp4(input);

      webpPath = await writeExifVid(mp4Buffer, {
        packname: 'X MEGATRON',
        author:   'COD-LUCAS'
      });

      const webpBuffer = fs.readFileSync(webpPath);

      await sock.sendMessage(m.chat, {
        sticker: webpBuffer
      }, { quoted: m });

    } catch (err) {
      console.error('attp error:', err.message);
      return reply('_failed to generate sticker - make sure ffmpeg is installed_');
    } finally {
      // Always clean up temp file
      if (webpPath) {
        try { fs.unlinkSync(webpPath); } catch (_) {}
      }
    }
  }
};
