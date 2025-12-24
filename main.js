export async function handleMessage(sock, msg, plugins) {
  if (!msg.message || msg.key.fromMe) return;

  const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text;

  if (!text) return;

  const prefix = process.env.PREFIX === "null" ? "" : process.env.PREFIX;
  if (!text.startsWith(prefix)) return;

  const cmd = text.slice(prefix.length).split(" ")[0].toLowerCase();
  const run = plugins.get(cmd);
  if (!run) return;

  await run({ sock, msg });
}
