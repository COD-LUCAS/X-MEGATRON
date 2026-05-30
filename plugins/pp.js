/**
 * fullpp.js — plugins/fullpp.js
 * Command: .fullpp (reply to image)
 * Updates bot profile picture in full size — no square crop.
 * Requires: library/profile.js
 */

'use strict';

const { updatefullpp } = require('../library/profile');

module.exports = {
  command:  ['fullpp'],
  category: 'owner',
  desc:     'Update profile picture in full size',
  usage:    '.fullpp (reply to image)',
  owner:    true,

  async execute(sock, m, ctx) {
    const { reply, isOwner } = ctx;
    if (!isOwner) return reply('_owner only command_');

    if (!m.quoted || m.quoted.mtype !== 'imageMessage')
      return reply('_reply to an image_');

    try {
      const buffer = await m.quoted.download().catch(() => null);
      if (!buffer || buffer.length === 0) return reply('_failed to download image_');

      await updatefullpp(sock.user.id, buffer, sock);
      return reply('_profile picture updated_');
    } catch (err) {
      console.error('fullpp error:', err.message);
      return reply('_failed to update profile picture_');
    }
  }
};
