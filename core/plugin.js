import fs from "fs";
import path from "path";

export async function loadPlugins() {
  const map = new Map();
  const files = fs.readdirSync("plugins").filter(f => f.endsWith(".js"));

  for (const file of files) {
    const mod = await import(path.resolve(`plugins/${file}`));
    const cmds = Array.isArray(mod.command) ? mod.command : [mod.command];

    for (const c of cmds) {
      map.set(c, mod.run);
    }
  }

  return map;
}
