export const command = "ping";

export async function run({ sock, msg }) {
  const start = Date.now();
  await sock.sendMessage(msg.key.remoteJid, { text: "Pinging..." });
  await sock.sendMessage(msg.key.remoteJid, {
    text: `Ping: ${Date.now() - start} ms`
  });
}
