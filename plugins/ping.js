module.exports = {
  command: ['ping'],
  category: 'utility',
  desc: 'Check bot response time',
  usage: '.ping',
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, { reply }) {
    const start = process.hrtime()

    const sent = await reply('_Pinging..._')

    const diff = process.hrtime(start)
    const latency = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2)

    await sock.sendMessage(
      m.chat,
      {
        text: `_Response time: ${latency} ms_`,
        edit: sent.key
      }
    )
  }
}