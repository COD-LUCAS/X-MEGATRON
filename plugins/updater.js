const axios = require("axios")
const fs = require("fs")
const path = require("path")
const unzipper = require("unzipper")

const VERSION_URL = "https://raw.githubusercontent.com/COD-LUCAS/X-MEGATRON/main/version.json"
const ZIP_URL = "https://github.com/COD-LUCAS/X-MEGATRON/archive/refs/heads/main.zip"

const ROOT = process.cwd()
const LOCAL_VERSION_FILE = path.join(ROOT, "version.json")
const TEMP_ZIP = path.join(ROOT, "update.zip")
const TEMP_DIR = path.join(ROOT, "__update__")

const PROTECTED = [
  ".env",
  "node_modules",
  "session",
  "sticker_bonds.json",
  "disabled_commands.json",
  "__update__",
  "update.zip"
]

const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"))

const safeCopy = (src, dest) => {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })

  for (const item of fs.readdirSync(src)) {
    if (PROTECTED.includes(item)) continue

    const s = path.join(src, item)
    const d = path.join(dest, item)

    if (fs.statSync(s).isDirectory()) {
      safeCopy(s, d)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}

const safeRemoveOld = (current, fresh) => {
  for (const item of fs.readdirSync(current)) {
    if (PROTECTED.includes(item)) continue

    const currentPath = path.join(current, item)
    const freshPath = path.join(fresh, item)

    if (!fs.existsSync(freshPath)) {
      fs.rmSync(currentPath, { recursive: true, force: true })
    }
  }
}

module.exports = {
  command: ["update"],
  owner: true,

  async execute(sock, m, { reply, isOwner }) {

    if (!isOwner) return

    if (!fs.existsSync(LOCAL_VERSION_FILE))
      return reply("_Local version.json not found_")

    reply("_Checking for updates..._")

    try {
      const remoteData = (await axios.get(VERSION_URL, { cache: false })).data
      const localData = readJSON(LOCAL_VERSION_FILE)

      if (!remoteData.version)
        return reply("_Remote version invalid_")

      if (remoteData.version === localData.version)
        return reply("_Bot is already up to date_")

      reply(`_Updating from ${localData.version} → ${remoteData.version}_`)

      const response = await axios.get(ZIP_URL, { responseType: "stream" })
      await new Promise(resolve =>
        response.data.pipe(fs.createWriteStream(TEMP_ZIP)).on("finish", resolve)
      )

      await fs.createReadStream(TEMP_ZIP)
        .pipe(unzipper.Extract({ path: TEMP_DIR }))
        .promise()

      const folderName = fs.readdirSync(TEMP_DIR)[0]
      const freshRoot = path.join(TEMP_DIR, folderName)

      safeRemoveOld(ROOT, freshRoot)
      safeCopy(freshRoot, ROOT)

      fs.writeFileSync(LOCAL_VERSION_FILE, JSON.stringify(remoteData, null, 2))

      fs.rmSync(TEMP_ZIP, { force: true })
      fs.rmSync(TEMP_DIR, { recursive: true, force: true })

      reply("_Update completed. Restarting..._")
      process.exit(0)

    } catch (e) {
      console.log("UPDATE ERROR:", e)
      reply("_Update failed_")
    }
  }
}