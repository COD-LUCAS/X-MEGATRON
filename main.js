import "dotenv/config";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Manager } from "./core/manager.js";

const BLUE = "\x1b[34m\x1b[1m";
const RESET = "\x1b[0m";

function run(cmd) {
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}

function ensurePM2() {
  try {
    execSync("npx pm2 -v", { stdio: "ignore" });
  } catch {
    console.log(`${BLUE}|X-MEGATRON| Installing local PM2${RESET}`);
    run("npm install pm2");
  }
}

function ensureOwner() {
  if (!process.env.OWNER) {
    const envPath = path.resolve(".env");
    const owner = process.env.SESSION_ID
      ? process.env.SESSION_ID.split("~")[0]
      : "";

    fs.appendFileSync(envPath, `\nOWNER=${owner}\n`);
    process.env.OWNER = owner;
  }
}

async function start() {
  console.log(`${BLUE}|X-MEGATRON| Initializing${RESET}`);

  ensurePM2();
  ensureOwner();

  const manager = new Manager();
  await manager.start();
}

start();
