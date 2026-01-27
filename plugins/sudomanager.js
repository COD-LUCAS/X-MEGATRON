const fs = require('fs')
const path = require('path')

const ENV_PATH = path.join(process.cwd(), '.env')

const readEnv = () => {
  if (!fs.existsSync(ENV_PATH)) return {}
  const data = fs.readFileSync(ENV_PATH, 'utf8')
  const env = {}
  for (const line of data.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [k, ...v] = line.split('=')
    env[k.trim()] = v.join('=').trim()
  }
  return env
}

const writeEnv = env => {
  const out = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  fs.writeFileSync(ENV_PATH, out + '\n')
}

const normalize = v => v.replace(/\D/g, '').slice(-10)

const extractTarget = (m, args) => {
  const mention = m.message?.extendedTextMessage?.contextInfo?.mentionedJid
  if (mention?.length) return mention[0].split('@')[0]
  if (args[0]) return args[0]
  return null
}

module.exports = {
  command: ['setsudo', 'listsudo', 'delsudo'],
  category: 'owner',
  desc: 'Manage sudo users',
  owner: true,

  async execute(sock, m, { command, args, reply, isCreator }) {
    if (!isCreator) return

    const env = readEnv()
    let sudoList = (env.SUDO || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)

    /* ───── LISTSUDO ───── */
    if (command === 'listsudo') {
      if (!sudoList.length) return reply('_no sudo users set_')
      return reply(
        '*Sudo Users*\n\n' +
        sudoList.map((v, i) => `${i + 1}. ${v}`).join('\n')
      )
    }

    const targetRaw = extractTarget(m, args)
    if (!targetRaw) return

    const target = normalize(targetRaw)
    sudoList = sudoList.map(normalize)

    /* ───── SETSUDO ───── */
    if (command === 'setsudo') {
      if (sudoList.includes(target)) return
      sudoList.push(target)
      env.SUDO = sudoList.join(',')
      writeEnv(env)
      return reply('_sudo added (restart bot to apply)_')
    }

    /* ───── DELSUDO ───── */
    if (command === 'delsudo') {
      if (!sudoList.includes(target)) return
      sudoList = sudoList.filter(v => v !== target)
      env.SUDO = sudoList.join(',')
      writeEnv(env)
      return reply('_sudo removed (restart bot to apply)_')
    }
  }
}