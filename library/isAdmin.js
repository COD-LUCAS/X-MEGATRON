/**
 * isAdmin.js — library/isAdmin.js
 * Copied and adapted from KnightBot-MD.
 * Handles all Baileys JID formats including new LID format.
 */

'use strict';

async function isAdmin(sock, chatId, senderId) {
  try {
    const metadata     = await sock.groupMetadata(chatId);
    const participants = metadata.participants || [];

    const botId  = sock.user?.id  || '';
    const botLid = sock.user?.lid || '';

    const botNumber          = botId.includes(':') ? botId.split(':')[0] : (botId.includes('@') ? botId.split('@')[0] : botId);
    const botIdWithoutSuffix = botId.includes('@') ? botId.split('@')[0] : botId;
    const botLidNumeric      = botLid.includes(':') ? botLid.split(':')[0] : (botLid.includes('@') ? botLid.split('@')[0] : botLid);
    const botLidWithoutSuffix = botLid.includes('@') ? botLid.split('@')[0] : botLid;

    const senderNumber          = senderId.includes(':') ? senderId.split(':')[0] : (senderId.includes('@') ? senderId.split('@')[0] : senderId);
    const senderIdWithoutSuffix = senderId.includes('@') ? senderId.split('@')[0] : senderId;

    const isBotAdmin = participants.some(p => {
      const pPhone     = p.phoneNumber ? p.phoneNumber.split('@')[0] : '';
      const pId        = p.id  ? p.id.split('@')[0]  : '';
      const pLid       = p.lid ? p.lid.split('@')[0] : '';
      const pFullId    = p.id  || '';
      const pFullLid   = p.lid || '';
      const pLidNumeric = pLid.includes(':') ? pLid.split(':')[0] : pLid;

      const match = (
        botId  === pFullId  ||
        botId  === pFullLid ||
        botLid === pFullLid ||
        botLidNumeric      === pLidNumeric ||
        botLidWithoutSuffix === pLid       ||
        botNumber          === pPhone      ||
        botNumber          === pId         ||
        botIdWithoutSuffix === pPhone      ||
        botIdWithoutSuffix === pId         ||
        (botLid && botLid.split('@')[0].split(':')[0] === pLid)
      );

      return match && (p.admin === 'admin' || p.admin === 'superadmin');
    });

    const isSenderAdmin = participants.some(p => {
      const pPhone   = p.phoneNumber ? p.phoneNumber.split('@')[0] : '';
      const pId      = p.id  ? p.id.split('@')[0]  : '';
      const pLid     = p.lid ? p.lid.split('@')[0] : '';
      const pFullId  = p.id  || '';
      const pFullLid = p.lid || '';

      const match = (
        senderId === pFullId  ||
        senderId === pFullLid ||
        senderNumber          === pPhone ||
        senderNumber          === pId    ||
        senderIdWithoutSuffix === pPhone ||
        senderIdWithoutSuffix === pId    ||
        (pLid && senderIdWithoutSuffix === pLid)
      );

      return match && (p.admin === 'admin' || p.admin === 'superadmin');
    });

    return { isSenderAdmin, isBotAdmin };
  } catch (err) {
    console.error('isAdmin error:', err.message);
    return { isSenderAdmin: false, isBotAdmin: false };
  }
}

module.exports = isAdmin;
