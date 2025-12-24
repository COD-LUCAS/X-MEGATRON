import { execSync } from "child_process";
import fs from "fs";

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

export async function ensureDependencies() {
  if (!fs.existsSync("./ffmpeg")) {
    run("curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz");
    run("tar -xf ffmpeg.tar.xz");
    const dir = fs.readdirSync(".").find(d => d.startsWith("ffmpeg-"));
    run(`mv ${dir}/ffmpeg ./ffmpeg`);
    run("chmod +x ./ffmpeg");
    run(`rm -rf ${dir} ffmpeg.tar.xz`);
  }

  try {
    run("yarn -v");
  } catch {
    run("corepack enable");
    run("corepack prepare yarn@1.22.22 --activate --yes");
  }

  try {
    run("npx pm2 -v");
  } catch {
    run("npm install pm2");
  }
}
