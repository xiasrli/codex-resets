import assert from "node:assert/strict";
import test from "node:test";
import { AUTHOR, AUTHOR_ID, classify, collect, mergePosts, normalizePost } from "../scripts/feed.mjs";
const now = new Date("2026-10-26T12:00:00Z");
const post = (id, text, extra = {}) => ({ type: "status", id, text, created_timestamp: 1792992082, author: { screen_name: AUTHOR, id: AUTHOR_ID }, ...extra });

test("ignore unrelated resets, negation and other authors", () => {
  for (const text of ["Please reset your password", "No reset today", "Changing reasoning no longer resets the cache", "New prompt presets for Codex", "People are asking me for resets on the street", "The day we reach perfection it will be resets from there onwards", "Over the next 28 days, ship an improvement or a reset"]) assert.equal(classify(text), null);
  assert.equal(normalizePost(post("2114588174249071102", "reset day", { author: { screen_name: "another", id: AUTHOR_ID } }), now.getTime()), null);
  assert.equal(classify("Day 21/ But today is a reset.").status, "announced");
  assert.equal(classify("Day 17/ Bet you thought we forgot, but no, it’s reset day today.").status, "announced");
});

test("a nested quoted completion updates one announcement, without double counting", () => {
  const root = post("2114200152701575656", "Day 20/ Rest and reset");
  const reply = post("2114200291319124163", "By midnight PST", { replying_to: { screen_name: AUTHOR, status: root.id } });
  const completion = post("2114237083652882932", "It is all propagated. Enjoy codexing.", { quote: reply });
  const feed = mergePosts(null, [root, completion, root], now);
  assert.equal(feed.events.length, 1);
  assert.equal(feed.events[0].status, "confirmed");
  assert.equal(feed.events[0].confirmationUrl, `https://x.com/${AUTHOR}/status/${completion.id}`);
});

test("source failure retains successful data and does not advance its success timestamp", async () => {
  const previous = mergePosts(null, [post("2114588174249071102", "Day 21/ today is a reset")], now);
  const next = await collect(previous, async () => { throw new Error("HTTP 503"); }, { now: new Date(now.getTime() + 900000) });
  assert.equal(next.status, "error");
  assert.deepEqual(next.events, previous.events);
  assert.equal(next.lastSuccessAt, previous.lastSuccessAt);
  assert.notEqual(next.checkedAt, previous.checkedAt);
});

test("invalid or empty responses are not interpreted as no resets", async () => {
  const result = await collect(null, async () => ({ code: 200, results: [] }), { now });
  assert.equal(result.status, "error");
  assert.equal(result.lastSuccessAt, null);
});
