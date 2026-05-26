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
  command: ['setbotpp', 'setppbot', 'setpp', 'pp', 'fullpp'],
  category: 'owner',
  desc: 'Set bot profile picture from image or sticker',
  usage: '.setbotpp (reply to image or sticker)',
  owner: true,

  async execute(sock, m, context) {
    const { reply, command, isOwner } = context;
    
    if (!isOwner) return reply('_Owner only_');
    
    // Check if message is a reply
    if (!m.quoted) {
      return reply('_Reply to an image or sticker_\n_Usage: .setbotpp_');
    }
    
    const quotedMsg = m.quoted.message;
    if (!quotedMsg) {
      return reply('_Could not find quoted message_');
    }
    
    // Check for image or sticker
    const imageMessage = quotedMsg.imageMessage;
    const stickerMessage = quotedMsg.stickerMessage;
    
    if (!imageMessage && !stickerMessage) {
      return reply('_Reply to an image or sticker_');
    }
    
    const mediaMessage = imageMessage || stickerMessage;
    const imagePath = getTempPath('profile.jpg');
    
    try {
      // Download media
      const stream = await downloadContentFromMessage(mediaMessage, 'image');
      let buffer = Buffer.alloc(0);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }
      
      // Check file size
      if (buffer.length > MAX_FILE_SIZE) {
        cleanTemp(imagePath);
        return reply(`_File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (max: 10MB)_`);
      }
      
      // Save the image
      fs.writeFileSync(imagePath, buffer);
      
      // Set profile picture
      await sock.updateProfilePicture(sock.user.id, buffer);
      
      await reply('_Profile picture updated_');
      
    } catch (error) {
      console.error('setbotpp error:', error);
      reply('_Failed to update profile picture_');
    } finally {
      cleanTemp(imagePath);
    }
  }
};