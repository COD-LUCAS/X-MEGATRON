const Jimp = require("jimp");

async function generateProfilePicture(buffer) {
  try {
    const jimp = await Jimp.read(buffer);
    const min = jimp.bitmap.width;
    const max = jimp.bitmap.height;
    const cropped = jimp.crop(0, 0, min, max);
    return {
      img: await cropped.scaleToFit(324, 720).getBufferAsync(Jimp.MIME_JPEG),
      preview: await cropped.normalize().getBufferAsync(Jimp.MIME_JPEG)
    };
  } catch (err) {
    console.error("Generate profile error:", err);
    throw err;
  }
}

async function updatefullpp(jid, imag, client) {
  try {
    const { query } = client;
    const { img } = await generateProfilePicture(imag);
    await query({
      tag: "iq",
      attrs: {
        to: jid,
        type: "set",
        xmlns: "w:profile:picture"
      },
      content: [{
        tag: "picture",
        attrs: {
          type: "image"
        },
        content: img
      }]
    });
    return true;
  } catch (err) {
    console.error("Update PP error:", err);
    return false;
  }
}

module.exports = { updatefullpp, generateProfilePicture };