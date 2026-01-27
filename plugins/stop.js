module.exports = {
  command: ['stop', 'enable', 'stopped', 'listdisabled'],
  category: 'owner',
  description: 'Manage bot commands - stop, enable, and list disabled commands',

  async execute(sock, m, { reply, args, command, isOwner }) {
    
    // Owner only check
    if (!isOwner) {
      return reply('_❌ This command is only for the owner_');
    }

    // ============ STOP COMMAND ============
    if (command === 'stop') {
      
      if (args.length === 0) {
        return reply('_❌ Provide a command name to disable_\n\n_Usage:_ `.stop <command>`\n_Example:_ `.stop ytv`');
      }

      const cmdToDisable = args[0].toLowerCase();

      // Prevent stopping critical commands
      const protectedCommands = ['stop', 'enable', 'stopped', 'listdisabled', 'reboot', 'restart'];
      if (protectedCommands.includes(cmdToDisable)) {
        return reply('_❌ Cannot disable this command_\n\n_This is a protected system command_');
      }

      // Check if already disabled
      if (global.disabledCommands.has(cmdToDisable)) {
        return reply(`_⚠️ Command "${cmdToDisable}" is already disabled_`);
      }

      // Disable the command
      global.disabledCommands.add(cmdToDisable);
      
      // Save to file for persistence
      if (global.saveDisabledCommands) {
        global.saveDisabledCommands();
      }

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      return reply(`_✅ Command disabled successfully_\n\n_Command:_ \`${cmdToDisable}\`\n\n_Use .enable ${cmdToDisable} to re-enable_`);
    }

    // ============ ENABLE COMMAND ============
    if (command === 'enable') {
      
      if (args.length === 0) {
        return reply('_❌ Provide a command name to enable_\n\n_Usage:_ `.enable <command>`\n_Example:_ `.enable ytv`');
      }

      const cmdToEnable = args[0].toLowerCase();

      // Check if command is disabled
      if (!global.disabledCommands.has(cmdToEnable)) {
        return reply(`_⚠️ Command "${cmdToEnable}" is not disabled_\n\n_It is already enabled and working_`);
      }

      // Enable the command
      global.disabledCommands.delete(cmdToEnable);
      
      // Save to file for persistence
      if (global.saveDisabledCommands) {
        global.saveDisabledCommands();
      }

      await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
      return reply(`_✅ Command enabled successfully_\n\n_Command:_ \`${cmdToEnable}\`\n\n_The command is now active_`);
    }

    // ============ STOPPED/LISTDISABLED COMMAND ============
    if (command === 'stopped' || command === 'listdisabled') {
      
      const disabledCommands = Array.from(global.disabledCommands);

      if (disabledCommands.length === 0) {
        return reply('_✅ No commands are currently disabled_\n\n_All bot commands are active_');
      }

      // Sort alphabetically
      disabledCommands.sort();

      let message = `*DISABLED COMMANDS*\n\n`;
      message += `_Total:_ ${disabledCommands.length}\n\n`;
      
      disabledCommands.forEach((cmd, index) => {
        message += `${index + 1}. \`${cmd}\`\n`;
      });

      message += `\n_To enable a command:_\n.enable <command>\n\n`;
      message += `_Example:_ .enable ${disabledCommands[0]}`;

      return reply(message);
    }
  }
};