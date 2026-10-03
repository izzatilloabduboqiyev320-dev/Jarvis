"use client";

import { addEdgeToGraph, addNodeToGraph, createGraph, refreshSizes, type KnowledgeGraph } from "@/knowledge/graph";
import type { KGData, KGEdge, KGNode } from "@/types/graph";

/**
 * The single in-browser graphology instance. It lives outside React state so
 * that hover/drag/animation never trigger React re-renders; components that
 * need to react to structural changes subscribe to `graphVersion` in the store.
 */
let graph: KnowledgeGraph | null = null;

export function getGraph(): KnowledgeGraph {
  if (!graph) graph = createGraph({ nodes: [], edges: [] });
  return graph;
}

export function loadGraph(data: KGData): KnowledgeGraph {
  graph = createGraph(data);
  for (const n of loadLocal().nodes) addNodeToGraph(graph, n);
  for (const e of loadLocal().edges) addEdgeToGraph(graph, e);
  refreshSizes(graph);
  return graph;
}

// ── Locally created items (until SQLite arrives in Phase 3) ─────────────

const LOCAL_KEY = "jarvis.local-graph.v1";

function loadLocal(): KGData {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw) as KGData;
  } catch {
    /* storage unavailable — fall through */
  }
  return { nodes: [], edges: [] };
}

export function persistLocal(node: KGNode, edges: KGEdge[]) {
  try {
    const data = loadLocal();
    data.nodes.push(node);
    data.edges.push(...edges);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}
