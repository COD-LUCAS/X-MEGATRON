'use strict';

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require("@itsliaaa/baileys");

const DB_DIR = path.join(__dirname, '..', 'database');
const SETTINGS_FILE = path.join(DB_DIR, 'antivv.json');

// Load settings
let settings = {};
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } else {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
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

// Get setting for chat
const getSetting = (jid) => {
  if (settings.global?.enabled && settings.global?.forwardJid) {
    return { enabled: true, forwardJid: settings.global.forwardJid, sendToChat: false };
  }
  
  const chatSetting = settings[jid];
  if (chatSetting?.enabled) {
    return { enabled: true, forwardJid: chatSetting.forwardJid, sendToChat: chatSetting.sendToChat };
  }
  
  return { enabled: false };
};

// Extract view once media
const extractViewOnce = (msg) => {
  let q = msg;
  const wrap = ["viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension"]
    .find(k => q[k]);
  if (wrap) q = q[wrap].message;
  
  const media = q.imageMessage ? "imageMessage" :
                q.videoMessage ? "videoMessage" :
                q.audioMessage ? "audioMessage" : null;
  
  if (media) return { media, msg: q[media] };
  return null;
};

// Download media
const downloadMedia = async (msg, type) => {
  const stream = await downloadContentFromMessage(msg, type);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
};

module.exports = {
  command: ['antivv'],
  category: 'ANTI-FUNCTIONS',
  desc: 'Auto detect view once messages',
  usage: '.antivv on | .antivv off | .antivv on <jid> | .antivv on chat',

  async execute(sock, m, context) {
    const { args, reply, isOwner, prefix } = context;
    
    if (!isOwner) return reply('_Owner only_');

    const sub = args[0]?.toLowerCase();
    const jid = args[1]?.toLowerCase();

    if (sub === 'on') {
      if (jid === 'chat') {
        // Send to same chat where view once appears
        settings[m.chat] = { enabled: true, forwardJid: null, sendToChat: true };
        saveSettings();
        
        // Hot reload - clear cache
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        
        return reply(`_Antivv ON for this chat_\n_View once will be sent here_`);
      }
      
      if (jid && jid.includes('@')) {
        // Send to specific JID
        settings[m.chat] = { enabled: true, forwardJid: jid, sendToChat: false };
        saveSettings();
        
        // Hot reload - clear cache
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        
        return reply(`_Antivv ON for this chat_\n_Forwarding to: ${jid}_`);
      }
      
      // Global setting
      settings.global = { enabled: true, forwardJid: m.chat, sendToChat: true };
      saveSettings();
      
      // Hot reload - clear cache
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      
      return reply(`_Antivv ON globally_\n_View once will be sent here_`);
    }

    if (sub === 'off') {
      if (jid === 'global') {
        delete settings.global;
        saveSettings();
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        return reply('_Antivv OFF globally_');
      }
      
      delete settings[m.chat];
      saveSettings();
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      return reply('_Antivv OFF for this chat_');
    }

    // Status
    const current = getSetting(m.chat);
    let status = `_Antivv Status_\n\n`;
    status += `_Enabled: ${current.enabled ? 'ON' : 'OFF'}_\n`;
    if (current.enabled) {
      if (current.forwardJid) status += `_Forward to: ${current.forwardJid}_\n`;
      if (current.sendToChat) status += `_Send in same chat: YES_\n`;
    }
    status += `\n_${prefix}antivv on - Enable for this chat_\n`;
    status += `_${prefix}antivv on <jid> - Forward to specific JID_\n`;
    status += `_${prefix}antivv on chat - Send in same chat_\n`;
    status += `_${prefix}antivv off - Disable for this chat_\n`;
    status += `_${prefix}antivv off global - Disable globally_`;
    
    return reply(status);
  },

  // Auto detect view once messages
  onText: true,

  async handleText(sock, m, context) {
    try {
      if (!m.message) return;
      
      const setting = getSetting(m.chat);
      if (!setting.enabled) return;

      // Extract view once media
      const viewOnce = extractViewOnce(m.message);
      if (!viewOnce) return;

      // Download media
      const mediaType = viewOnce.media === 'imageMessage' ? 'image' :
                        viewOnce.media === 'videoMessage' ? 'video' : 'audio';
      const buffer = await downloadMedia(viewOnce.msg, mediaType);
      
      if (!buffer) return;

      // Determine where to send
      let targetJid = setting.forwardJid;
      let sendToChat = setting.sendToChat;
      
      if (!targetJid && sendToChat) {
        targetJid = m.chat;
      }
      
      if (!targetJid) return;

      // Send the revealed media
      if (viewOnce.media === 'imageMessage') {
        await sock.sendMessage(targetJid, {
          image: buffer,
          caption: `_View once revealed from @${m.sender.split('@')[0]}_`,
          mentions: [m.sender]
        });
      } else if (viewOnce.media === 'videoMessage') {
        await sock.sendMessage(targetJid, {
          video: buffer,
          caption: `_View once revealed from @${m.sender.split('@')[0]}_`,
          mentions: [m.sender]
        });
      } else if (viewOnce.media === 'audioMessage') {
        await sock.sendMessage(targetJid, {
          audio: buffer,
          mimetype: 'audio/mpeg',
          ptt: false
        });
      }

      // React to the original message
      await sock.sendMessage(m.chat, { react: { text: '👁️', key: m.key } }).catch(() => {});

    } catch (err) {
      console.error('AntiVV error:', err);
    }
  }
};