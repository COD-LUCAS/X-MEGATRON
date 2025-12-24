import "dotenv/config";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

import version from "./version.json" assert { type: "json" };
import { ensureDependencies } from "./core/deps.js";
import { validateSessions } from "./core/session.js";
import { loadPlugins } from "./core/plugin.js";
import { startManager } from "./core/manager.js";

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function log(tag, text) {
  console.log(`[${tag}] ${text}`);
}

async function step(tag, text, fn, delay = 600) {
  log(tag, text);
  const result = await fn();
  await wait(delay);
  return result;
}

function ensureEnvFiles() {
  if (!fs.existsSync(".env")) {
    fs.writeFileSync(".env", "");
  }

  if (!fs.existsSync("owner.json")) {
    fs.writeFileSync("owner.json", JSON.stringify({
      owner: process.env.OWNER || null
    }, null, 2));
  }
}

async function boot() {
  log("BOOT", `Starting application v${version.version}`);
  await wait(500);

  ensureEnvFiles();

  await step(
    "BOOT",
    "Checking dependencies",
    ensureDependencies
  );

  const sessions = await step(
    "SESSION",
    "Validating sessions",
    validateSessions,
    800
  );

  for (const s of sessions) {
    log("SESSION", `Session ${s.id} validated`);
    await wait(300);
  }

  const plugins = await step(
    "PLUGINS",
    "Scanning plugins",
    loadPlugins,
    700
  );

  log("PLUGINS", `Loaded ${plugins.size} plugins`);
  await wait(700);

  const number = await step(
    "SOCKET",
    "Connecting to WhatsApp",
    () => startManager(sessions, plugins),
    1200
  );

  log("SOCKET", `Connected as ${number}`);
}

boot().catch(err => {
  log("FATAL", err.message);
  process.exit(1);
});
