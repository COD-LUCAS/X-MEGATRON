module.exports = {
  command: [
    "mute",
    "unmute",
    "promote",
    "demote",
    "kick",
    "add",
    "tagall",
    "hidetag",
    "kickall"
  ],
  category: "group",
  desc: "Group management commands",
  usage: ".mute | .promote @user | .kick @user | .tagall | .kickall",
  group: true,
  admin: true,
  owner: false,

  async execute(sock, m, context) {
    const {
      reply,
      command,
      isGroup,
      isAdmins,
      isOwner,
      participants,
      text,
      args,
      groupMetadata,
      quoted,
      prefix
    } = context;

    if (!isGroup) {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return reply("This command works only in groups");
    }

    if (!isAdmins && !isOwner) {
      await sock.sendMessage(m.chat, { react: { text: '⚠️', key: m.key } });
      return reply("You must be admin");
    }

    try {
      if (command === "mute") {
        await sock.groupSettingUpdate(m.chat, "announcement");
        await sock.sendMessage(m.chat, { react: { text: '🔇', key: m.key } });
        return reply("Group muted");
      }

      if (command === "unmute") {
        await sock.groupSettingUpdate(m.chat, "not_announcement");
        await sock.sendMessage(m.chat, { react: { text: '🔊', key: m.key } });
        return reply("Group unmuted");
      }

      if (command === "promote") {
        let targetJid = null;

        if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
          targetJid = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (m.message?.extendedTextMessage?.contextInfo?.participant) {
          targetJid = m.message.extendedTextMessage.contextInfo.participant;
        }

        if (!targetJid) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply("Reply or mention user to promote");
        }

        await sock.groupParticipantsUpdate(m.chat, [targetJid], "promote");
        await sock.sendMessage(m.chat, { react: { text: '⬆️', key: m.key } });
        return reply("Promoted to admin");
      }

      if (command === "demote") {
        let targetJid = null;

        if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
          targetJid = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (m.message?.extendedTextMessage?.contextInfo?.participant) {
          targetJid = m.message.extendedTextMessage.contextInfo.participant;
        }

        if (!targetJid) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply("Reply or mention user to demote");
        }

        await sock.groupParticipantsUpdate(m.chat, [targetJid], "demote");
        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });
        return reply("Demoted from admin");
      }

      if (command === "kick") {
        let targetJid = null;

        if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
          targetJid = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (m.message?.extendedTextMessage?.contextInfo?.participant) {
          targetJid = m.message.extendedTextMessage.contextInfo.participant;
        }

        if (!targetJid) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply("Reply or mention user to kick");
        }

        await sock.groupParticipantsUpdate(m.chat, [targetJid], "remove");
        await sock.sendMessage(m.chat, { react: { text: '👢', key: m.key } });
        return reply("Removed from group");
      }

      if (command === "add") {
        const number = args.join('').replace(/[^0-9]/g, '');
        
        if (!number) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply("Provide a phone number");
        }

        const targetJid = number + '@s.whatsapp.net';
        
        await sock.groupParticipantsUpdate(m.chat, [targetJid], "add");
        await sock.sendMessage(m.chat, { react: { text: '➕', key: m.key } });
        return reply("User added to group");
      }

      if (command === "tagall") {
        if (!text && !quoted) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply(`Usage:\n${prefix}tagall message\nor reply to a message with ${prefix}tagall`);
        }

        const mentions = participants.map(p => p.id);
        const groupName = groupMetadata.subject || "Group";
        const tagMessage = text || quoted?.text || "Attention!";
        
        let message = `╭━━〘 *X MEGATRON* 〙━━┈⊷\n`;
        message += `┃✾ *Group:* ${groupName}\n`;
        message += `┃✾ *Members:* ${mentions.length}\n`;
        message += `┃✾ *Message:* ${tagMessage}\n`;
        message += `╰━━━━━━━━━━━━━┈⊷\n\n`;
        
        for (let i = 0; i < mentions.length; i++) {
          message += `┃ ${i + 1}. @${mentions[i].split('@')[0]}\n`;
        }
        
        message += `\n╰━━━━━━━━━━━━━┈⊷`;
        
        await sock.sendMessage(m.chat, { text: message, mentions }, { quoted: m });
        await sock.sendMessage(m.chat, { react: { text: '📢', key: m.key } });
        return;
      }

      if (command === "hidetag") {
        if (!text && !quoted) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply(`Usage:\n${prefix}hidetag message\nor reply to a message with ${prefix}hidetag`);
        }

        const mentions = participants.map(p => p.id);
        const hidetagMessage = text || quoted?.text || "Tagged everyone!";
        
        await sock.sendMessage(m.chat, { 
          text: hidetagMessage, 
          mentions 
        }, { quoted: m });
        await sock.sendMessage(m.chat, { react: { text: '👁️', key: m.key } });
        return;
      }

      if (command === "kickall") {
        if (!isOwner && !isAdmins) {
          await sock.sendMessage(m.chat, { react: { text: '⚠️', key: m.key } });
          return reply("You must be admin or owner");
        }

        const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        const toKick = participants.filter(p => {
          const isBot = p.id === botJid;
          const isAdmin = p.admin === 'admin' || p.admin === 'superadmin';
          return !isBot && !isAdmin;
        }).map(p => p.id);

        if (toKick.length === 0) {
          await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          return reply("No members to remove (only admins remaining)");
        }

        await reply(`⚠️ *KICKALL INITIATED*\n\nRemoving ${toKick.length} members in 10 seconds...\n\nTo cancel:\n• Send: ${prefix}cancel\n• Remove bot admin\n• Remove command sender admin`);
        
        let cancelled = false;
        const startTime = Date.now();
        
        const checkInterval = setInterval(async () => {
          if (Date.now() - startTime >= 10000) {
            clearInterval(checkInterval);
            
            if (cancelled) {
              await sock.sendMessage(m.chat, { react: { text: '🛑', key: m.key } });
              return reply("Kickall cancelled");
            }
            
            await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
            await reply(`Removing ${toKick.length} members...`);
            
            let removed = 0;
            for (let i = 0; i < toKick.length; i++) {
              try {
                await sock.groupParticipantsUpdate(m.chat, [toKick[i]], "remove");
                removed++;
                await new Promise(resolve => setTimeout(resolve, 1000));
              } catch (e) {
                console.log(`Failed to kick ${toKick[i]}:`, e.message);
              }
            }
            
            await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            delete global.kickallProcess[m.chat];
            return reply(`Removed ${removed} members from group`);
          }
        }, 1000);
        
        global.kickallProcess = global.kickallProcess || {};
        global.kickallProcess[m.chat] = {
          interval: checkInterval,
          cancel: () => { cancelled = true; }
        };
        
        return;
      }

    } catch (err) {
      console.log("Group command error:", err);
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      
      if (err.message?.includes('not-authorized') || err.message?.includes('forbidden')) {
        return reply("Bot must be admin");
      }
      
      return reply("Command failed");
    }
  }
};
