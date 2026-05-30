/**
 * library/profile.js
 * Compatible with Jimp v1.x (new API)
 */

'use strict';

const { Jimp, JimpMime } = require('jimp');

async function generateProfilePicture(buffer) {
  const jimp = await Jimp.fromBuffer(buffer);

  const w = jimp.width;
  const h = jimp.height;

  // Scale to fit 324x720 keeping aspect ratio — no crop
  jimp.scaleToFit({ w: 324, h: 720 });

  const img = await jimp.getBuffer(JimpMime.jpeg);

  return { img, preview: img };
}

async function updatefullpp(jid, buffer, sock) {
  const { img } = await generateProfilePicture(buffer);
  await sock.query({
    tag: 'iq',
    attrs: {
      to:    '@s.whatsapp.net',
      type:  'set',
      xmlns: 'w:profile:picture'
    },
    content: [{
      tag:     'picture',
      attrs:   { type: 'image' },
      content: img
    }]
  });
}

module.exports = { updatefullpp };
