
'use strict';

module.exports = {
  command: ['kick'],
  category: 'group',
  desc: 'Kick a member from the group',
  usage: '.kick (reply to user) | .kick @user',
  group: true,

  async execute(sock, m, context) {
    const { reply, isOwner, participants } = context;

    // Collect targets
    let targets = [];

    // From reply
    if (m.quoted?.sender) {
      targets.push(m.quoted.sender);
    }

    // From mentions
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      targets.push(...m.message.extendedTextMessage.contextInfo.mentionedJid);
    }

    // Deduplicate
    targets = [...new Set(targets)];

    if (!targets.length) {
      return reply(
        `_Reply to a message or mention a user_\n` +
        `_Example: ${context.prefix}kick @user_`
      );
    }

    // Filter out bot self
    const botNum = sock.user?.id?.split(':')[0];
    const filtered = [];

    for (const jid of targets) {
      const num = jid.split('@')[0];
      if (num === botNum) {
        reply('_I cannot kick myself_');
        continue;
      }

      // Check if target is admin (only owner can kick admins)
      const isTargetAdmin = participants.some(p =>
        p.id.split('@')[0] === num &&
        (p.admin === 'admin' || p.admin === 'superadmin')
      );

      if (isTargetAdmin && !isOwner) {
        reply(`_Cannot kick admin @${num}_`);
        continue;
      }

      filtered.push(jid);
    }

    if (!filtered.length) return;

    try {
      await sock.groupParticipantsUpdate(m.chat, filtered, 'remove');
      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

      const names = filtered.map(j => `@${j.split('@')[0]}`).join(', ');
      await sock.sendMessage(m.chat, {
        text: `_Kicked: ${names}_`,
        mentions: filtered,
      });
    } catch (e) {
      if (e.message.includes('403') || e.message.includes('not admin')) {
        return reply('_Bot is not admin_');
      }
      return reply(`_Failed: ${e.message}_`);
    }
  },
};