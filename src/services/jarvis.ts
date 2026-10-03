"use client";

import { addEdgeToGraph, addNodeToGraph, refreshSizes } from "@/knowledge/graph";
import { runQuery, type QueryResult } from "@/knowledge/query";
import { graphCommands } from "@/lib/graph-commands";
import { getGraph, persistLocal } from "@/lib/graph-instance";
import { useJarvis } from "@/lib/store";
import { speak } from "@/voice/speak";
import type { KGEdge, KGNode } from "@/types/graph";

/**
 * JARVIS request pipeline (demo brain).
 *
 *   understand intent → search graph → (tool / create) → respond → speak
 *
 * Every step is written to the activity stream so actions stay transparent.
 * Phase 2 inserts Claude between "understand" and "respond" via /api/chat,
 * with the query engine exposed to it as tools.
 */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let busy = false;

/** Client-side router, registered by the app shell (keeps this module React-free). */
let navigate: (path: string) => void = () => {};
export function setNavigator(fn: (path: string) => void) {
  navigate = fn;
}

export async function askJarvis(input: string): Promise<QueryResult | null> {
  const text = input.trim();
  if (!text || busy) return null;
  busy = true;
  const s = useJarvis.getState();
  try {
    s.addMessage("user", text);
    s.log("user", `User: “${text}”`);
    s.setHud("thinking", "Understanding request");
    await wait(320);

    const graph = getGraph();
    const result = runQuery(graph, text, { selected: useJarvis.getState().selected });
    s.log("search", `Searched knowledge graph — intent: ${result.intent}`);
    if (result.nodes.length) s.log("result", `Found ${result.nodes.length} related node${result.nodes.length === 1 ? "" : "s"}`);

    if (result.create) {
      s.setHud("executing", `Saving ${result.create.category}`);
      await wait(280);
      const node = createNode(result.create.category, result.create.label, result.create.content, result.create.links);
      s.log("memory", `Created ${result.create.category} “${node.label}”${result.create.links.length ? ` linked to ${result.create.links.length} node(s)` : ""}`);
      result.nodes = [node.id, ...result.create.links];
      result.anchors = [node.id];
    }

    applyResult(result);
    if (result.intent === "needs-ai") s.log("system", "Requires Claude (Phase 2) — answered from local knowledge");

    s.addMessage("jarvis", result.answer);
    s.log("ai", `JARVIS responded (${useJarvis.getState().status.mode === "demo" ? "demo brain" : "Claude"})`);
    s.setHud("speaking", "Responding");
    if (useJarvis.getState().voiceReplies) await speak(result.answer);
    else await wait(Math.min(2400, 700 + result.answer.length * 12));
    return result;
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    s.log("error", `JARVIS error: ${msg}`);
    s.addMessage("jarvis", `Something went wrong: ${msg}`);
    s.setHud("error", msg);
    await wait(1800);
    return null;
  } finally {
    busy = false;
    if (useJarvis.getState().hud !== "listening") useJarvis.getState().setHud("idle");
  }
}

/** Reflect a query result in the graph (focus / path / open). */
export function applyResult(r: QueryResult) {
  const s = useJarvis.getState();
  if (r.open?.startsWith("page:")) {
    navigate(`/${r.open.slice(5)}`);
    return;
  }
  if (r.path && r.path.length > 1) {
    s.select(r.path[0]);
    s.setFocus({ kind: "path", nodes: r.path });
    graphCommands.focusNodes(r.path);
    return;
  }
  if (r.open) {
    s.select(r.open);
    s.openViewer(r.open);
    graphCommands.centerOn(r.open);
    return;
  }
  if (r.nodes.length) {
    // Un-hide categories the answer lives in, so results are never invisible.
    const graph = getGraph();
    const needed = new Set(r.nodes.map((id) => graph.getNodeAttribute(id, "category")));
    if (s.hidden.some((h) => needed.has(h))) s.setHidden(s.hidden.filter((h) => !needed.has(h)));
    if (r.anchors.length === 1) {
      s.select(r.anchors[0]);
    }
    s.setFocus({ kind: "query", nodes: r.nodes, anchors: r.anchors, label: r.answer });
    graphCommands.focusNodes(r.nodes);
  }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export function createNode(category: KGNode["category"], label: string, content: string, links: string[]): KGNode {
  const graph = getGraph();
  const now = new Date().toISOString();
  const node: KGNode = {
    id: `${category}-${slug(label)}-${Date.now().toString(36)}`,
    label,
    category,
    description: content,
    content,
    importance: category === "memory" ? 0.45 : 0.4,
    tags: [category, "created by jarvis"],
    source: "JARVIS (local)",
    updatedAt: now,
    metadata: category === "task" ? { status: "open" } : undefined,
  };
  addNodeToGraph(graph, node, links[0]);
  const relation = category === "task" ? "RELATED_TO" : "MENTIONS";
  const edges: KGEdge[] = links.map((target) => ({
    id: `${node.id}|${relation}|${target}`,
    source: node.id,
    target,
    relation,
    weight: 0.6,
  }));
  if (!links.length && graph.hasNode("izzatillo")) {
    edges.push({ id: `${node.id}|RELATED_TO|izzatillo`, source: node.id, target: "izzatillo", relation: "RELATED_TO", weight: 0.4 });
  }
  for (const e of edges) addEdgeToGraph(graph, e);
  refreshSizes(graph);
  if (!persistLocal(node, edges)) useJarvis.getState().log("error", "Could not persist locally (browser storage unavailable)");
  useJarvis.getState().bumpGraph();
  return node;
}
