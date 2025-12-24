import fs from "fs";
import path from "path";
import pino from "pino";
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  jidNormalizedUser
} from "@whiskeysockets/baileys";

const pluginsDir = path.resolve("plugins");

export class Manager {
  constructor() {
    this.plugins = [];
    this.startTime = Date.now();

    this.MODE = (process.env.MODE || "PUBLIC").toUpperCase();
    this.PREFIX = process.env.PREFIX === "null" ? "" : (process.env.PREFIX || ".");
    this.OWNER = (process.env.OWNER || "").split(",").filter(Boolean);
    this.SUDO = (process.env.SUDO || "").split(",").filter(Boolean);
  }

  async start() {
    console.log("\x1b[34m\x1b[1m|X-MEGATRON| Starting bot\x1b[0m");

    const { state, saveCreds } = await useMultiFileAuthState("sessions");
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "fatal" }),
      syncFullHistory: false,
      generateHighQualityLinkPreview: false
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", ({ connection }) => {
      if (connection === "open") {
        const num = jidNormalizedUser(this.sock.user.id).split("@")[0];
        console.log(`\x1b[34m\x1b[1m|X-MEGATRON| Connected to ${num}\x1b[0m`);
      }
    });

    this.loadPlugins();
    this.listenMessages();
  }

  loadPlugins() {
    this.plugins = [];

    if (!fs.existsSync(pluginsDir)) return;

    for (const file of fs.readdirSync(pluginsDir)) {
      if (!file.endsWith(".js")) continue;
      const plugin = require(path.join(pluginsDir, file));
      if (plugin?.command && typeof plugin.run === "function") {
        this.plugins.push(plugin);
      }
    }

    console.log(`\x1b[34m\x1b[1m|X-MEGATRON| Plugins loaded (${this.plugins.length})\x1b[0m`);
  }

  listenMessages() {
    this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      const msg = messages[0];
      if (!msg?.message || msg.key.remoteJid === "status@broadcast") return;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      if (!text) return;

      const sender = jidNormalizedUser(
        msg.key.fromMe
          ? this.sock.user.id
          : msg.key.participant || msg.key.remoteJid
      ).split("@")[0];

      const isOwner = this.OWNER.includes(sender);
      const isSudo = this.SUDO.includes(sender);

      if (this.MODE === "PRIVATE" && !isOwner && !isSudo) return;

      if (this.PREFIX && !text.startsWith(this.PREFIX)) return;

      const body = this.PREFIX ? text.slice(this.PREFIX.length).trim() : text;
      const cmd = body.split(/\s+/)[0].toLowerCase();
      const args = body.split(/\s+/).slice(1);

      for (const p of this.plugins) {
        if (p.command === cmd) {
          if (p.owner && !isOwner) return;
          if (p.sudo && !isOwner && !isSudo) return;

          await p.run({
            sock: this.sock,
            msg,
            args,
            sender,
            uptime: Date.now() - this.startTime
          });
        }
      }
    });
  }
  }
