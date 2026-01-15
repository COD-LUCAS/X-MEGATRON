const axios = require('axios')
const moment = require('moment-timezone')
const { sizeFormatter } = require('human-readable')
const util = require('util')
const Jimp = require('jimp')
const vm = require('vm')
const CryptoJS = require('crypto-js')

const unixTimestampSeconds = (date = new Date()) =>
  Math.floor(date.getTime() / 1000)

const resize = async (buffer, w, h) => {
  const img = await Jimp.read(buffer)
  return img.resize(w, h).getBufferAsync(Jimp.MIME_JPEG)
}

const generateMessageTag = (epoch) => {
  let tag = unixTimestampSeconds().toString()
  if (epoch) tag += '.--' + epoch
  return tag
}

const processTime = (timestamp, now) =>
  moment.duration(now - moment(timestamp * 1000)).asSeconds()

const clockString = (ms) => {
  let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
  let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
  let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':')
}

const runtime = (seconds) => {
  seconds = Number(seconds)
  const d = Math.floor(seconds / 86400)
  const h = Math.floor(seconds % 86400 / 3600)
  const m = Math.floor(seconds % 3600 / 60)
  const s = Math.floor(seconds % 60)
  return [
    d ? `${d} day${d > 1 ? 's' : ''}` : null,
    h ? `${h} hour${h > 1 ? 's' : ''}` : null,
    m ? `${m} minute${m > 1 ? 's' : ''}` : null,
    s ? `${s} second${s > 1 ? 's' : ''}` : null
  ].filter(Boolean).join(', ') || '0 seconds'
}

const getTime = (format, date) =>
  date
    ? moment(date).tz('Asia/Kolkata').format(format)
    : moment().tz('Asia/Kolkata').format(format)

const formatDate = (d) =>
  new Date(d).toLocaleString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZone: 'Asia/Kolkata'
  })

const getRandom = ext =>
  `${Math.floor(Math.random() * 10000)}${ext}`

const getBuffer = async (url, opt = {}) => {
  const res = await axios({
    method: 'get',
    url,
    headers: { DNT: 1 },
    responseType: 'arraybuffer',
    ...opt
  })
  return res.data
}

const fetchJson = async (url, opt = {}) => {
  const res = await axios({
    method: 'get',
    url,
    headers: { 'User-Agent': 'Mozilla/5.0' },
    ...opt
  })
  return res.data
}

const bytesToSize = (bytes, d = 2) => {
  if (!bytes) return '0 Bytes'
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(d)} ${['Bytes','KB','MB','GB','TB'][i]}`
}

const formatp = sizeFormatter({
  std: 'JEDEC',
  decimalPlaces: 2,
  render: (l, s) => `${l} ${s}B`
})

const getSizeMedia = async (input) => {
  if (Buffer.isBuffer(input))
    return bytesToSize(Buffer.byteLength(input))
  const r = await axios.head(input)
  return bytesToSize(Number(r.headers['content-length']))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const isUrl = url =>
  /^https?:\/\//.test(url)

const jsonformat = o =>
  JSON.stringify(o, null, 2)

const format = (...a) =>
  util.format(...a)

const parseMention = text =>
  [...text.matchAll(/@(\d{5,16})/g)].map(v => v[1] + '@s.whatsapp.net')

const getGroupAdmins = p =>
  p.filter(v => v.admin).map(v => v.id)

const generateProfilePicture = async (buf) => {
  const img = await Jimp.read(buf)
  const min = Math.min(img.getWidth(), img.getHeight())
  const crop = img.crop(0, 0, min, min)
  const out = await crop.scaleToFit(720, 720).getBufferAsync(Jimp.MIME_JPEG)
  return { img: out, preview: out }
}

const dechtml = async (buf) => {
  const html = buf.toString()
  if (/atob\(/.test(html)) {
    const b64 = html.match(/atob\(["'`](.*?)["'`]\)/)[1]
    return Buffer.from(b64, 'base64')
  }
  if (/const chunks =/.test(html)) {
    const ctx = {}
    vm.createContext(ctx)
    vm.runInContext(html, ctx)
    const key = CryptoJS.lib.WordArray.create(new Uint8Array(ctx.splitKey.flat()))
    const iv = CryptoJS.lib.WordArray.create(new Uint8Array(ctx.splitIv.flat()))
    return Buffer.from(
      CryptoJS.AES.decrypt(
        { ciphertext: CryptoJS.enc.Base64.parse(ctx.chunks.join('')) },
        key,
        { iv }
      ).toString(CryptoJS.enc.Utf8)
    )
  }
  return Buffer.from(html)
}

const fetchWithTimeout = async (url, ms) => {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  const r = await axios.get(url, { signal: ctrl.signal })
  return r
}

module.exports = {
  unixTimestampSeconds,
  resize,
  generateMessageTag,
  processTime,
  clockString,
  runtime,
  getTime,
  formatDate,
  getRandom,
  getBuffer,
  fetchJson,
  bytesToSize,
  formatp,
  getSizeMedia,
  sleep,
  isUrl,
  jsonformat,
  format,
  parseMention,
  getGroupAdmins,
  generateProfilePicture,
  dechtml,
  fetchWithTimeout
}
