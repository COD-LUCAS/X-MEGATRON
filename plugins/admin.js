'use strict';

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, "..", "database");
const SETTINGS_FILE = path.join(DB_DIR, "settings.json");

let settings = {
  botName: "X MEGATRON",
  menuImage: "https://files.catbox.moe/a6pqf1.jpg",
  owner: "COD-LUCAS"
};

try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    settings = { ...settings, ...saved };
  }
} catch (e) {}

const saveSettings = () => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return true;
  } catch (e) {
    return false;
  }
};

module.exports = {
  command: ['setbotname', 'setowner'],
  category: 'app',
  desc: 'Change bot settings',
  usage: '.setbotname <name> | .setowner <name>',

  async execute(sock, m, context) {
    const { command, args, reply, isOwner } = context;
    
    if (!isOwner) return reply('_Owner only_');

    if (command === 'setbotname') {
      const newName = args.join(' ');
      if (!newName) return reply('_Usage: .setbotname <name>_');
      
      settings.botName = newName;
      if (saveSettings()) {
        return reply(`_Bot name changed to: ${newName}_`);
      } else {
        return reply('_Failed to save settings_');
      }
    }

    if (command === 'setowner') {
      const newOwner = args.join(' ');
      if (!newOwner) return reply('_Usage: .setowner <name>_');
      
      settings.owner = newOwner;
      if (saveSettings()) {
        return reply(`_Owner changed to: ${newOwner}_`);
      } else {
        return reply('_Failed to save settings_');
      }
    }
  }
};