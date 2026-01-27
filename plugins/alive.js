const fs = require('fs')
const path = require('path')

const ENV_PATH = path.join(process.cwd(), '.env')

function readAlive() {
  if (!process.env.ALIVE) {
    return {
      text: '𝚾 𝚳𝚵𝐆𝚫𝚻𝚪𝚯𝚴 𝚰𝐒 𝚫𝐋𝚰𝛁𝚵 _(use setalive to change alive message)_',
      img: 'https://i.ibb.co/LXdBnX1F/temp.jpg'
    }
  }

  const raw = process.env.ALIVE.trim()
  if (!raw.includes(';')) {
    return { text: raw, img: null }
  }

  const [text, img] = raw.split(';').map(v => v.trim())
  return { text, img: img || null }
}

function updateEnv(key, value) {
  let data = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, 'utf8')
    : ''

  const lines = data.split('\n').filter(Boolean)
  let found = false

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(key + '=')) {
      lines[i] = `${key}=${value}`
      found = true
      break
    }
  }

  if (!found) lines.push(`${key}=${value}`)

  fs.writeFileSync(ENV_PATH, lines.join('\n'))
  process.env[key] = value
}

module.exports = {
  command: ['alive', 'setalive'],
  category: 'utility',
  desc: 'Show bot alive status / set alive message',
  usage: '.alive | .setalive <text>;<image url>',
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, context) {
    const { command, text, reply, isOwner } = context

    if (command === 'alive') {
      const alive = readAlive()

      if (alive.img) {
        return sock.sendMessage(
          m.chat,
          {
            image: { url: alive.img },
            caption: alive.text || ''
          },
          { quoted: m }
        )
      }

      return reply(alive.text)
    }

    if (command === 'setalive') {
      if (!isOwner) {
        return reply('owner only command')
      }

      if (!text) {
        return reply(
`Usage:
.setalive <text>
.setalive <text>;<image url>

Example:
.setalive 𝚾 𝚳𝚵𝐆𝚫𝚻𝚪𝚯𝚴 𝚰𝐒 𝚫𝐋𝚰𝛁𝚵
.setalive 𝚾 𝚳𝚵𝐆𝚫𝚻𝚪𝚯𝚴 𝚰𝐒 𝚫𝐋𝚰𝛁𝚵;https://i.ibb.co/LXdBnX1F/temp.jpg`
        )
      }

      updateEnv('ALIVE', text.trim())
      return reply('alive updated successfully')
    }
  }
}