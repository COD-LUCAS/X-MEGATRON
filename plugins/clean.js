'use strict';

const fs = require('fs');
const path = require('path');

const TMP_DIR = path.join(__dirname, '..', 'database', 'tmp');
const SESSION_DIR = path.join(__dirname, '..', 'sessions');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

module.exports = {
  command: ['clean', 'cleaner', 'cleanup'],
  category: 'owner',
  desc: 'Clean temporary and unused files',
  usage: '.clean',

  async execute(sock, m, { reply, isOwner }) {
    if (!isOwner) return reply('_Owner only_');
    
    await sock.sendMessage(m.chat, { react: { text: '🧹', key: m.key } });
    
    let deletedCount = 0;
    let totalSize = 0;
    const results = [];
    
    // 1. Clean temp directory (database/tmp)
    if (fs.existsSync(TMP_DIR)) {
      let count = 0;
      let size = 0;
      const files = fs.readdirSync(TMP_DIR);
      
      for (const file of files) {
        const filePath = path.join(TMP_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          size += stats.size;
          fs.unlinkSync(filePath);
          count++;
        } catch (_) {}
      }
      
      if (count > 0) {
        deletedCount += count;
        totalSize += size;
        results.push(`_Temp files: ${count} (${(size / 1024 / 1024).toFixed(2)} MB)_`);
      }
    }
    
    // 2. Clean old session backups (older than 1 day)
    if (fs.existsSync(SESSION_DIR)) {
      let count = 0;
      let size = 0;
      const now = Date.now();
      const files = fs.readdirSync(SESSION_DIR);
      
      for (const file of files) {
        const filePath = path.join(SESSION_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          if (file.includes('backup') || (now - stats.mtimeMs > 24 * 60 * 60 * 1000)) {
            size += stats.size;
            fs.unlinkSync(filePath);
            count++;
          }
        } catch (_) {}
      }
      
      if (count > 0) {
        deletedCount += count;
        totalSize += size;
        results.push(`_Old sessions: ${count} (${(size / 1024 / 1024).toFixed(2)} MB)_`);
      }
    }
    
    // 3. Clean empty directories
    const cleanEmptyDirs = (dir) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      if (files.length === 0) {
        try {
          fs.rmdirSync(dir);
          results.push(`_Removed empty folder: ${path.basename(dir)}_`);
        } catch (_) {}
      } else {
        for (const file of files) {
          const filePath = path.join(dir, file);
          if (fs.statSync(filePath).isDirectory()) {
            cleanEmptyDirs(filePath);
          }
        }
      }
    };
    cleanEmptyDirs(TMP_DIR);
    
    // 4. Clean log files older than 1 day
    const LOG_DIR = path.join(__dirname, '..', 'logs');
    if (fs.existsSync(LOG_DIR)) {
      let count = 0;
      let size = 0;
      const now = Date.now();
      const files = fs.readdirSync(LOG_DIR);
      
      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(LOG_DIR, file);
          try {
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
              size += stats.size;
              fs.unlinkSync(filePath);
              count++;
            }
          } catch (_) {}
        }
      }
      
      if (count > 0) {
        deletedCount += count;
        totalSize += size;
        results.push(`_Old logs: ${count} (${(size / 1024 / 1024).toFixed(2)} MB)_`);
      }
    }
    
    // 5. Clean node_modules .cache if exists
    const NPM_CACHE = path.join(__dirname, '..', 'node_modules', '.cache');
    if (fs.existsSync(NPM_CACHE)) {
      let count = 0;
      let size = 0;
      
      const deleteFolder = (folderPath) => {
        if (fs.existsSync(folderPath)) {
          const files = fs.readdirSync(folderPath);
          for (const file of files) {
            const filePath = path.join(folderPath, file);
            try {
              const stats = fs.statSync(filePath);
              if (stats.isDirectory()) {
                deleteFolder(filePath);
              } else {
                size += stats.size;
                fs.unlinkSync(filePath);
                count++;
              }
            } catch (_) {}
          }
          try { fs.rmdirSync(folderPath); } catch (_) {}
        }
      };
      
      deleteFolder(NPM_CACHE);
      
      if (count > 0) {
        deletedCount += count;
        totalSize += size;
        results.push(`_Cache files: ${count} (${(size / 1024 / 1024).toFixed(2)} MB)_`);
      }
    }
    
    // 6. Clean FFmpeg thumbnails cache
    const FFMPEG_CACHE = path.join(__dirname, '..', 'database', 'ffmpeg_cache');
    if (fs.existsSync(FFMPEG_CACHE)) {
      let count = 0;
      let size = 0;
      const files = fs.readdirSync(FFMPEG_CACHE);
      
      for (const file of files) {
        const filePath = path.join(FFMPEG_CACHE, file);
        try {
          const stats = fs.statSync(filePath);
          size += stats.size;
          fs.unlinkSync(filePath);
          count++;
        } catch (_) {}
      }
      
      if (count > 0) {
        deletedCount += count;
        totalSize += size;
        results.push(`_FFmpeg cache: ${count} (${(size / 1024 / 1024).toFixed(2)} MB)_`);
      }
    }
    
    // Prepare response
    let response = '';
    
    if (deletedCount === 0) {
      response = '_No files to clean_';
    } else {
      response = `_Cleaned ${deletedCount} files_\n_Freed ${(totalSize / 1024 / 1024).toFixed(2)} MB_\n\n`;
      response += results.slice(0, 5).join('\n');
    }
    
    await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    return reply(response);
  }
};