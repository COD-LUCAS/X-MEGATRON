const chalk = require('chalk');

const blockedPatterns = [
  'SessionEntry',
  'Closing session',
  '_chains',
  'ephemeralKeyPair',
  'registrationId',
  'currentRatchet',
  'lastRemoteEphemeralKey',
  'rootKey',
  'indexInfo',
  'pendingPreKey',
  'DeprecationWarning',
  'fs.Stats',
  'node:',
  'WASignalGroup',
  'MAC Error',
  'Bad MAC',
  'decryptWithSessionFromPreKey',
  'SessionCipher',
  'async _asyncQueueExecutor',
  'verifyMAC',
  'getGroupCipher',
  'Decrypted message',
  'Command: ping',
  'Group: false',
  'availabl'
];

const getTimestamp = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const rawWrite = process.stdout.write.bind(process.stdout);
const rawError = process.stderr.write.bind(process.stderr);

process.stdout.write = (chunk, encoding, cb) => {
  const msg = chunk.toString();
  if (blockedPatterns.some(p => msg.includes(p))) return true;
  return rawWrite(chunk, encoding, cb);
};

process.stderr.write = (chunk, encoding, cb) => {
  const msg = chunk.toString();
  if (blockedPatterns.some(p => msg.includes(p))) return true;
  return rawError(chunk, encoding, cb);
};

const log = {
  info: (text) => {
    console.log(chalk.cyan(`[${getTimestamp()}]`) + chalk.blue(` INFO: ${text}`));
  },
  
  success: (text) => {
    console.log(chalk.cyan(`[${getTimestamp()}]`) + chalk.green(` SUCCESS: ${text}`));
  },
  
  warn: (text) => {
    console.log(chalk.cyan(`[${getTimestamp()}]`) + chalk.yellow(` WARN: ${text}`));
  },
  
  error: (text) => {
    console.log(chalk.cyan(`[${getTimestamp()}]`) + chalk.red(` ERROR: ${text}`));
  },
  
  command: (text) => {
    console.log(chalk.cyan(`[${getTimestamp()}]`) + chalk.magenta(` CMD: ${text}`));
  },
  
  debug: (text) => {
    console.log(chalk.cyan(`[${getTimestamp()}]`) + chalk.gray(` DEBUG: ${text}`));
  }
};

module.exports = log;
