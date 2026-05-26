'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@itsliaaa/baileys');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const getTempPath = (filename) => path.join(TMP_DIR, `${Date.now()}_${filename}`);
const cleanTemp = (file) => {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
};

module.exports = {
  command: ['identify'],
  category: 'tools',
  desc: 'Identify song from audio, video, or media URL',
  usage: '.identify <url> | .identify (reply to audio/video)',

  async execute(sock, m, context) {
    const { reply, args, react } = context;
    
    const inputUrl = args.join(' ').trim();
    const quotedText = m.quoted?.body?.trim();
    let mediaUrl = null;
    let statusMsg = null;
    
    try {
      // Case 1: Reply to audio/video message
      if (m.quoted && (m.quoted.mtype === 'audioMessage' || m.quoted.mtype === 'videoMessage')) {
        statusMsg = await reply('_Identifying song from media..._');
        await react('⏳');
        
        // Download media
        const quotedMsg = m.quoted.message;
        let mediaBuffer = await m.quoted.download();
        
        if (!mediaBuffer) {
          throw new Error('Failed to download media');
        }
        
        // Save temp file
        const fileExt = m.quoted.mtype === 'audioMessage' ? 'mp3' : 'mp4';
        const filePath = getTempPath(`identify.${fileExt}`);
        fs.writeFileSync(filePath, mediaBuffer);
        
        // Upload to hosting
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        
        const uploadRes = await axios.post(
          'https://ar-hosting.pages.dev/upload',
          form,
          { headers: form.getHeaders(), timeout: 30000 }
        );
        
        cleanTemp(filePath);
        
        if (!uploadRes.data || (!uploadRes.data.url && !uploadRes.data.data)) {
          throw new Error('Upload failed! No valid URL returned.');
        }
        
        mediaUrl = uploadRes.data.url || uploadRes.data.data;
      }
      
      // Case 2: URL provided in command
      else if (inputUrl && inputUrl.startsWith('http')) {
        statusMsg = await reply('_Identifying song from link..._');
        await react('⏳');
        mediaUrl = inputUrl;
      }
      
      // Case 3: URL in replied message
      else if (quotedText && quotedText.startsWith('http')) {
        statusMsg = await reply('_Identifying song from replied link..._');
        await react('⏳');
        mediaUrl = quotedText;
      }
      
      // No valid input
      else {
        return reply('_Usage:_\n_.identify <media_url>_\n_or reply to an audio, video, or message containing a media link._');
      }
      
      // Identify song using API
      const identifyRes = await axios.get(`https://jerrycoder.oggyapi.workers.dev/tool/identify?url=${encodeURIComponent(mediaUrl)}`, { timeout: 30000 });
      const data = identifyRes.data;
      
      if (data.status !== 'success') {
        throw new Error(data.msg || 'No song found');
      }
      
      const { title, artist, image, shazam_url } = data.result;
      const fallbackImg = 'https://ar-hosting.pages.dev/1751890521453.jpg';
      
      await react('✅');
      
      const caption = `_Song Identified!_\n\n` +
        `_Title  : ${title}_\n` +
        `_Artist : ${artist}_\n\n` +
        `_Shazam : ${shazam_url}_`;
      
      // Send image with caption
      await sock.sendMessage(m.chat, {
        image: { url: image || fallbackImg },
        caption: caption
      }, { quoted: m });
      
    } catch (err) {
      console.error('Identify error:', err);
      await react('❌');
      
      if (statusMsg) {
        // Status already sent, can't edit in this framework
        await reply(`_Failed to identify song: ${err.message}_`);
      } else {
        await reply(`_Failed to identify song: ${err.message}_`);
      }
    }
  }
};