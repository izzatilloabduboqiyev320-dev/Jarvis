import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoGraph } from "@/knowledge/demo-graph";
import { createGraph } from "@/knowledge/graph";
import { keywords, resolveItem, searchGraph } from "@/knowledge/graph-search";
import { retrieveContext } from "@/ai/context";
import { addItem } from "@/server/store";

const graph = createGraph(buildDemoGraph());
const label = (id: string) => graph.getNodeAttribute(id, "label");

test("keywords drop question words in English and Uzbek", () => {
  assert.deepEqual(keywords("What did I say about my trading bot?"), ["trading", "bot"]);
  assert.deepEqual(keywords("Menga ICT haqida nima bilasan"), ["ict", "bilasan"]);
});

test("graph search finds items by name, also with Uzbek endings", () => {
  const top = searchGraph(graph, "YouTube", { limit: 3 }).map((h) => label(h.id));
  assert.ok(top.some((l) => /youtube/i.test(l)), top.join(", "));
  const uz = searchGraph(graph, "YouTubedagi loyihalarim", { limit: 5 }).map((h) => label(h.id));
  assert.ok(uz.some((l) => /youtube/i.test(l)), uz.join(", "));
});

test("graph search respects the type filter", () => {
  for (const h of searchGraph(graph, "trading", { type: "project" })) assert.equal(graph.getNodeAttribute(h.id, "category"), "project");
});

test("resolveItem finds by id or exact name", () => {
  const id = graph.nodes()[0];
  assert.equal(resolveItem(graph, id), id);
  assert.equal(resolveItem(graph, label(id)), id);
});

test("retrieval returns only relevant memories and items, not the whole graph", async () => {
  const { node } = await addItem({ category: "memory", label: "Bot rule", content: "My Telegram trading bot must never execute trades automatically", links: [] });
  const ctx = await retrieveContext("What did I say about my trading bot?");
  assert.ok(ctx.memories.some((m) => m.id === node.id), "the saved memory is retrieved");
  assert.ok(ctx.memories[0].content?.includes("never execute trades"));
  assert.ok(ctx.nodes.length <= 12 && ctx.memories.length <= 6);
  assert.equal(ctx.overview, false);
});

test("retrieval falls back to an overview when nothing matches", async () => {
  const ctx = await retrieveContext("qwertyuiop zxcvbnm");
  assert.equal(ctx.overview, true);
  assert.equal(ctx.memories.length, 0);
  assert.ok(ctx.nodes.length > 0 && ctx.nodes.length <= 8);
});
