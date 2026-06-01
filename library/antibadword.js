
/**
 * library/antibadword.js
 * Antibadword helper — detection + per-group config.
 * Uses library/antifunction.js for storage.
 *
 * Standard word list only — not exhaustive.
 * Users can add/remove custom words per group.
 */

'use strict';

const {
  setAntibadword, getAntibadword, removeAntibadword,
  addBadword, removeBadword, getBadwords,
  incrementWarning, resetWarning,
} = require('./antifunction');

// ── Standard bad word list (clean, not exhaustive) ─────────────────────
// Only universally recognized offensive words — no slang overload
const STANDARD_WORDS = [
  // English profanity
  'fuck','fucker','fucking','fck','fuk','f*ck','f@ck',
  'shit','bitch','bastard','asshole','dick','cock','cunt',
  'pussy','prick','whore','slut','motherfucker','wanker',
  'jackass','douchebag','retard','faggot','nigger','nigga',
  // Hindi/Hinglish (core)
  'madarchod','bhosdike','bsdk','bhosda','lauda','lund',
  'chutiya','chut','randi','harami','behenchod','gandu',
  'benchod','betichod','gaand','chodne','chudai',
  'randi ki aulad','maa ki chut','teri maa ki',
  // Sexual (universal)
  'porn','xxx','blowjob','handjob','cumshot','dildo',
  'gangbang','threesome','hentai',
];

const WARN_LIMIT = 3;

// ── Detection ─────────────────────────────────────────────────────────
function detectBadWord(text, customWords = []) {
  const clean = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const all   = [...new Set([...STANDARD_WORDS, ...customWords.map(w => w.toLowerCase())])];
  const words = clean.split(' ');

  for (const w of words) {
    if (w.length < 2) continue;
    if (all.includes(w)) return w;
  }
  for (const phrase of all) {
    if (phrase.includes(' ') && clean.includes(phrase)) return phrase;
  }
  return null;
}

// ── Handle detection (called from groupFilter) ────────────────────────
async function handleBadwordDetection(sock, m, isBotAdmin) {
  if (!m.isGroup || !m.body) return false;

  const cfg = getAntibadword(m.chat);
  if (!cfg?.enabled) return false;
  if (!isBotAdmin) return false;

  const customWords = getBadwords(m.chat);
  const found = detectBadWord(m.body, customWords);
  if (!found) return false;

  const sender = m.sender || '';

  // Delete message
  try { await sock.sendMessage(m.chat, { delete: m.key }); } catch (_) {}

  if (cfg.action === 'kick') {
    try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
    await sock.sendMessage(m.chat, {
      text: `@${sender.split('@')[0]} _removed for using bad words_`,
      mentions: [sender]
    }).catch(() => {});

  } else if (cfg.action === 'warn') {
    const count = incrementWarning(m.chat, sender);
    if (count >= WARN_LIMIT) {
      resetWarning(m.chat, sender);
      try { await sock.groupParticipantsUpdate(m.chat, [sender], 'remove'); } catch (_) {}
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _removed after ${WARN_LIMIT} warnings_`,
        mentions: [sender]
      }).catch(() => {});
    } else {
      await sock.sendMessage(m.chat, {
        text: `@${sender.split('@')[0]} _warning ${count}/${WARN_LIMIT} - bad words not allowed_`,
        mentions: [sender]
      }).catch(() => {});
    }

  } else {
    // delete only
    await sock.sendMessage(m.chat, {
      text: `@${sender.split('@')[0]} _bad words are not allowed here_`,
      mentions: [sender]
    }).catch(() => {});
  }

  return true;
}

module.exports = {
  handleBadwordDetection,
  detectBadWord,
  STANDARD_WORDS,
  // re-export antifunction helpers for plugin use
  setAntibadword, getAntibadword, removeAntibadword,
  addBadword, removeBadword, getBadwords,
};
