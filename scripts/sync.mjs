import { readFile, writeFile, mkdir } from "node:fs/promises";
import { AUTHOR, collect, validFeed } from "./feed.mjs";

const file = new URL("../data/feed.json", import.meta.url);
let previous;
try {
  const seed = JSON.parse(await readFile(file, "utf8"));
  if (validFeed(seed)) previous = seed;
} catch { /* The first deployment may not have a seed yet. */ }

if (!process.argv.includes("--bootstrap")) {
  try {
    const response = await fetch("https://codex.xiasr.eu.cc/data/feed.json", { signal: AbortSignal.timeout(12000) });
    if (response.ok) {
      const deployed = await response.json();
      if (validFeed(deployed) && (!previous || Date.parse(deployed.lastSuccessAt ?? 0) > Date.parse(previous.lastSuccessAt ?? 0))) previous = deployed;
    }
  } catch { /* Keep the checked-in seed if the published cache is unavailable. */ }
}

const fetchPage = async (cursor) => {
  const url = new URL(`https://api.fxtwitter.com/2/profile/${AUTHOR}/statuses`);
  if (cursor) url.searchParams.set("cursor", cursor);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Timeline HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
};

const result = await collect(previous, fetchPage, { maxPages: process.argv.includes("--bootstrap") ? 12 : 2 });
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, events: result.events.length, lastSuccessAt: result.lastSuccessAt, coverageStartAt: result.coverageStartAt }));
if (result.status !== "ok") console.log("::warning::Tibo refresh failed; the site will retain its last successful snapshot.");
