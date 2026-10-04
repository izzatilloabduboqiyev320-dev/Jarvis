import "./setup";
import { restart } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeExternalUrl, openExternalUrl, redactUrl, resourceUrl, safeExternalUrl, sourceName } from "@/lib/external-link";
import { buildDemoGraph } from "@/knowledge/demo-graph";
import { addItem, getGraphData, setItemUrl } from "@/server/store";
import { GET as getGraph } from "@/app/api/graph/route";
import { POST as postItem } from "@/app/api/items/route";
import { PATCH as patchItem } from "@/app/api/items/[id]/route";
import type { KGData } from "@/types/graph";

/** External resource links: only safe http(s) links open, and links survive save → load → API. */

const local = (url: string, init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { host: "localhost:3000", "content-type": "application/json", ...(init.headers ?? {}) } });

test("https and http links are safe and kept exactly as given", () => {
  assert.equal(safeExternalUrl("https://docs.anthropic.com/en/docs"), "https://docs.anthropic.com/en/docs");
  assert.equal(safeExternalUrl("  http://example.com/a?b=1  "), "http://example.com/a?b=1");
  assert.ok(isSafeExternalUrl("https://example.org"));
});

test("YouTube links keep their video id, playlist and timestamp", () => {
  const watch = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42s";
  const short = "https://youtu.be/dQw4w9WgXcQ?t=10";
  assert.equal(safeExternalUrl(watch), watch);
  assert.equal(safeExternalUrl(short), short);
  assert.equal(sourceName(watch), "YouTube");
  assert.equal(sourceName(short), "YouTube");
  assert.equal(sourceName("https://docs.anthropic.com/x"), "docs.anthropic.com");
});

test("unsafe or broken links are rejected", () => {
  for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>x</b>", "file:///etc/passwd", "ftp://x.org", "https://user:pw@example.com", "youtube.com/watch?v=x", "", "   ", null, undefined, 42]) {
    assert.equal(safeExternalUrl(bad), null, String(bad));
  }
  assert.equal(resourceUrl({ url: "javascript:alert(1)" }), null);
});

test("logs never include query strings (they may carry tokens)", () => {
  assert.equal(redactUrl("https://example.com/v?token=SECRET#x"), "example.com/v");
});

test("opening a resource uses a new tab with noopener,noreferrer", () => {
  const calls: unknown[][] = [];
  const r = openExternalUrl("https://youtu.be/abc", (...a) => calls.push(a));
  assert.deepEqual(r, { ok: true, url: "https://youtu.be/abc" });
  assert.deepEqual(calls, [["https://youtu.be/abc", "_blank", "noopener,noreferrer"]]);
});

test("missing, unsafe and failing opens are reported, never thrown or opened", () => {
  const calls: unknown[] = [];
  const spy = (u: string) => calls.push(u);
  assert.equal(openExternalUrl(undefined, spy).ok, false);
  const missing = openExternalUrl("", spy);
  assert.ok(!missing.ok && missing.reason === "missing" && missing.message === "External link unavailable");
  const unsafe = openExternalUrl("javascript:alert(1)", spy);
  assert.ok(!unsafe.ok && unsafe.reason === "unsafe");
  assert.equal(calls.length, 0, "nothing was opened");
  const failed = openExternalUrl("https://example.com", () => {
    throw new Error("blocked");
  });
  assert.ok(!failed.ok && failed.message === "Could not open this resource.");
});

test("the 2022 Mentorship video has no stored link, so none is invented; web sources have theirs", () => {
  const demo = buildDemoGraph();
  const video = demo.nodes.find((n) => n.id === "v-ict-mentorship");
  assert.equal(video?.url, undefined);
  const docs = demo.nodes.find((n) => n.id === "w-anthropic-docs");
  assert.equal(docs?.url, "https://docs.anthropic.com");
  for (const n of demo.nodes) if (n.url) assert.ok(isSafeExternalUrl(n.url), n.id);
});

test("a link saved on any item persists through save, restart, load and the graph API", async () => {
  const yt = "https://www.youtube.com/watch?v=TESTVIDEO01&list=PLtest";
  const node = await setItemUrl("v-ict-mentorship", yt);
  assert.equal(node?.url, yt);
  restart();
  const data = await getGraphData();
  assert.equal(data.nodes.find((n) => n.id === "v-ict-mentorship")?.url, yt);

  const api = (await (await getGraph(local("http://localhost:3000/api/graph"))).json()) as KGData;
  assert.equal(api.nodes.find((n) => n.id === "v-ict-mentorship")?.url, yt, "the API does not strip the link");

  await setItemUrl("v-ict-mentorship", null);
  restart();
  assert.equal((await getGraphData()).nodes.find((n) => n.id === "v-ict-mentorship")?.url, undefined);
  await assert.rejects(setItemUrl("v-ict-mentorship", "javascript:alert(1)"));
  assert.equal(await setItemUrl("no-such-item", "https://example.com"), null);
});

test("items created with a link (ingestion) keep the original URL", async () => {
  const { node } = await addItem({ category: "note", label: "MCP intro video", content: "Watch later", links: [], url: "https://youtu.be/abc123?t=5" });
  restart();
  assert.equal((await getGraphData()).nodes.find((n) => n.id === node.id)?.url, "https://youtu.be/abc123?t=5");
  const unsafe = await addItem({ category: "note", label: "x", content: "y", links: [], url: "javascript:alert(1)" });
  assert.equal(unsafe.node.url, undefined);
});

test("item API saves links and rejects unsafe ones", async () => {
  const bad = await patchItem(local("http://localhost:3000/api/items/w-mcp-spec", { method: "PATCH", body: JSON.stringify({ url: "data:text/html,x" }) }), { params: Promise.resolve({ id: "w-mcp-spec" }) });
  assert.equal(bad.status, 400);
  const ok = await patchItem(local("http://localhost:3000/api/items/w-mcp-spec", { method: "PATCH", body: JSON.stringify({ url: "https://modelcontextprotocol.io/specification" }) }), { params: Promise.resolve({ id: "w-mcp-spec" }) });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { node: { url: string } }).node.url, "https://modelcontextprotocol.io/specification");

  const created = await postItem(local("http://localhost:3000/api/items", { method: "POST", body: JSON.stringify({ category: "note", label: "Course", content: "x", url: "https://example.com/course" }) }));
  assert.equal(((await created.json()) as { node: { url: string } }).node.url, "https://example.com/course");
  const rejected = await postItem(local("http://localhost:3000/api/items", { method: "POST", body: JSON.stringify({ category: "note", label: "Bad", content: "x", url: "file:///etc/passwd" }) }));
  assert.equal(rejected.status, 400);
});
