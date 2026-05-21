const config = require("../config");

module.exports = {
  command: ["del"],
  category: "owner",
  desc: "Delete replied message",
  usage: ".del (reply to message)",

  async execute(sock, m) {
    try {
      const chatId = m.chat;

      const sudoUsers = (config.SUDO || "")
        .split(",")
        .map(v => v.trim());

      const sender =
        m.sender ||
        m.key.participant ||
        m.key.remoteJid;

      const isOwner = m.key.fromMe;

      const isSudo = sudoUsers.includes(
        sender.replace(/[^0-9]/g, "")
      );

      if (!isOwner && !isSudo) {
        return await sock.sendMessage(chatId, {
          text: "❌ Owner or sudo only"
        }, { quoted: m });
      }

      if (!m.quoted) {
        return await sock.sendMessage(chatId, {
          text: "⚠️ Reply to a message"
        }, { quoted: m });
      }

      // ONLY CHECK ADMIN IF DELETING OTHERS MESSAGE
      if (m.isGroup && !m.quoted.fromMe) {
        const metadata = await sock.groupMetadata(chatId);

        const botId =
          sock.user.id.split(":")[0] + "@s.whatsapp.net";

        const botData = metadata.participants.find(
          p => p.id === botId
        );

        if (!botData?.admin) {
          return await sock.sendMessage(chatId, {
            text: "❌ Bot must be admin to delete others messages"
          }, { quoted: m });
        }
      }

      const key = {
        remoteJid: chatId,
        fromMe: m.quoted.fromMe,
        id: m.quoted.id
      };

      if (m.isGroup) {
        key.participant =
          m.quoted.sender ||
          m.quoted.participant;
      }

      await sock.sendMessage(chatId, {
        delete: key
      });

    } catch (e) {
      console.log("Delete Error:", e);

      await sock.sendMessage(m.chat, {
        text: "❌ Failed to delete message"
      }, { quoted: m });
    }
  }
};