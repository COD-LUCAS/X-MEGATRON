'use strict';

const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '..', 'database', 'group_settings.json');

const getGlobalSettings = () => {
  try {
    if (fs.existsSync(DB)) {
      const data = JSON.parse(fs.readFileSync(DB, 'utf8'));
      return data.__global || {};
    }
  } catch (_) {}
  return {};
};

const saveGlobalSettings = (settings) => {
  try {
    let data = {};
    if (fs.existsSync(DB)) {
      data = JSON.parse(fs.readFileSync(DB, 'utf8'));
    }
    data.__global = settings;
    fs.writeFileSync(DB, JSON.stringify(data, null, 2));
  } catch (_) {}
};

module.exports = {
  command: ['anticall'],
  category: 'group',
  desc: 'Reject incoming calls automatically',
  usage: '.anticall on/off/status',

  async execute(sock, m, context) {
    const { args, reply, isOwner, prefix } = context;
    
    if (!isOwner) {
      return reply('_Owner only_');
    }

    const sub = args[0]?.toLowerCase();
    const settings = getGlobalSettings();
    const isOn = settings.anticall === true;

    if (sub === 'on') {
      saveGlobalSettings({ ...settings, anticall: true });
      return reply('_Anticall ON_ - All incoming calls will be rejected');
    }
    
    if (sub === 'off') {
      saveGlobalSettings({ ...settings, anticall: false });
      return reply('_Anticall OFF_ - Calls will ring normally');
    }
    
    if (sub === 'status') {
      return reply(`_Anticall: ${isOn ? 'ON' : 'OFF'}_`);
    }

    return reply(`_Anticall: ${isOn ? 'ON' : 'OFF'}_\n\n_Usage:_\n_${prefix}anticall on_\n_${prefix}anticall off_\n_${prefix}anticall status_`);
  }
};