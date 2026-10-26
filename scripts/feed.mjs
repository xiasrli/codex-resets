export const AUTHOR = "thsottiaux";
export const AUTHOR_ID = "1953337039510003712";
const MAX_EVENTS = 500;

export function normalizePost(raw, now = Date.now()) {
  if (!raw || raw.type !== "status" || raw.author?.screen_name?.toLowerCase() !== AUTHOR ||
      raw.author?.id !== AUTHOR_ID || raw.reposted_by || !/^\d{15,25}$/.test(raw.id) ||
      typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > 12000 ||
      !Number.isFinite(raw.created_timestamp)) return null;
  const time = raw.created_timestamp * 1000;
  if (time < Date.UTC(2025, 7, 1) || time > now + 300000) return null;
  return {
    id: raw.id, text: raw.text.trim(), publishedAt: new Date(time).toISOString(),
    url: `https://x.com/${AUTHOR}/status/${raw.id}`,
    parentId: raw.replying_to?.screen_name?.toLowerCase() === AUTHOR ? raw.replying_to.status : null,
    quoteId: raw.quote?.author?.screen_name?.toLowerCase() === AUTHOR ? raw.quote.id : null,
  };
}

export function classify(text) {
  if (!/\breset(?:s|ting)?\b/i.test(text)) return null;
  if (/asking me for resets|the day we reach perfection|over the next 28 days|didn.t get the reset|not fully applying/i.test(text)) return null;
  if (/\b(?:no|not|never|won't|isn't|aren't|didn't|don't|doesn't)\b[^.!?\n]{0,35}\breset/i.test(text) ||
      /\breset(?:ting)?\s+(?:my\s+|your\s+|the\s+)?(?:password|router|cache|context|session|computer|settings)\b/i.test(text)) return null;
  if (!/\bcodex\b|\b(?:quota|limits?|reserve|weekly|day\s*\d+)\b/i.test(text) && text.length > 120) return null;
  const status = /\b(?:have|has|just)\s+(?:now\s+|been\s+)?reset\b|\ball\s+propagated\b|\ball reset for everyone\b|\bit.s done\b|\b(?:limits?|quotas?)\s+(?:are|were)\s+(?:now\s+)?reset\b|\breset\s+(?:is\s+)?(?:complete|completed|done)\b/i.test(text)
    ? "confirmed" : "announced";
  return { status, kind: /\breserve\b|\bbackup\b|\bbanked\b|备用/i.test(text) ? "reserve" : "regular" };
}

export function validFeed(value) {
  return value?.schemaVersion === 1 && value.author === AUTHOR && Array.isArray(value.events) &&
    value.events.length <= MAX_EVENTS && value.events.every((event) =>
      /^\d{15,25}$/.test(event.id) && typeof event.text === "string" && event.text.length <= 12000 &&
      Number.isFinite(Date.parse(event.publishedAt)) && event.url === `https://x.com/${AUTHOR}/status/${event.id}` &&
      ["announced", "confirmed"].includes(event.status) && ["regular", "reserve"].includes(event.kind));
}

export function mergePosts(previous, rawPosts, now = new Date()) {
  const index = new Map();
  function add(raw, depth = 0) {
    const post = normalizePost(raw, now.getTime());
    if (post) index.set(post.id, post);
    if (depth < 4 && raw?.quote) add(raw.quote, depth + 1);
  }
  rawPosts.forEach((raw) => add(raw));
  if (!index.size) throw new Error("No valid Tibo posts in response");
  const events = new Map((previous?.events ?? []).filter((event) => classify(event.text)).map((event) => [event.id, { ...event, ...classify(event.text), ...(event.status === "confirmed" ? { status: "confirmed" } : {}) }]));
  for (const post of index.values()) {
    const category = classify(post.text);
    if (!category) continue;
    const prior = events.get(post.id);
    events.set(post.id, { ...post, ...prior, ...category, ...(prior?.status === "confirmed" ? { status: "confirmed" } : {}), text: post.text });
  }
  function findEvent(id, visited = new Set()) {
    if (!id || visited.has(id) || visited.size > 8) return null;
    visited.add(id);
    if (events.has(id)) return events.get(id);
    const post = index.get(id);
    return post ? findEvent(post.parentId, visited) ?? findEvent(post.quoteId, visited) : null;
  }
  for (const post of index.values()) {
    if (!/\ball\s+propagated\b|\bfully\s+(?:rolled\s+out|propagated)\b|\b(?:reset|resets?)\s+(?:is\s+)?(?:complete|completed|done)\b/i.test(post.text)) continue;
    const root = findEvent(post.parentId) ?? findEvent(post.quoteId);
    if (root && root.id !== post.id) {
      root.status = "confirmed";
      if (!root.confirmedAt || root.confirmedAt < post.publishedAt) {
        root.confirmedAt = post.publishedAt;
        root.confirmationUrl = post.url;
        root.confirmationText = post.text;
      }
      events.delete(post.id);
    }
  }
  const posts = [...index.values()];
  const dates = posts.map((post) => post.publishedAt).sort();
  const challengePost = posts.filter((post) => /\bday\s*(\d{1,2})\s*[/：:]/i.test(post.text))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  const day = challengePost ? Number(challengePost.text.match(/\bday\s*(\d{1,2})/i)[1]) : 0;
  const challenge = day >= 1 && day <= 28 ? { day, url: challengePost.url, publishedAt: challengePost.publishedAt } : previous?.challenge ?? null;
  return {
    schemaVersion: 1, author: AUTHOR, status: "ok", checkedAt: now.toISOString(),
    lastSuccessAt: now.toISOString(), latestSourcePostAt: [previous?.latestSourcePostAt, dates.at(-1)].filter(Boolean).sort().at(-1),
    coverageStartAt: [previous?.coverageStartAt, dates[0]].filter(Boolean).sort()[0],
    challenge, events: [...events.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_EVENTS),
  };
}

export async function collect(previous, fetchPage, { now = new Date(), maxPages = 2 } = {}) {
  try {
    const posts = [];
    const cursors = new Set();
    let cursor;
    for (let page = 0; page < maxPages; page++) {
      const body = await fetchPage(cursor);
      if (body.code !== 200 || !Array.isArray(body.results) || !body.results.length) throw new Error("Invalid timeline response");
      posts.push(...body.results);
      const next = body.cursor?.bottom;
      if (!next || cursors.has(next)) break;
      cursors.add(next);
      cursor = next;
    }
    return mergePosts(previous, posts, now);
  } catch (error) {
    console.warn(`Source refresh failed: ${error.message}`);
    return {
      ...(previous ?? { schemaVersion: 1, author: AUTHOR, events: [], lastSuccessAt: null, coverageStartAt: null, challenge: null }),
      status: "error", checkedAt: now.toISOString(),
    };
  }
}
