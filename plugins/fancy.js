/**
 * plugins/fancy.js — X-MEGATRON fancy text plugin
 * Command: .fancy <style> <text>
 * Owner/anyone can use (private + group)
 */

'use strict';

const { FANCY_FONTS, applyFancy, generateUsageExamples } = require('../library/fancy');

module.exports = {
  command:  ['fancy'],
  category: 'tools',
  desc:     'Convert text to fancy styles',
  usage:    '.fancy <0-34> <text>  |  .fancy list',

  async execute(sock, m, ctx) {
    const { args, reply, prefix } = ctx;

    // ── No args or "list" → show all style previews ──────────────────
    if (!args.length || args[0].toLowerCase() === 'list') {
      return reply(generateUsageExamples('Hello World'));
    }

    const styleNum = parseInt(args[0]);

    // ── Invalid style number ──────────────────────────────────────────
    if (isNaN(styleNum) || !(styleNum in FANCY_FONTS)) {
      return reply(
        `_invalid style number_\n` +
        `_use_ *${prefix}fancy list* _to see all 35 styles (0–34)_`
      );
    }

    // ── Get text: from args or from quoted message ────────────────────
    let text = args.slice(1).join(' ').trim();

    if (!text) {
      // Try quoted/replied message
      const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quoted) {
        text = (
          quoted.conversation ||
          quoted.extendedTextMessage?.text ||
          quoted.imageMessage?.caption ||
          quoted.videoMessage?.caption ||
          ''
        ).trim();
      }
    }

    if (!text) {
      return reply(
        `_provide text to convert_\n` +
        `_example:_ *${prefix}fancy ${styleNum} Hello World*\n` +
        `_or reply to a message with_ *${prefix}fancy ${styleNum}*`
      );
    }

    const result = applyFancy(FANCY_FONTS[styleNum], text);

    if (!result || result === text) {
      return reply(`_style ${styleNum} has no mappings for the given text_`);
    }

    return reply(result);
  }
};
