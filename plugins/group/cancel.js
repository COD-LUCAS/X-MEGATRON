module.exports = {
  command: ["cancel"],
  category: "group",
  desc: "Cancel ongoing kickall process",
  usage: ".reboot",
  group: true,
  admin: true,
  owner: false,

  async execute(sock, m, context) {
    const { reply } = context;

    if (global.kickallProcess && global.kickallProcess[m.chat]) {
      global.kickallProcess[m.chat].cancel();
      clearInterval(global.kickallProcess[m.chat].interval);
      delete global.kickallProcess[m.chat];
      
      await sock.sendMessage(m.chat, { react: { text: '🛑', key: m.key } });
      return reply("Kickall process cancelled");
    } else {
      await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return reply("No active kickall process");
    }
  }
};
