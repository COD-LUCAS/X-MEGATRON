const fs = require("fs")
const path = require("path")

const ENV_PATH = path.join(process.cwd(), ".env")

const readEnv = () => {
  if (!fs.existsSync(ENV_PATH)) return {}
  const data = fs.readFileSync(ENV_PATH, "utf8")
  const env = {}
  data.split(/\r?\n/).forEach(line => {
    if (!line || line.startsWith("#") || !line.includes("=")) return
    const [k, ...v] = line.split("=")
    env[k.trim()] = v.join("=").trim()
  })
  return env
}

const writeEnv = env => {
  const content = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
  fs.writeFileSync(ENV_PATH, content + "\n")
}

module.exports = {
  command: ["setvar", "delvar", "listvar", "mode"],
  owner: true,
  category: "owner",
  desc: "Manage environment variables",
  usage: ".setvar KEY=VALUE | .delvar KEY | .listvar | .mode public/private",

  async execute(sock, m, { command, text, reply, isOwner }) {
    if (!isOwner) return

    const env = readEnv()

    /* ───── SETVAR ───── */
    if (command === "setvar") {
      if (!text || !text.includes("=")) {
        return reply("_Usage:_\n_setvar KEY=VALUE_")
      }

      const [key, ...val] = text.split("=")
      const value = val.join("=")

      if (!key || !value) {
        return reply("_Invalid format_\n_use KEY=VALUE_")
      }

      env[key.trim()] = value.trim()
      writeEnv(env)

      return reply(
        `_Variable saved_\n\n_${key.trim()}=${value.trim()}_\n\n_reboot required_`
      )
    }

    /* ───── DELVAR ───── */
    if (command === "delvar") {
      if (!text) return reply("_Usage:_\n_delvar KEY_")

      if (!(text in env)) {
        return reply("_Variable not found_")
      }

      delete env[text]
      writeEnv(env)

      return reply(
        `_Variable removed_\n\n_${text}_\n\n_reboot required_`
      )
    }

    /* ───── LISTVAR ───── */
    if (command === "listvar") {
      if (text) {
        if (!(text in env)) return reply("_Variable not found_")
        return reply(`_${text}=${env[text]}_`)
      }

      const keys = Object.keys(env)
      if (!keys.length) return reply("_No variables found_")

      return reply(
        keys.map(k => `_${k}=${env[k]}_`).join("\n")
      )
    }

    /* ───── MODE ───── */
    if (command === "mode") {
      if (!text) {
        return reply(
          `_Current mode:_ ${(env.MODE || "public").toUpperCase()}`
        )
      }

      const mode = text.toLowerCase()
      if (!["public", "private"].includes(mode)) {
        return reply("_Usage:_\n_mode public_\n_mode private_")
      }

      env.MODE = mode
      writeEnv(env)

      return reply(
        `_Mode updated:_ ${mode.toUpperCase()}\n\n_reboot required_`
      )
    }
  }
}