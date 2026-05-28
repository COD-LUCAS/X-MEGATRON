const fs = require('fs');
const path = require('path');

// Path to store the configuration
const configPath = path.join(__dirname, '..', 'database', 'autotyping.json');

// Initialize configuration file if it doesn't exist
function initConfig() {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({ enabled: false }, null, 2));
    }
    return JSON.parse(fs.readFileSync(configPath));
}

// Check if autotyping is enabled
function isAutotypingEnabled() {
    try {
        const config = initConfig();
        return config.enabled;
    } catch (error) {
        console.error('Error checking autotyping status:', error);
        return false;
    }
}

// Handle typing indicator for messages
async function handleAutotypingForMessage(sock, chatId, userMessage) {
    if (isAutotypingEnabled() && userMessage && userMessage.length > 0) {
        try {
            await sock.presenceSubscribe(chatId);
            await sock.sendPresenceUpdate('available', chatId);
            await new Promise(resolve => setTimeout(resolve, 500));
            await sock.sendPresenceUpdate('composing', chatId);
            
            const typingDelay = Math.max(2000, Math.min(6000, userMessage.length * 100));
            await new Promise(resolve => setTimeout(resolve, typingDelay));
            
            await sock.sendPresenceUpdate('composing', chatId);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await sock.sendPresenceUpdate('paused', chatId);
            return true;
        } catch (error) {
            console.error('Error sending typing indicator:', error);
            return false;
        }
    }
    return false;
}

// Show typing after command execution
async function showTypingAfterCommand(sock, chatId) {
    if (isAutotypingEnabled()) {
        try {
            await sock.presenceSubscribe(chatId);
            await sock.sendPresenceUpdate('composing', chatId);
            await new Promise(resolve => setTimeout(resolve, 800));
            await sock.sendPresenceUpdate('paused', chatId);
            return true;
        } catch (error) {
            console.error('Error sending post-command typing:', error);
            return false;
        }
    }
    return false;
}

module.exports = {
    name: 'autotyping',
    category: 'owner',
    desc: 'Toggle auto-typing indicator on/off',
    usage: '.autotyping on/off',
    async execute(sock, message, args, fromMe, chatId) {
        try {
            const config = initConfig();

            if (args && args.length > 0) {
                const action = args[0].toLowerCase();
                if (action === 'on' || action === 'enable') {
                    config.enabled = true;
                } else if (action === 'off' || action === 'disable') {
                    config.enabled = false;
                } else {
                    await sock.sendMessage(chatId, {
                        text: '❌ Invalid option! Use: .autotyping on/off'
                    });
                    return;
                }
            } else {
                config.enabled = !config.enabled;
            }

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            await sock.sendMessage(chatId, {
                text: `✅ Auto-typing has been ${config.enabled ? 'enabled' : 'disabled'}!`
            });

        } catch (error) {
            console.error('Error in autotyping command:', error);
            await sock.sendMessage(chatId, {
                text: '❌ Error processing command!'
            });
        }
    },
    // Export helper functions for use in index.js
    isAutotypingEnabled,
    handleAutotypingForMessage,
    showTypingAfterCommand
};