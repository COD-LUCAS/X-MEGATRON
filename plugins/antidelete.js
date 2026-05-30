/**
 * antidelete.js — plugins/antidelete.js
 * Command: .antidelete on/off/target
 * Owner only.
 *
 * .antidelete on
 * .antidelete off
 * .antidelete target group        → report in same group
 * .antidelete target owner        → report to owner DM
 * .antidelete target 918xxxxxxxxx → report to specific number
 */

'use strict';

const { loadConfig, saveConfig } = require('../library/antidelete');

module.exports = {
  command:  ['antidelete'],
  category: 'owner',
  desc:     'Toggle antidelete and configure where to send deleted messages',
  owner:    true,

  async execute(sock, m, ctx) {
    const { args, reply, isOwner } = ctx;
    if (!isOwner) return reply('_owner only command_');

    const cfg = loadConfig();
    const sub = args[0]?.toLowerCase();

    if (!sub) return reply(
      `_antidelete: ${cfg.enabled ? 'on' : 'off'}_\n` +
      `_target: ${cfg.target || 'group'}_\n\n` +
      `_.antidelete on_\n` +
      `_.antidelete off_\n` +
      `_.antidelete target group_\n` +
      `_.antidelete target owner_\n` +
      `_.antidelete target <number>_`
    );

    if (sub === 'on')  { cfg.enabled = true;  saveConfig(cfg); return reply('_antidelete on_'); }
    if (sub === 'off') { cfg.enabled = false; saveConfig(cfg); return reply('_antidelete off_'); }

    if (sub === 'target') {
      const val = args[1]?.toLowerCase()?.trim();
      if (!val) return reply('_usage: .antidelete target group | owner | <number>_');

      if (val === 'group' || val === 'owner') {
        cfg.target = val;
      } else {
        // treat as phone number
        const num = val.replace(/\D/g, '');
        if (num.length < 7) return reply('_invalid number_');
        cfg.target = num + '@s.whatsapp.net';
      }

      saveConfig(cfg);
      return reply(`_antidelete target set to: ${cfg.target}_`);
    }

    return reply('_options: on | off | target group|owner|<number>_');
  }
};
