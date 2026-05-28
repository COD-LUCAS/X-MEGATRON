/**
 * library/antifunction.js
 * Central data store for all group protection settings.
 * Adapted from KnightBot-MD lib/index.js — X-Megatron style.
 * Data saved to: database/group_data.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'database', 'group_data.json');

// ── Load / Save ───────────────────────────────────────────────────────
function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const def = { antilink: {}, antibadword: {}, antispam: {}, warnings: {} };
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(def, null, 2));
      return def;
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('antifunction load error:', e.message);
    return { antilink: {}, antibadword: {}, antispam: {}, warnings: {} };
  }
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('antifunction save error:', e.message);
    return false;
  }
}

// ── ANTILINK ─────────────────────────────────────────────────────────
function setAntilink(groupId, enabled, action = 'delete') {
  const data = load();
  if (!data.antilink) data.antilink = {};
  data.antilink[groupId] = { enabled, action };
  return save(data);
}

function getAntilink(groupId) {
  const data = load();
  return data.antilink?.[groupId] || null;
}

function removeAntilink(groupId) {
  const data = load();
  if (data.antilink?.[groupId]) {
    delete data.antilink[groupId];
    save(data);
  }
}

// ── ANTIBADWORD ──────────────────────────────────────────────────────
function setAntibadword(groupId, enabled, action = 'delete') {
  const data = load();
  if (!data.antibadword) data.antibadword = {};
  if (!data.antibadword[groupId]) data.antibadword[groupId] = { enabled, action, words: [] };
  else { data.antibadword[groupId].enabled = enabled; data.antibadword[groupId].action = action; }
  return save(data);
}

function getAntibadword(groupId) {
  const data = load();
  return data.antibadword?.[groupId] || null;
}

function removeAntibadword(groupId) {
  const data = load();
  if (data.antibadword?.[groupId]) {
    delete data.antibadword[groupId];
    save(data);
  }
}

function addBadword(groupId, word) {
  const data = load();
  if (!data.antibadword) data.antibadword = {};
  if (!data.antibadword[groupId]) data.antibadword[groupId] = { enabled: false, action: 'delete', words: [] };
  if (!data.antibadword[groupId].words.includes(word)) {
    data.antibadword[groupId].words.push(word);
    save(data);
    return true;
  }
  return false; // already exists
}

function removeBadword(groupId, word) {
  const data = load();
  const words = data.antibadword?.[groupId]?.words || [];
  const idx = words.indexOf(word);
  if (idx === -1) return false;
  words.splice(idx, 1);
  save(data);
  return true;
}

function getBadwords(groupId) {
  const data = load();
  return data.antibadword?.[groupId]?.words || [];
}

// ── ANTISPAM ─────────────────────────────────────────────────────────
function setAntispam(groupId, enabled, limit = 5) {
  const data = load();
  if (!data.antispam) data.antispam = {};
  data.antispam[groupId] = { enabled, limit };
  return save(data);
}

function getAntispam(groupId) {
  const data = load();
  return data.antispam?.[groupId] || null;
}

function removeAntispam(groupId) {
  const data = load();
  if (data.antispam?.[groupId]) {
    delete data.antispam[groupId];
    save(data);
  }
}

// ── WARNINGS ─────────────────────────────────────────────────────────
function incrementWarning(groupId, userId) {
  const data = load();
  if (!data.warnings) data.warnings = {};
  if (!data.warnings[groupId]) data.warnings[groupId] = {};
  if (!data.warnings[groupId][userId]) data.warnings[groupId][userId] = 0;
  data.warnings[groupId][userId]++;
  save(data);
  return data.warnings[groupId][userId];
}

function resetWarning(groupId, userId) {
  const data = load();
  if (data.warnings?.[groupId]?.[userId] !== undefined) {
    data.warnings[groupId][userId] = 0;
    save(data);
  }
}

function getWarnings(groupId, userId) {
  const data = load();
  return data.warnings?.[groupId]?.[userId] || 0;
}

module.exports = {
  // antilink
  setAntilink, getAntilink, removeAntilink,
  // antibadword
  setAntibadword, getAntibadword, removeAntibadword,
  addBadword, removeBadword, getBadwords,
  // antispam
  setAntispam, getAntispam, removeAntispam,
  // warnings
  incrementWarning, resetWarning, getWarnings,
};
