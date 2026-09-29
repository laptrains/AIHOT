// 全部动态 ordering: time (newest first) or AI score within each Beijing day, unscored last; search in
// score order matches the same rows as the default search; a page past the end serves the last page.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { loadPool } from "@aihot/backend/publication/pool";

const t = `poolsort-${tag()}`;
const label = t.toLowerCase();
const now = new Date("2099-03-03T00:00:00Z");
// Beijing days: 2099-03-01T20:00Z is already 03-02 04:00 in Beijing.
const rows = [
  { id: "a", at: "2099-03-02T02:00:00Z", score: 19 },
  { id: "b", at: "2099-03-02T03:00:00Z", score: 85 },
  { id: "c", at: "2099-03-02T01:00:00Z", score: 60 },
  { id: "d", at: "2099-03-02T05:00:00Z", score: 60 },
  { id: "e", at: "2099-03-02T06:00:00Z", score: null },
  { id: "f", at: "2099-03-01T20:00:00Z", score: null },
  { id: "g", at: "2099-03-01T10:00:00Z", score: 95 },
  { id: "h", at: "2099-03-01T12:00:00Z", score: 40 },
] as const;
const articleId = (id: string) => `${t}-${id}`;
const ids = (items: Array<{ id: string }>) => items.map((it) => it.id.slice(t.length + 1));
const base = { channel: "all", category: null, tag: t, topic: null, topicTags: null, now } as const;

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, next_fetch_at) VALUES (${t}, ${t}, 'rss', '2100-01-01')`;
  for (const r of rows) {
    const id = articleId(r.id);
    const title = `${t} ${r.id}`;
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
      VALUES (${id}, ${t}, ${id}, ${`https://example.org/${id}`}, ${title}, ${r.at}, ${r.at})`;
    await sql`INSERT INTO publications (article_id, eligible, title, summary, tags, score, source_id, channel, url, discovered_at, timeline_at, sort_at, search_text)
      VALUES (${id}, true, ${title}, 'summary', ${[t]}, ${r.score}, ${t}, 'news', ${`https://example.org/${id}`}, ${r.at}, ${r.at}, ${r.at}, ${title.toLowerCase()})`;
    await sql`INSERT INTO pool_search (article_id, direct) VALUES (${id}, ${title.toLowerCase()})`;
  }
});

after(async () => {
  await sql`DELETE FROM articles WHERE source_id = ${t}`;
  await sql`DELETE FROM sources WHERE id = ${t}`;
  await closeDb();
});

test("time order is unchanged: newest first", async () => {
  const data = await loadPool({ ...base });
  assert.equal(data.filters.sort, "time");
  assert.deepEqual(ids(data.items), ["e", "d", "b", "a", "c", "f", "h", "g"]);
});

test("score order: Beijing day first, then score high to low, ties by time, unscored last", async () => {
  const data = await loadPool({ ...base, sort: "score" });
  assert.equal(data.filters.sort, "score");
  // 03-02: 85, 60 (05:00), 60 (01:00), 19, then unscored 06:00 and 03-02 04:00 Beijing; 03-01: 95, 40.
  assert.deepEqual(ids(data.items), ["b", "d", "c", "a", "e", "f", "g", "h"]);
  assert.equal(data.total, rows.length);
});

test("an unknown sort value means time order", async () => {
  const data = await loadPool({ ...base, sort: "foo" as never });
  assert.equal(data.filters.sort, "time");
  assert.deepEqual(ids(data.items), ["e", "d", "b", "a", "c", "f", "h", "g"]);
});

test("search by score matches the same rows as the default search", async () => {
  const latest = await loadPool({ ...base, q: label, tab: "time" });
  const scored = await loadPool({ ...base, q: label, tab: "time", sort: "score" });
  assert.equal(scored.filters.sort, "score");
  assert.equal(scored.total, latest.total);
  assert.deepEqual(new Set(ids(scored.items)), new Set(ids(latest.items)));
  assert.deepEqual(ids(scored.items), ["b", "d", "c", "a", "e", "f", "g", "h"]);
});

test("relevance search ignores sort", async () => {
  const data = await loadPool({ ...base, q: label, tab: "relevance", sort: "score" });
  assert.equal(data.filters.tab, "relevance");
  assert.equal(data.filters.sort, "time");
});

test("a page past the end serves the last page", async () => {
  const data = await loadPool({ ...base, sort: "score", page: 7 });
  assert.equal(data.page, 1);
  assert.equal(data.pageCount, 1);
  assert.equal(data.items.length, rows.length);
});

test("no results keep the requested page and an empty list", async () => {
  const data = await loadPool({ ...base, tag: `${t}-none`, page: 3 });
  assert.equal(data.total, 0);
  assert.equal(data.page, 3);
  assert.equal(data.items.length, 0);
});
