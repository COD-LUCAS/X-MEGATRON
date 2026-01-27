module.exports = {
  command: ['left', 'clear'],
  category: 'owner',
  group: false,
  admin: false,
  owner: true,
  desc: {
    left: 'Bot leaves the current group',
    clear: 'Clear all messages in this chat'
  },

  async execute(sock, m, context) {
    const { reply, command, isOwner, isGroup } = context

    if (!isOwner) return

    try {
      if (command === 'left') {
        if (!isGroup) return reply('_this command works only in groups_')
        await reply('_leaving group..._')
        await new Promise(r => setTimeout(r, 1500))
        await sock.groupLeave(m.chat)
        return
      }

      if (command === 'clear') {
        await sock.chatModify(
          {
            clear: {
              messages: [
                {
                  id: m.key.id,
                  fromMe: false
                }
              ]
            }
          },
          m.chat
        )
        return
      }

    } catch {
      return
    }
  }
}