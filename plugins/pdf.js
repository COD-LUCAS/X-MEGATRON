const { convert: imageToPdf, sizes } = require("image-to-pdf")
const fs = require("fs")
const fsp = require("fs/promises")
const path = require("path")
const fileType = require("file-type")

const BASE_DIR = "./temp/pdf"

// ensure base dir
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true })

const getFileType = async (buffer) => {
  try {
    if (fileType.fileTypeFromBuffer) return await fileType.fileTypeFromBuffer(buffer)
    if (fileType.fromBuffer) return await fileType.fromBuffer(buffer)
    return await fileType(buffer)
  } catch {
    return null
  }
}

const sanitizeName = (name) => {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_")
}

module.exports = {
  command: ["pdf"],
  category: "converter",
  desc: "Convert images to PDF",
  usage: ".pdf <reply/get/delete/help>",

  async execute(sock, m, context) {
    const { args, reply, sender } = context

    const sub = args[0]?.toLowerCase()

    const userDir = path.join(BASE_DIR, sender)
    const outputPath = path.join(userDir, "output.pdf")

    // ensure user folder
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }

    // HELP
    if (sub === "help") {
      return reply(
        `_1. Reply image with .pdf_\n` +
        `_2. Use .pdf get <name> to generate PDF_\n` +
        `_3. Use .pdf delete to clear images_\n` +
        `_4. Files auto-delete after output_`
      )
    }

    // DELETE
    if (sub === "delete") {
      try {
        const files = await fsp.readdir(userDir)
        await Promise.all(files.map(f => fsp.unlink(path.join(userDir, f))))
        return reply(`_Successfully cleared your files!_`)
      } catch {
        return reply(`_Nothing to delete_`)
      }
    }

    // GET PDF
    if (sub === "get") {
      const nameArg = args.slice(1).join(" ") || "converted"
      const fileName = sanitizeName(nameArg) + ".pdf"

      const files = (await fsp.readdir(userDir))
        .filter(f => f.startsWith("img_"))
        .map(f => path.join(userDir, f))

      if (!files.length) return reply(`_No images added_`)

      try {
        const stream = imageToPdf(files, sizes.A4)
        const write = fs.createWriteStream(outputPath)

        stream.pipe(write)

        write.on("finish", async () => {
          await sock.sendMessage(
            m.chat,
            {
              document: fs.readFileSync(outputPath),
              mimetype: "application/pdf",
              fileName
            },
            { quoted: m }
          )

          // CLEAN USER FOLDER
          const all = await fsp.readdir(userDir)
          await Promise.all(all.map(f => fsp.unlink(path.join(userDir, f))))
        })

        write.on("error", async () => {
          reply(`_PDF conversion failed_`)
        })

      } catch {
        return reply(`_Failed to generate PDF_`)
      }

      return
    }

    // ADD IMAGE
    if (m.quoted) {
      try {
        const buffer = await m.quoted.download()
        const type = await getFileType(buffer)

        if (!type || !type.mime.startsWith("image")) {
          return reply(`_Reply to an image_`)
        }

        const files = (await fsp.readdir(userDir)).filter(f => f.startsWith("img_"))
        const filePath = path.join(userDir, `img_${files.length}.jpg`)

        await fsp.writeFile(filePath, buffer)

        return reply(
          `*_Image saved_*\n` +
          `_*Total: ${files.length + 1}*_\n` +
          `_*Use .pdf get <name>*_`
        )

      } catch {
        return reply(`_Failed to save image_`)
      }
    }

    return reply(`_Reply to an image or use .pdf help_`)
  }
}