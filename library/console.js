const chalk = require('chalk');

const blockedPatterns = [
  'SessionEntry',
  'Closing session',
  'Closing open session',
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
  'availabl',
  'Failed to decrypt',
  'decrypt message',
  'known session',
  'prekey bundle',
  'incoming prekey',
  'favor of incoming',
  'session in favor',
  'open session in',
  'Baileys',
  'pino',
  'libsignal'
];

const getTimestamp = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const shouldBlock = (msg) => {
  const lowerMsg = msg.toLowerCase();
  return blockedPatterns.some(p => lowerMsg.includes(p.toLowerCase()));
};

const rawWrite = process.stdout.write.bind(process.stdout);
const rawError = process.stderr.write.bind(process.stderr);

process.stdout.write = (chunk, encoding, cb) => {
  const msg = chunk.toString();
  if (shouldBlock(msg)) return true;
  return rawWrite(chunk, encoding, cb);
};

process.stderr.write = (chunk, encoding, cb) => {
  const msg = chunk.toString();
  if (shouldBlock(msg)) return true;
  return rawError(chunk, encoding, cb);
};

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function(...args) {
  const msg = args.join(' ');
  if (shouldBlock(msg)) return;
  originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
  const msg = args.join(' ');
  if (shouldBlock(msg)) return;
  originalConsoleError.apply(console, args);
};

console.warn = function(...args) {
  const msg = args.join(' ');
  if (shouldBlock(msg)) return;
  originalConsoleWarn.apply(console, args);
};

const log = {
  info: (text) => {
    originalConsoleLog(chalk.cyan(`[${getTimestamp()}]`) + chalk.blue(` INFO: ${text}`));
  },

  success: (text) => {
    originalConsoleLog(chalk.cyan(`[${getTimestamp()}]`) + chalk.green(` SUCCESS: ${text}`));
  },

  warn: (text) => {
    originalConsoleLog(chalk.cyan(`[${getTimestamp()}]`) + chalk.yellow(` WARN: ${text}`));
  },

  error: (text) => {
    originalConsoleLog(chalk.cyan(`[${getTimestamp()}]`) + chalk.red(` ERROR: ${text}`));
  },

  command: (text) => {
    originalConsoleLog(chalk.cyan(`[${getTimestamp()}]`) + chalk.magenta(` CMD: ${text}`));
  },

  debug: (text) => {
    originalConsoleLog(chalk.cyan(`[${getTimestamp()}]`) + chalk.gray(` DEBUG: ${text}`));
  }
};

module.exports = log;
