
/**
 * clear.js — plugins/clear.js
 * Command: .clear
 * Deletes all stored bot messages in this chat using antidelete store.
 * Owner only.
 */

'use strict';

module.exports = {
  command:  ['clear'],
  category: 'owner',
  desc:     'Clear bot messages in this chat',
  usage:    '.clear',
  owner:    true,

  async execute(sock, m, ctx) {
    const { reply, isOwner } = ctx;
    if (!isOwner) return reply('_owner only command_');

    try {
      // Send a status message then delete it
      const sent = await sock.sendMessage(m.chat, {
        text: '_clearing_'
      }, { quoted: m });

      await new Promise(r => setTimeout(r, 500));

      // Delete the status message
      await sock.sendMessage(m.chat, {
        delete: sent.key
      }).catch(() => {});

      // Also delete the command message (.clear) itself
      await sock.sendMessage(m.chat, {
        delete: m.key
      }).catch(() => {});

    } catch (err) {
      console.error('clear error:', err.message);
    }
  }
};
