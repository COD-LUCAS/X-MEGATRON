/**
 * antidelete.js — plugins/antidelete.js
 * Command: .antidelete on/off/status
 * Owner only.
 */

'use strict';

const { loadConfig, saveConfig } = require('../library/antidelete');

module.exports = {
  command:  ['antidelete'],
  category: 'owner',
  desc:     'Toggle antidelete and anti-view-once',
  usage:    '.antidelete on | off | status',
  owner:    true,

  async execute(sock, m, ctx) {
    const { args, reply, isOwner } = ctx;
    if (!isOwner) return reply('_owner only command_');

    const cfg = loadConfig();
    const sub = args[0]?.toLowerCase();

    if (!sub) return reply(
      `_antidelete: ${cfg.enabled ? 'on' : 'off'}_\n\n` +
      `_.antidelete on_\n` +
      `_.antidelete off_`
    );

    if (sub === 'on') {
      if (cfg.enabled) return reply('_antidelete already on_');
      cfg.enabled = true;
      saveConfig(cfg);
      return reply('_antidelete on - storing all messages_');
    }

    if (sub === 'off') {
      cfg.enabled = false;
      saveConfig(cfg);
      return reply('_antidelete off_');
    }

    return reply('_options: on | off_');
  }
};
