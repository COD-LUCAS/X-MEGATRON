const axios = require("axios")
const fs = require("fs")
const path = require("path")
const unzipper = require("unzipper")

const VERSION_URL = "https://raw.githubusercontent.com/COD-LUCAS/X-MEGATRON/main/version.json"
const ZIP_URL = "https://github.com/COD-LUCAS/X-MEGATRON/archive/refs/heads/main.zip"

const LOCAL_VERSION = path.join(process.cwd(), "version.json")
const TEMP = path.join(process.cwd(), "update.zip")
const TEMP_DIR = path.join(process.cwd(), "update_tmp")

const readJSON = (p) => JSON.parse(fs.readFileSync(p))

const copyRecursive = (src, dest) => {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })

  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item)
    const d = path.join(dest, item)

    if (fs.statSync(s).isDirectory()) copyRecursive(s, d)
    else fs.copyFileSync(s, d)
  }
}

const removeOld = (current, fresh) => {
  for (const item of fs.readdirSync(current)) {
    if (["node_modules", ".env"].includes(item)) continue

    const c = path.join(current, item)
    const f = path.join(fresh, item)

    if (!fs.existsSync(f)) fs.rmSync(c, { recursive: true, force: true })
  }
}

module.exports = {
  command: ["update"],
  owner: true,

  async execute(sock, m, { reply, isOwner }) {

    if (!isOwner) return

    if (!fs.existsSync(LOCAL_VERSION))
      return reply("_version.json not found_")

    reply("_Checking updates..._")

    try {
      const remote = (await axios.get(VERSION_URL)).data
      const local = readJSON(LOCAL_VERSION)

      if (remote.version === local.version)
        return reply("_Bot is already up to date_")

      reply(`_Updating from ${local.version} → ${remote.version}_`)

      const zip = await axios.get(ZIP_URL, { responseType: "stream" })
      await new Promise(res => zip.data.pipe(fs.createWriteStream(TEMP)).on("finish", res))

      await fs.createReadStream(TEMP).pipe(unzipper.Extract({ path: TEMP_DIR })).promise()

      const folder = fs.readdirSync(TEMP_DIR)[0]
      const fresh = path.join(TEMP_DIR, folder)

      removeOld(process.cwd(), fresh)
      copyRecursive(fresh, process.cwd())

      fs.writeFileSync(LOCAL_VERSION, JSON.stringify(remote, null, 2))

      fs.rmSync(TEMP, { force: true })
      fs.rmSync(TEMP_DIR, { recursive: true, force: true })

      reply("_Update complete. Restarting..._")
      process.exit(0)

    } catch (e) {
      console.log("UPDATE ERROR:", e)
      reply("_Update failed_")
    }
  }
}