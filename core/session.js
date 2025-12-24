import fs from "fs";
import fetch from "node-fetch";

const BASE = "sessions";

function dir(id) {
  return `${BASE}/${id.replace("~", "_")}`;
}

export async function validateSessions() {
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE);

  const ids = process.env.SESSION_ID.split(",").map(v => v.trim());
  const result = [];

  for (const id of ids) {
    if (!id.startsWith("xmegatron~")) throw new Error("Invalid session format");

    const key = id.split("~")[1];
    const url = `https://pastebin.com/raw/${key}`;
    const data = await fetch(url).then(r => r.text());

    const folder = dir(id);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    fs.writeFileSync(`${folder}/creds.json`, data);
    result.push({ id, folder });
  }

  return result;
}
