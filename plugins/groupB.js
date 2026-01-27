module.exports = {
  command: ['kickall', 'cancel', 'invite', 'reset', 'approve'],
  category: 'group',
  group: true,
  admin: true,
  desc: {
    kickall: 'Remove all non-admin members (10s delay)',
    cancel: 'Cancel an ongoing kickall process',
    invite: 'Get group invite link',
    reset: 'Reset group invite link',
    approve: 'Approve all join requests'
  },

  async execute(sock, m, context) {
    const {
      reply,
      command,
      isGroup,
      isAdmins,
      isOwner,
      participants
    } = context

    if (!isGroup) return reply('_this command works only in groups_')
    if (!isAdmins && !isOwner) return reply('_you must be admin_')

    global.kickallProcess = global.kickallProcess || {}

    try {
      if (command === 'kickall') {
        if (global.kickallProcess[m.chat]) {
          return reply('_kickall already running_')
        }

        const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net'

        const targets = participants
          .filter(p => {
            const isBot = p.id === botJid
            const isAdmin = p.admin === 'admin' || p.admin === 'superadmin'
            return !isBot && !isAdmin
          })
          .map(p => p.id)

        if (!targets.length) return reply('_no members to remove_')

        await reply(`_kickall will start in 10 seconds_\n_send .cancel to stop_`)

        let cancelled = false

        const timer = setTimeout(async () => {
          if (cancelled) return

          for (const id of targets) {
            try {
              await sock.groupParticipantsUpdate(m.chat, [id], 'remove')
              await new Promise(r => setTimeout(r, 1000))
            } catch {}
          }

          delete global.kickallProcess[m.chat]
          await reply(`_removed ${targets.length} members_`)
        }, 10000)

        global.kickallProcess[m.chat] = {
          cancel: () => {
            cancelled = true
            clearTimeout(timer)
          }
        }

        return
      }

      if (command === 'cancel') {
        if (!global.kickallProcess[m.chat]) {
          return reply('_no kickall running_')
        }

        global.kickallProcess[m.chat].cancel()
        delete global.kickallProcess[m.chat]
        return reply('_kickall cancelled_')
      }

      if (command === 'invite') {
        const code = await sock.groupInviteCode(m.chat)
        return reply(`_group invite link_\nhttps://chat.whatsapp.com/${code}`)
      }

      if (command === 'reset') {
        const code = await sock.groupRevokeInvite(m.chat)
        return reply(`_invite link reset_\nhttps://chat.whatsapp.com/${code}`)
      }

      if (command === 'approve') {
        const requests = await sock.groupRequestParticipantsList(m.chat)
        if (!requests.length) return reply('_no pending requests_')

        const ids = requests.map(r => r.jid)
        await sock.groupRequestParticipantsUpdate(m.chat, ids, 'approve')

        return reply(`_approved ${ids.length} requests_`)
      }

    } catch {
      return reply('_command failed_')
    }
  }
}