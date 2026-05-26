'use strict';

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@itsliaaa/baileys');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const getTempPath = (filename) => path.join(TMP_DIR, `${Date.now()}_${filename}`);
const cleanTemp = (file) => {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
};

module.exports = {
  command: ['setbotpp', 'setppbot', 'pp'],
  category: 'owner',
  desc: 'Set bot profile picture from image or sticker',
  usage: '.setbotpp (reply to image or sticker)',
  owner: true,

  async execute(sock, m, context) {
    const { reply, react, isOwner } = context;
    
    if (!isOwner) return reply('_Owner only_');
    
    if (!m.quoted) {
      return reply('_Reply to an image or sticker_\n_Usage: .setbotpp_');
    }
    
    const quotedMsg = m.quoted.message;
    if (!quotedMsg) {
      return reply('_Could not find quoted message_');
    }
    
    const imageMsg = quotedMsg.imageMessage;
    const stickerMsg = quotedMsg.stickerMessage;
    
    if (!imageMsg && !stickerMsg) {
      return reply('_Reply to an image or sticker_');
    }
    
    const mediaMsg = imageMsg || stickerMsg;
    
    await react('⏳');
    
    try {
      // Download media
      const stream = await downloadContentFromMessage(mediaMsg, 'image');
      let buffer = Buffer.alloc(0);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }
      
      // Check size
      if (buffer.length > MAX_FILE_SIZE) {
        await react('❌');
        return reply(`_File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)_`);
      }
      
      // Update profile picture
      await sock.updateProfilePicture(sock.user.id, buffer);
      
      await react('✅');
      return reply('_Profile picture updated_');
      
    } catch (error) {
      await react('❌');
      console.error('Setbotpp error:', error);
      return reply('_Failed to update profile picture_');
    }
  }
};