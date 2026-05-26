'use strict';

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'database', 'autoreact.json');

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return {
        enabled: data.enabled || false,
        mode: data.mode || 'bot'
      };
    }
  } catch (err) {}
  return {
    enabled: false,
    mode: 'bot'
  };
}

function save(data) {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {}
  return false;
}

const EMOJIS = ['👍', '👌', '❤️', '🔥', '✨', '💯', '✅', '⭐', '🎉', '👏'];

module.exports = {
  command: ['autoreact'],
  category: 'owner',
  desc: 'Configure automatic reactions to messages',
  usage: '.autoreact on | off | bot | all',

  async execute(sock, m, context) {
    const { reply, args, isOwner } = context;
    
    if (!isOwner) return reply('_Owner only_');
    
    const db = load();
    const opt = args[0]?.toLowerCase();
    
    if (!opt) {
      const status = db.enabled ? 'ON' : 'OFF';
      const mode = db.mode === 'bot' ? 'Bot commands' : 'All messages';
      return reply(`_Auto-react: ${status}_\n_Mode: ${mode}_`);
    }
    
    if (opt === 'on') {
      db.enabled = true;
      save(db);
      return reply('_Auto-react enabled_');
    }
    
    if (opt === 'off') {
      db.enabled = false;
      save(db);
      return reply('_Auto-react disabled_');
    }
    
    if (opt === 'bot') {
      db.enabled = true;
      db.mode = 'bot';
      save(db);
      return reply('_Auto-react mode: Bot commands only_');
    }
    
    if (opt === 'all') {
      db.enabled = true;
      db.mode = 'all';
      save(db);
      return reply('_Auto-react mode: All messages_');
    }
    
    return reply('_Use: on | off | bot | all_');
  },
  
  load,
  save,
  EMOJIS
};
