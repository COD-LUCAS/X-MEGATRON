/**
 * plugins/antispam.js
 * Commands: .antilink .antispam .antibadword .antidelete .antifake
 *
 * Uses handleText hook so loader calls it on EVERY message.
 * All protection logic lives in library/antifunction.js
 */

'use strict';

const isAdminHelper = require('../library/isAdmin');
const AF = require('../library/antifunction');

module.exports = {
  command: ['antilink', 'antispam', 'antibadword', 'antidelete', 'antifake'],
  category: 'group',
  desc: 'Group protection commands',

  // ── handleText fires on every message — runs protection ────────────
  async handleText(sock, m, ctx) {
    if (!m.isGroup || m.fromMe || !m.sender) return;
    AF.runGroupProtection(sock, m).catch(() => {});
  },

  async execute(sock, m, ctx) {
    const { command, args, reply, isOwner, prefix } = ctx;
    const sub = args[0]?.toLowerCase();

    // ── .antilink ──────────────────────────────────────────────────
    if (command === 'antilink') {
      if (!m.isGroup) return reply('_group only command_');
      const { isSenderAdmin } = await isAdminHelper(sock, m.chat, m.sender);
      if (!isSenderAdmin && !isOwner) return reply('_group admins only_');

      const cfg = AF.getAntilink(m.chat);

      if (!sub) return reply(
        '_antilink: ' + (cfg?.enabled ? 'on' : 'off') + '_\n' +
        '_action: ' + (cfg?.action || 'not set') + '_\n' +
        '_allowed domains: ' + ((cfg?.domains || []).join(', ') || 'none - all links blocked') + '_\n\n' +
        '_' + prefix + 'antilink on_\n' +
        '_' + prefix + 'antilink off_\n' +
        '_' + prefix + 'antilink set delete|warn|kick_\n' +
        '_' + prefix + 'antilink allow domain.com  ← allow specific domain_\n' +
        '_' + prefix + 'antilink domains  ← list allowed domains_\n' +
        '_' + prefix + 'antilink remove domain.com_'
      );

      if (sub === 'on')  { AF.setAntilink(m.chat, true, cfg?.action || 'delete', cfg?.domains || []); return reply('_antilink on_'); }
      if (sub === 'off') { AF.removeAntilink(m.chat); return reply('_antilink off_'); }

      if (sub === 'set') {
        const val = args[1]?.toLowerCase();
        if (!val) return reply('_usage: .antilink set delete|warn|kick_');
        if (!['delete','warn','kick'].includes(val)) return reply('_options: delete | warn | kick_');
        AF.setAntilink(m.chat, true, val, cfg?.domains || []);
        return reply('_antilink on - action: ' + val + '_');
      }

      if (sub === 'allow') {
        const val = args[1]?.toLowerCase();
        if (!val) return reply('_usage: .antilink allow domain.com_');
        const domains = cfg?.domains || [];
        if (!domains.includes(val)) domains.push(val);
        AF.setAntilink(m.chat, cfg?.enabled ?? true, cfg?.action || 'delete', domains);
        return reply('_allowed domain added: ' + val + '_\n_links from ' + val + ' will not be blocked_');
      }

      if (sub === 'domains') {
        const domains = cfg?.domains || [];
        return reply(domains.length
          ? '_allowed domains (these links will pass)_\n' + domains.map((d, i) => '_' + (i+1) + '. ' + d + '_').join('\n')
          : '_no allowed domains - all links are blocked_'
        );
      }

      if (sub === 'remove') {
        const val = args[1]?.toLowerCase();
        const domains = cfg?.domains || [];
        const idx = domains.indexOf(val);
        if (idx === -1) return reply('_domain not found: ' + val + '_');
        domains.splice(idx, 1);
        AF.setAntilink(m.chat, cfg?.enabled ?? true, cfg?.action || 'delete', domains);
        return reply('_removed allowed domain: ' + val + '_');
      }

      return reply('_options: on | off | set delete|warn|kick | allow <domain> | domains | remove <domain>_');
    }

    // ── .antispam ──────────────────────────────────────────────────
    if (command === 'antispam') {
      if (!m.isGroup) return reply('_group only command_');
      const { isSenderAdmin } = await isAdminHelper(sock, m.chat, m.sender);
      if (!isSenderAdmin && !isOwner) return reply('_group admins only_');

      const cfg = AF.getAntispam(m.chat);

      if (!sub) return reply(
        '_antispam: ' + (cfg?.enabled ? 'on' : 'off') + '_\n' +
        '_limit: ' + (cfg?.limit || 5) + ' messages per 5s_\n\n' +
        '_' + prefix + 'antispam on_\n' +
        '_' + prefix + 'antispam off_\n' +
        '_' + prefix + 'antispam set <2-20>_'
      );

      if (sub === 'on')  { AF.setAntispam(m.chat, true, cfg?.limit || 5); return reply('_antispam on_'); }
      if (sub === 'off') { AF.removeAntispam(m.chat); return reply('_antispam off_'); }
      if (sub === 'set') {
        const num = parseInt(args[1]);
        if (!num || num < 2 || num > 20) return reply('_set a number between 2 and 20_');
        AF.setAntispam(m.chat, true, num);
        return reply('_antispam on - limit: ' + num + ' messages per 5 seconds_');
      }
      return reply('_options: on | off | set <number>_');
    }

    // ── .antibadword ───────────────────────────────────────────────
    if (command === 'antibadword') {
      if (!m.isGroup) return reply('_group only command_');
      const { isSenderAdmin } = await isAdminHelper(sock, m.chat, m.sender);
      if (!isSenderAdmin && !isOwner) return reply('_group admins only_');

      const cfg   = AF.getAntibadword(m.chat);
      const words = AF.getBadwords(m.chat);

      if (!sub) return reply(
        '_antibadword: ' + (cfg?.enabled ? 'on' : 'off') + '_\n' +
        '_action: ' + (cfg?.action || 'not set') + '_\n' +
        '_custom words: ' + words.length + '_\n\n' +
        '_' + prefix + 'antibadword on_\n' +
        '_' + prefix + 'antibadword off_\n' +
        '_' + prefix + 'antibadword set delete|warn|kick_\n' +
        '_' + prefix + 'antibadword add <word>_\n' +
        '_' + prefix + 'antibadword remove <word>_\n' +
        '_' + prefix + 'antibadword list_'
      );

      if (sub === 'on')  { AF.setAntibadword(m.chat, true, cfg?.action || 'delete'); return reply('_antibadword on_'); }
      if (sub === 'off') { AF.removeAntibadword(m.chat); return reply('_antibadword off_'); }
      if (sub === 'set') {
        const action = args[1]?.toLowerCase();
        if (!['delete','warn','kick'].includes(action)) return reply('_options: delete | warn | kick_');
        AF.setAntibadword(m.chat, true, action);
        return reply('_antibadword on - action: ' + action + '_');
      }
      if (sub === 'add') {
        const word = args.slice(1).join(' ').trim().toLowerCase();
        if (!word) return reply('_usage: ' + prefix + 'antibadword add <word>_');
        return reply(AF.addBadword(m.chat, word) ? '_added: ' + word + '_' : '_already in list: ' + word + '_');
      }
      if (sub === 'remove') {
        const word = args.slice(1).join(' ').trim().toLowerCase();
        if (!word) return reply('_usage: ' + prefix + 'antibadword remove <word>_');
        return reply(AF.removeBadword(m.chat, word) ? '_removed: ' + word + '_' : '_not found: ' + word + '_');
      }
      if (sub === 'list') {
        const list = AF.getBadwords(m.chat);
        return reply(list.length
          ? '_custom banned words_\n' + list.map((w, i) => '_' + (i+1) + '. ' + w + '_').join('\n')
          : '_no custom words - built-in list active_'
        );
      }
      return reply('_options: on | off | set | add | remove | list_');
    }

    // ── .antidelete ────────────────────────────────────────────────
    if (command === 'antidelete') {
      if (!isOwner) return reply('_owner only command_');
      const cfg = AF.loadAdConfig();
      if (!sub) return reply(
        '_antidelete: ' + (cfg.enabled ? 'on' : 'off') + '_\n' +
        '_target: ' + (cfg.target || 'group') + '_\n\n' +
        '_' + prefix + 'antidelete on_\n' +
        '_' + prefix + 'antidelete off_\n' +
        '_' + prefix + 'antidelete target group_\n' +
        '_' + prefix + 'antidelete target owner_\n' +
        '_' + prefix + 'antidelete target <number>_'
      );
      if (sub === 'on')  { cfg.enabled = true;  AF.saveAdConfig(cfg); return reply('_antidelete on_'); }
      if (sub === 'off') { cfg.enabled = false;  AF.saveAdConfig(cfg); return reply('_antidelete off_'); }
      if (sub === 'target') {
        const val = args[1]?.toLowerCase()?.trim();
        if (!val) return reply('_usage: .antidelete target group | owner | <number>_');
        if (val === 'group' || val === 'owner') { cfg.target = val; }
        else { const num = val.replace(/\D/g,''); if (num.length < 7) return reply('_invalid number_'); cfg.target = num + '@s.whatsapp.net'; }
        AF.saveAdConfig(cfg);
        return reply('_antidelete target: ' + cfg.target + '_');
      }
      return reply('_options: on | off | target group|owner|<number>_');
    }

    // ── .antifake ──────────────────────────────────────────────────
    if (command === 'antifake') {
      if (!m.isGroup) return reply('_group only command_');
      const { isSenderAdmin } = await isAdminHelper(sock, m.chat, m.sender);
      if (!isSenderAdmin && !isOwner) return reply('_group admins only_');

      const cfg = AF.getAntifake(m.chat);

      if (!sub) return reply(
        '_antifake: ' + (cfg?.enabled ? 'on' : 'off') + '_\n\n' +
        '_Removes members with fake/virtual numbers_\n\n' +
        '_' + prefix + 'antifake on_\n' +
        '_' + prefix + 'antifake off_'
      );

      if (sub === 'on')  { AF.setAntifake(m.chat);    return reply('_antifake on - fake numbers will be removed_'); }
      if (sub === 'off') { AF.removeAntifake(m.chat); return reply('_antifake off_'); }
      return reply('_options: on | off_');
    }
  }
};
