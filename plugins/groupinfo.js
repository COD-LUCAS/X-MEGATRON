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
    const { command, args, text, reply, isAdmin, isOwner, prefix } = ctx;

    // Always fetch live admin status — never trust cached ctx.isBotAdmin
    let botIsAdmin    = false;
    let senderIsAdmin = false;
    try {
      const meta   = await sock.groupMetadata(m.chat);
      const botNum = sock.user?.id?.split(':')[0] || '';
      const sndNum = (m.sender || '').split('@')[0];
      botIsAdmin    = meta.participants.some(p => p.id.split('@')[0] === botNum    && p.admin);
      senderIsAdmin = meta.participants.some(p => p.id.split('@')[0] === sndNum    && p.admin);
    } catch (_) {}

    // ── GROUPINFO (anyone in the group can run this) ──────────────
    if (command === 'groupinfo') {
      try {
        const meta   = await sock.groupMetadata(m.chat);
        const admins = meta.participants
          .filter(p => p.admin)
          .map(p => `_• @${p.id.split('@')[0]}_`)
          .join('\n');

        const created = new Date(meta.creation * 1000).toLocaleString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });

        const msg =
          `_Group Info_\n\n` +
          `_Name: ${meta.subject}_\n` +
          `_ID: ${meta.id}_\n` +
          `_Members: ${meta.participants.length}_\n` +
          `_Description: ${meta.desc || 'none'}_\n\n` +
          `_Admins:_\n${admins || '_none_'}\n\n` +
          `_Created: ${created}_`;

        return sock.sendMessage(m.chat, {
          text: msg,
          mentions: meta.participants.filter(p => p.admin).map(p => p.id)
        }, { quoted: m });

      } catch (_) {
        return reply('_Failed to fetch group info_');
      }
    }

    // ── Admin + bot-admin check for all other commands ────────────
    if (!senderIsAdmin && !isOwner) {
      return reply('_This command is for group admins only_');
    }
    if (!botIsAdmin) {
      return reply('_Please make me a group admin first_');
    }

    // ── SETGNAME ─────────────────────────────────────────────────
    if (command === 'setgname') {
      if (!text) return reply(`_Usage: ${prefix}setgname <new name>_`);
      try {
        await sock.groupUpdateSubject(m.chat, text);
        return reply(`_Group name changed to: ${text}_`);
      } catch (_) {
        return reply('_Failed to change group name_');
      }
    }

    // ── SETGDESC ─────────────────────────────────────────────────
    if (command === 'setgdesc') {
      if (!text) return reply(`_Usage: ${prefix}setgdesc <new description>_`);
      try {
        await sock.groupUpdateDescription(m.chat, text);
        return reply('_Group description updated_');
      } catch (_) {
        return reply('_Failed to update description_');
      }
    }

    // ── RESETLINK ────────────────────────────────────────────────
    if (command === 'resetlink') {
      try {
        await sock.groupRevokeInvite(m.chat);
        const newLink = await sock.groupInviteCode(m.chat);
        return reply(`_Invite link reset_\n\n_https://chat.whatsapp.com/${newLink}_`);
      } catch (_) {
        return reply('_Failed to reset invite link_');
      }
    }

    // ── MUTE ─────────────────────────────────────────────────────
    if (command === 'mute') {
      try {
        await sock.groupSettingUpdate(m.chat, 'announcement');
        return reply('_Group muted - only admins can send messages_');
      } catch (_) {
        return reply('_Failed to mute group_');
      }
    }

    // ── UNMUTE ───────────────────────────────────────────────────
    if (command === 'unmute') {
      try {
        await sock.groupSettingUpdate(m.chat, 'not_announcement');
        return reply('_Group unmuted - everyone can send messages_');
      } catch (_) {
        return reply('_Failed to unmute group_');
      }
    }
  }
};
