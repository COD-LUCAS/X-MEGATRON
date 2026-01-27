const axios = require('axios')

const IG_API = 'https://api.sparky.biz.id/api/downloader/igdl?url='

async function igdl(url) {
  const res = await axios.get(IG_API + encodeURIComponent(url), {
    timeout: 20000
  })

  if (!res.data || !res.data.status) return null

  return res.data.result || res.data.data || []
}

module.exports = {
  igdl
}