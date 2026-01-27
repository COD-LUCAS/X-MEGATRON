const gis = require('g-i-s')

module.exports = {
  command: ['img', 'image'],
  category: 'downloader',
  desc: 'Search and download images from Google',
  usage: '.img <query> | .img <count> <query>',
  group: false,
  admin: false,
  owner: false,

  async execute(sock, m, { reply, args }) {
    if (!args.length) {
      return reply('_usage:_\n.img megatron\n.img 10 megatron')
    }

    let count = 5
    let query = args.join(' ')

    if (!isNaN(args[0])) {
      count = Math.min(parseInt(args[0]), 20)
      query = args.slice(1).join(' ')
    }

    if (!query) {
      return reply('_please provide a search query_')
    }

    gis(query, async (err, results) => {
      if (err || !results || !results.length) {
        return reply('_no images found_')
      }

      const images = results
        .filter(v => v.url)
        .slice(0, count)

      for (const img of images) {
        await sock.sendMessage(
          m.chat,
          { image: { url: img.url } },
          { quoted: m }
        )
      }
    })
  }
}