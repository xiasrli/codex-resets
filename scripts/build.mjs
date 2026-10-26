import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { validFeed } from "./feed.mjs";

const feed = JSON.parse(await readFile(new URL("../data/feed.json", import.meta.url), "utf8"));
if (!validFeed(feed)) throw new Error("Invalid feed: refusing to publish");
const dist = new URL("../dist/", import.meta.url);
await mkdir(new URL("data/", dist), { recursive: true });
await cp(new URL("../site/", import.meta.url), dist, { recursive: true });
await cp(new URL("../data/feed.json", import.meta.url), new URL("data/feed.json", dist));
await writeFile(new URL("CNAME", dist), "codex.xiasr.eu.cc\n");
await writeFile(new URL(".nojekyll", dist), "");
console.log(`Built dashboard with ${feed.events.length} collected announcements.`);
