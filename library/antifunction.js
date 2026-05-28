/**
 * library/antifunction.js
 * Single data layer for ALL group anti-features.
 * Saves to: database/group_data.json
 * Used by: plugins/antispam.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'database', 'group_data.json');

const DEFAULTS = {
  antilink:    {},
  antibadword: {},
  antispam:    {},
  antitag:     {},
  warnings:    {}
};

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULTS, null, 2));
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // ensure all keys exist
    for (const k of Object.keys(DEFAULTS)) {
      if (!raw[k]) raw[k] = {};
    }
    return raw;
  } catch (e) {
    console.error('[antifunction] load error:', e.message);
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('[antifunction] save error:', e.message);
    return false;
  }
}

// ── ANTILINK ──────────────────────────────────────────────────────────
const setAntilink    = (gid, enabled, action = 'delete') => {
  const d = load();
  d.antilink[gid] = { enabled, action };
  return save(d);
};
const getAntilink    = (gid) => { const d = load(); return d.antilink[gid] || null; };
const removeAntilink = (gid) => {
  const d = load();
  delete d.antilink[gid];
  return save(d);
};

// ── ANTIBADWORD ───────────────────────────────────────────────────────
const setAntibadword = (gid, enabled, action = 'delete') => {
  const d = load();
  const existing = d.antibadword[gid] || { words: [] };
  d.antibadword[gid] = { enabled, action, words: existing.words };
  return save(d);
};
const getAntibadword    = (gid) => { const d = load(); return d.antibadword[gid] || null; };
const removeAntibadword = (gid) => {
  const d = load();
  delete d.antibadword[gid];
  return save(d);
};
const addBadword = (gid, word) => {
  const d = load();
  if (!d.antibadword[gid]) d.antibadword[gid] = { enabled: false, action: 'delete', words: [] };
  if (d.antibadword[gid].words.includes(word)) return false;
  d.antibadword[gid].words.push(word);
  return save(d);
};
const removeBadword = (gid, word) => {
  const d = load();
  const words = d.antibadword[gid]?.words || [];
  const idx = words.indexOf(word);
  if (idx === -1) return false;
  words.splice(idx, 1);
  return save(d);
};
const getBadwords = (gid) => { const d = load(); return d.antibadword[gid]?.words || []; };

// ── ANTISPAM ──────────────────────────────────────────────────────────
const setAntispam    = (gid, enabled, limit = 5) => {
  const d = load();
  d.antispam[gid] = { enabled, limit };
  return save(d);
};
const getAntispam    = (gid) => { const d = load(); return d.antispam[gid] || null; };
const removeAntispam = (gid) => {
  const d = load();
  delete d.antispam[gid];
  return save(d);
};

// ── ANTITAG ───────────────────────────────────────────────────────────
const setAntitag    = (gid, enabled, action = 'delete') => {
  const d = load();
  d.antitag[gid] = { enabled, action };
  return save(d);
};
const getAntitag    = (gid) => { const d = load(); return d.antitag[gid] || null; };
const removeAntitag = (gid) => {
  const d = load();
  delete d.antitag[gid];
  return save(d);
};

// ── WARNINGS ──────────────────────────────────────────────────────────
const incrementWarning = (gid, uid) => {
  const d = load();
  if (!d.warnings[gid]) d.warnings[gid] = {};
  d.warnings[gid][uid] = (d.warnings[gid][uid] || 0) + 1;
  save(d);
  return d.warnings[gid][uid];
};
const resetWarning = (gid, uid) => {
  const d = load();
  if (d.warnings[gid]) { d.warnings[gid][uid] = 0; save(d); }
};
const getWarnings = (gid, uid) => {
  const d = load();
  return d.warnings[gid]?.[uid] || 0;
};

module.exports = {
  setAntilink, getAntilink, removeAntilink,
  setAntibadword, getAntibadword, removeAntibadword,
  addBadword, removeBadword, getBadwords,
  setAntispam, getAntispam, removeAntispam,
  setAntitag, getAntitag, removeAntitag,
  incrementWarning, resetWarning, getWarnings,
};
