const { exec } = require('child_process')

module.exports = {
  command: ["reload", "reboot", "restart"],
  category: "owner",
  desc: "System management commands",
  usage: ".reload | .reboot | .restart",
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, context) {
    const { reply, command, isOwner, isSudo } = context

    // 🔒 Allow only owner or sudo
    if (!isOwner && !isSudo) return

    if (command === "reload") {
      await reply("_reloading plugins..._")

      try {
        Object.keys(require.cache).forEach(f => {
          if (!f.includes("node_modules")) {
            delete require.cache[f]
          }
        })

        return reply("_reload completed_")
      } catch (e) {
        return reply(`_reload failed: ${e.message}_`)
      }
    }

    if (command === "reboot" || command === "restart") {
      await reply("_restarting bot..._")

      setTimeout(() => {
        exec('npm start', () => {})
        process.exit(0)
      }, 1000)
    }
  }
}