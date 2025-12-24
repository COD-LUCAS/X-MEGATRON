import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";

import fs from "fs";
import { handleMessage } from "../main.js";

export async function startManager(sessions, plugins) {
  const { version } = await fetchLatestBaileysVersion();
  let connected;

  for (const s of sessions) {
    const { state, saveCreds } = await useMultiFileAuthState(s.folder);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      emitOwnEvents: true,
      getMessage: async () => null
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      await handleMessage(sock, messages[0], plugins);
    });

    sock.ev.on("connection.update", ({ connection }) => {
      if (connection === "open") {
        connected = sock.user.id.split(":")[0];
      }
    });
  }

  while (!connected) await new Promise(r => setTimeout(r, 500));
  return connected;
}
