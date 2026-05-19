const Jimp = require("jimp");

async function generateProfilePicture(buffer) {
  const jimp = await Jimp.read(buffer);
  const min = jimp.getWidth();
  const max = jimp.getHeight();
  const cropped = jimp.crop(0, 0, min, max);
  return {
    img: await cropped.scaleToFit(324, 720).getBufferAsync(Jimp.MIME_JPEG),
    preview: await cropped.normalize().getBufferAsync(Jimp.MIME_JPEG)
  };
}

async function updateFullPP(jid, imageBuffer, sock) {
  try {
    const { img } = await generateProfilePicture(imageBuffer);
    
    await sock.query({
      tag: "iq",
      attrs: {
        to: jid,
        type: "set",
        xmlns: "w:profile:picture"
      },
      content: [
        {
          tag: "picture",
          attrs: { type: "image" },
          content: img
        }
      ]
    });
    
    return true;
  } catch (error) {
    console.error("Update PP error:", error);
    return false;
  }
}

module.exports = { updateFullPP, generateProfilePicture };