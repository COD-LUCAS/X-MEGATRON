const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PDF_TEMP = path.join(__dirname, '..', 'temp', 'pdf_temp');

function ensureFolder() {
  if (!fs.existsSync(PDF_TEMP)) {
    fs.mkdirSync(PDF_TEMP, { recursive: true });
  }
}

module.exports = {
  command: ['pdf', 'pdfdelete', 'pdfget'],
  category: 'utility',
  desc: 'Create PDF from images',
  usage: '.pdf (reply to image) | .pdfdelete | .pdfget <name>',

  async execute(sock, m, context) {
    const { command, args, reply } = context;

    // ==================== PDF HELP / ADD IMAGE ====================
    if (command === 'pdf') {
      if (!m.quoted) {
        return reply(
          '_📝 *PDF Creator Help*_\n\n' +
          '_`.pdf` → Show help_\n' +
          '_`.pdfdelete` → Delete all saved images_\n' +
          '_`.pdfget <name>` → Generate PDF_\n\n' +
          '_*How to use:*_\n' +
          '_1️⃣ Reply to an image using `.pdf`_\n' +
          '_2️⃣ Add more images by replying again_\n' +
          '_3️⃣ Use `.pdfget name` to create PDF_'
        );
      }

      if (m.quoted.mtype !== 'imageMessage') {
        return reply('_Reply to an image only_');
      }

      ensureFolder();

      try {
        const media = await m.quoted.download();
        const index = fs.readdirSync(PDF_TEMP).length;
        const imagePath = path.join(PDF_TEMP, `img_${index}.jpg`);

        fs.writeFileSync(imagePath, media);

        return reply(`_✅ Image saved!_\n_Total images: ${index + 1}_`);
      } catch (e) {
        return reply('_Failed to save image_');
      }
    }

    // ==================== PDF DELETE ====================
    if (command === 'pdfdelete') {
      ensureFolder();

      try {
        const files = fs.readdirSync(PDF_TEMP);
        
        for (const file of files) {
          fs.unlinkSync(path.join(PDF_TEMP, file));
        }

        return reply(`_🗑️ All saved images deleted! (${files.length} files)_`);
      } catch (e) {
        return reply('_Failed to delete images_');
      }
    }

    // ==================== PDF GET ====================
    if (command === 'pdfget') {
      if (!args[0]) {
        return reply('_Provide a PDF name_\n_Example: .pdfget mydocument_');
      }

      const name = args.join(' ').trim();
      ensureFolder();

      const files = fs.readdirSync(PDF_TEMP)
        .filter(f => f.endsWith('.jpg'))
        .sort();

      if (files.length === 0) {
        return reply('_❌ No images saved. Use `.pdf` to add images first_');
      }

      const pdfName = `${name}.pdf`;
      const pdfPath = path.join(PDF_TEMP, pdfName);

      try {
        await reply(`_Creating PDF with ${files.length} image(s)..._`);

        // Build convert command with all images
        const imagePaths = files.map(f => `"${path.join(PDF_TEMP, f)}"`).join(' ');
        
        // Use ImageMagick convert to create PDF
        await execAsync(`convert ${imagePaths} "${pdfPath}"`);

        // Send PDF
        const pdfBuffer = fs.readFileSync(pdfPath);

        await sock.sendMessage(m.chat, {
          document: pdfBuffer,
          mimetype: 'application/pdf',
          fileName: pdfName,
          caption: `_📄 Your PDF: ${pdfName}_`
        }, { quoted: m });

        // Clean up
        for (const file of files) {
          fs.unlinkSync(path.join(PDF_TEMP, file));
        }
        fs.unlinkSync(pdfPath);

        return reply('_✅ PDF created and temporary files cleaned_');

      } catch (e) {
        console.error('PDF creation error:', e);
        
        // Fallback: Try using img2pdf if convert fails
        try {
          // Install img2pdf: npm install img2pdf-cli
          const imagePaths = files.map(f => `"${path.join(PDF_TEMP, f)}"`).join(' ');
          await execAsync(`img2pdf ${imagePaths} -o "${pdfPath}"`);

          const pdfBuffer = fs.readFileSync(pdfPath);

          await sock.sendMessage(m.chat, {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: pdfName,
            caption: `_📄 Your PDF: ${pdfName}_`
          }, { quoted: m });

          for (const file of files) {
            fs.unlinkSync(path.join(PDF_TEMP, file));
          }
          fs.unlinkSync(pdfPath);

          return reply('_✅ PDF created and temporary files cleaned_');

        } catch (e2) {
          return reply(`_❌ Failed to create PDF. Install ImageMagick or img2pdf:_\n\`${e.message}\``);
        }
      }
    }
  }
};
