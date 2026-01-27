module.exports = {
  command: [
    "mute",
    "unmute",
    "promote",
    "demote",
    "kick",
    "add",
    "tag",
    "tagall",
    "hidetag",
    "kickall",
    "cancel"
  ],
  category: "group",
  description: "Group management commands",

  async execute(sock, m, context) {
    const {
      reply,
      command,
      isGroup,
      isAdmins,
      isOwner,
      participants,
      text,
      quoted,
      prefix,
      groupMetadata,
      getGroupMetadata
    } = context;

    // Check if group
    if (!isGroup) {
      return reply('_❌ This command is only for groups_');
    }

    // Load group metadata if needed
    if (!groupMetadata) {
      await getGroupMetadata();
    }

    // Check if user is admin (except for cancel)
    if (command !== "cancel" && !isAdmins && !isOwner) {
      return reply('_❌ This command requires admin privileges_');
    }

    const allParticipants = participants || context.participants;
    const mentions = allParticipants.map(p => p.id);

    try {
      
      // ============ MUTE GROUP ============
      if (command === "mute") {
        await sock.groupSettingUpdate(m.chat, "announcement");
        return reply('_✅ Group muted - Only admins can send messages_');
      }

      // ============ UNMUTE GROUP ============
      if (command === "unmute") {
        await sock.groupSettingUpdate(m.chat, "not_announcement");
        return reply('_✅ Group unmuted - All members can send messages_');
      }

      // ============ PROMOTE USER ============
      if (command === "promote") {
        const target =
          m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
          m.message?.extendedTextMessage?.contextInfo?.participant;

        if (!target) {
          return reply('_❌ Reply to a message or mention a user_\n\n_Example:_ `.promote @user`');
        }

        await sock.groupParticipantsUpdate(m.chat, [target], "promote");
        return reply('_✅ User promoted to admin_');
      }

      // ============ DEMOTE ADMIN ============
      if (command === "demote") {
        const target =
          m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
          m.message?.extendedTextMessage?.contextInfo?.participant;

        if (!target) {
          return reply('_❌ Reply to a message or mention a user_\n\n_Example:_ `.demote @user`');
        }

        await sock.groupParticipantsUpdate(m.chat, [target], "demote");
        return reply('_✅ User demoted to member_');
      }

      // ============ KICK USER ============
      if (command === "kick") {
        const target =
          m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
          m.message?.extendedTextMessage?.contextInfo?.participant;

        if (!target) {
          return reply('_❌ Reply to a message or mention a user_\n\n_Example:_ `.kick @user`');
        }

        await sock.groupParticipantsUpdate(m.chat, [target], "remove");
        return reply('_✅ User removed from group_');
      }

      // ============ ADD USER ============
      if (command === "add") {
        if (!text) {
          return reply('_❌ Provide a phone number_\n\n_Example:_ `.add 923073457436`');
        }

        const num = text.replace(/\D/g, "");
        
        if (!num || num.length < 10) {
          return reply('_❌ Invalid phone number_');
        }

        try {
          await sock.groupParticipantsUpdate(
            m.chat,
            [`${num}@s.whatsapp.net`],
            "add"
          );
          return reply('_✅ User added to group_');
        } catch (error) {
          return reply('_❌ Failed to add user_\n\n_User may have privacy settings enabled or number is invalid_');
        }
      }

      // ============ TAG ALL (WITH MESSAGE) ============
      if (command === "tag") {
        if (!text && !quoted) {
          return reply(`_❌ Provide a message_\n\n_Example:_\n\`${prefix}tag Hello everyone\`\n_or reply to a message with_ \`${prefix}tag\``);
        }

        const message = text || quoted?.text || '';

        await sock.sendMessage(
          m.chat,
          { text: message, mentions },
          { quoted: m }
        );
        return;
      }

      // ============ TAG ALL (LIST FORMAT) ============
      if (command === "tagall") {
        let tagMessage = '_📢 Group Mention_\n\n';
        
        allParticipants.forEach((participant, index) => {
          const num = participant.id.split('@')[0];
          tagMessage += `${index + 1}. @${num}\n`;
        });

        tagMessage += `\n_Total: ${allParticipants.length} members_`;

        await sock.sendMessage(
          m.chat,
          { text: tagMessage, mentions },
          { quoted: m }
        );
        return;
      }

      // ============ HIDE TAG ============
      if (command === "hidetag") {
        if (!text && !quoted) {
          return reply(`_❌ Provide a message_\n\n_Example:_\n\`${prefix}hidetag Important announcement\`\n_or reply to a message with_ \`${prefix}hidetag\``);
        }

        const message = text || quoted?.text || '';

        await sock.sendMessage(
          m.chat,
          { text: message, mentions },
          { quoted: m }
        );
        return;
      }

      // ============ KICK ALL ============
      if (command === "kickall") {
        if (!isOwner) {
          return reply('_❌ This command is only for bot owner_');
        }

        const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

        const targets = allParticipants
          .filter(p =>
            p.id !== botJid &&
            !p.admin
          )
          .map(p => p.id);

        if (targets.length === 0) {
          return reply('_❌ No members to remove_');
        }

        global.kickallProcess = global.kickallProcess || {};

        if (global.kickallProcess[m.chat]) {
          return reply(`_⚠️ Kickall already running_\n\n_Send_ \`${prefix}cancel\` _to stop_`);
        }

        await reply(`_⚠️ Kickall will start in 10 seconds_\n\n_Target: ${targets.length} members_\n_Send_ \`${prefix}cancel\` _to stop_`);

        let cancelled = false;

        const timer = setTimeout(async () => {
          if (cancelled) return;

          let removed = 0;
          let failed = 0;

          for (const jid of targets) {
            try {
              await sock.groupParticipantsUpdate(m.chat, [jid], "remove");
              removed++;
              await new Promise(r => setTimeout(r, 1000)); // 1 second delay
            } catch {
              failed++;
            }
          }

          delete global.kickallProcess[m.chat];
          await reply(`_✅ Kickall completed_\n\n_Removed: ${removed}_\n_Failed: ${failed}_`);
        }, 10000);

        global.kickallProcess[m.chat] = {
          cancel: () => {
            cancelled = true;
            clearTimeout(timer);
            delete global.kickallProcess[m.chat];
          }
        };

        return;
      }

      // ============ CANCEL KICKALL ============
      if (command === "cancel") {
        if (!global.kickallProcess || !global.kickallProcess[m.chat]) {
          return reply('_❌ No kickall process is running_');
        }

        global.kickallProcess[m.chat].cancel();
        return reply('_✅ Kickall cancelled_');
      }

    } catch (error) {
      console.error('Group command error:', error);
      return reply('_❌ Command failed_\n\n_Error: ' + error.message + '_');
    }
  }
};