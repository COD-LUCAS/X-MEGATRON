/**
 * groupinfo.js
 * Commands: .groupinfo, .setgname, .setgdesc, .resetlink, .mute, .unmute
 */

'use strict';

module.exports = {
  command: ['groupinfo', 'setgname', 'setgdesc', 'resetlink', 'mute', 'unmute'],
  category: 'group',
  group: true,
  desc: 'Group management commands',

  async execute(sock, m, ctx) {
    const { command, args, text, reply, isAdmin, isOwner, isBotAdmin, prefix } = ctx;

    // ── GROUPINFO ──────────────────────────────────────────────────
    if (command === 'groupinfo') {
      try {
        const meta = await sock.groupMetadata(m.chat);
        const admins = meta.participants.filter(p => p.admin).map(p => `• @${p.id.split('@')[0]}`).join('\n');
        const msg =
          `*『 GROUP INFO 』*\n\n` +
          `📌 *Name:* ${meta.subject}\n` +
          `🆔 *ID:* ${meta.id}\n` +
          `👥 *Members:* ${meta.participants.length}\n` +
          `📝 *Description:*\n${meta.desc || '_(none)_'}\n\n` +
          `👑 *Admins:*\n${admins || '_(none)_'}\n\n` +
          `📅 *Created:* ${new Date(meta.creation * 1000).toLocaleString()}`;
        return sock.sendMessage(m.chat, {
          text: msg,
          mentions: meta.participants.filter(p => p.admin).map(p => p.id)
        }, { quoted: m });
      } catch (e) {
        return reply('_Failed to fetch group info_');
      }
    }

    // Admin check for remaining commands
    if (!isAdmin && !isOwner) return reply('_Group admins only_');
    if (!isBotAdmin) return reply('_Please make me an admin first_');

    // ── SETGNAME ──────────────────────────────────────────────────
    if (command === 'setgname') {
      if (!text) return reply(`_Usage: ${prefix}setgname <new name>_`);
      try {
        await sock.groupUpdateSubject(m.chat, text);
        return reply(`_✅ Group name changed to: ${text}_`);
      } catch (_) {
        return reply('_Failed to change group name_');
      }
    }

    // ── SETGDESC ──────────────────────────────────────────────────
    if (command === 'setgdesc') {
      if (!text) return reply(`_Usage: ${prefix}setgdesc <new description>_`);
      try {
        await sock.groupUpdateDescription(m.chat, text);
        return reply('_✅ Group description updated_');
      } catch (_) {
        return reply('_Failed to update description_');
      }
    }

    // ── RESETLINK ────────────────────────────────────────────────
    if (command === 'resetlink') {
      try {
        await sock.groupRevokeInvite(m.chat);
        const newLink = await sock.groupInviteCode(m.chat);
        return reply(`_✅ Invite link reset_\n\nhttps://chat.whatsapp.com/${newLink}`);
      } catch (_) {
        return reply('_Failed to reset invite link_');
      }
    }

    // ── MUTE / UNMUTE ────────────────────────────────────────────
    if (command === 'mute') {
      try {
        await sock.groupSettingUpdate(m.chat, 'announcement');
        return reply('_🔇 Group muted — only admins can send messages_');
      } catch (_) {
        return reply('_Failed to mute group_');
      }
    }

    if (command === 'unmute') {
      try {
        await sock.groupSettingUpdate(m.chat, 'not_announcement');
        return reply('_🔊 Group unmuted — everyone can send messages_');
      } catch (_) {
        return reply('_Failed to unmute group_');
      }
    }
  }
};
