/**
 * clear.js — plugins/clear.js
 * Command: .clear <number>
 * Deletes the last N messages in the current chat/group.
 * Owner only — works in both DM and groups.
 */

'use strict';

module.exports = {
  command: ['clear'],
  category: 'owner',
  desc: 'Delete last N messages in this chat',
  usage: '.clear <number 1-100>',
  owner: true,

  async execute(sock, m, ctx) {
    const { args, reply, isOwner } = ctx;

    if (!isOwner) return reply('_owner only command_');

    const count = parseInt(args[0]);
    if (!count || count < 1 || count > 100)
      return reply('_usage: .clear <number between 1 and 100>_');

    await reply(`_clearing ${count} messages_`);

    try {
      // Fetch message history
      const messages = await sock.fetchMessagesFromWA(m.chat, count + 1).catch(() => null);

      if (!messages || messages.length === 0) {
        // Fallback: use loadMessages if available
        try {
          const store = require('../library/store');
          const msgs  = store.messages[m.chat]?.array?.slice(-(count + 1)) || [];

          if (msgs.length === 0) return reply('_no messages found to delete_');

          let deleted = 0;
          for (const msg of msgs) {
            if (!msg?.key?.id) continue;
            try {
              await sock.sendMessage(m.chat, { delete: msg.key });
              deleted++;
              await new Promise(r => setTimeout(r, 150));
            } catch (_) {}
          }
          return reply(`_deleted ${deleted} messages_`);
        } catch (_) {
          return reply('_could not fetch messages - make sure the bot can see chat history_');
        }
      }

      let deleted = 0;
      for (const msg of messages.slice(0, count)) {
        if (!msg?.key?.id) continue;
        try {
          await sock.sendMessage(m.chat, { delete: msg.key });
          deleted++;
          await new Promise(r => setTimeout(r, 150)); // avoid rate limit
        } catch (_) {}
      }

      if (deleted > 0) {
        await reply(`_deleted ${deleted} messages_`);
      } else {
        await reply('_could not delete messages - bot can only delete its own messages in DMs_');
      }

    } catch (err) {
      console.error('clear error:', err.message);
      return reply('_failed to clear messages_');
    }
  }
};
