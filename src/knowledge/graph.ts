import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import noverlap from "graphology-layout-noverlap";
import circlepack from "graphology-layout/circlepack";
import { CATEGORIES } from "@/knowledge/categories";
import type { KGData, KGEdge, KGNode, NodeCategory } from "@/types/graph";

/** Attributes stored on every graphology node (what sigma renders). */
export interface GraphNodeAttrs {
  label: string;
  category: NodeCategory;
  importance: number;
  color: string;
  size: number;
  x: number;
  y: number;
  node: KGNode;
}

export interface GraphEdgeAttrs {
  relation: KGEdge["relation"];
  weight: number;
  size: number;
  color: string;
  edge: KGEdge;
}

export type KnowledgeGraph = Graph<GraphNodeAttrs, GraphEdgeAttrs>;

// Premultiplied (sigma blends edges with premultiplied alpha).
export const EDGE_COLOR = "rgba(48, 90, 98, 0.42)";

export function nodeSize(importance: number, degree: number, order = 0): number {
  // Shrink nodes as the graph grows so large graphs stay readable.
  const scale = order > 2000 ? 0.4 : order > 600 ? 0.6 : 1;
  return (3 + importance * 10 + Math.min(Math.sqrt(degree) * 1.1, 7)) * scale;
}

export function createGraph(data: KGData): KnowledgeGraph {
  const graph: KnowledgeGraph = new Graph({ type: "directed", multi: true, allowSelfLoops: false });
  for (const n of data.nodes) addNodeToGraph(graph, n);
  for (const e of data.edges) addEdgeToGraph(graph, e);
  refreshSizes(graph);
  return graph;
}

export function addNodeToGraph(graph: KnowledgeGraph, n: KGNode, near?: string) {
  if (graph.hasNode(n.id)) return;
  let x = Math.random() * 100 - 50;
  let y = Math.random() * 100 - 50;
  if (near && graph.hasNode(near)) {
    const a = graph.getNodeAttributes(near);
    x = a.x + (Math.random() - 0.5) * 20;
    y = a.y + (Math.random() - 0.5) * 20;
  }
  graph.addNode(n.id, {
    label: n.label,
    category: n.category,
    importance: n.importance,
    color: CATEGORIES[n.category]?.color ?? "#8899aa",
    size: nodeSize(n.importance, 0),
    x,
    y,
    node: n,
  });
}

export function addEdgeToGraph(graph: KnowledgeGraph, e: KGEdge) {
  if (!graph.hasNode(e.source) || !graph.hasNode(e.target) || graph.hasEdge(e.id)) return;
  graph.addDirectedEdgeWithKey(e.id, e.source, e.target, {
    relation: e.relation,
    weight: e.weight,
    size: 0.8 + e.weight * 1.1,
    color: EDGE_COLOR,
    edge: e,
  });
}

export function refreshSizes(graph: KnowledgeGraph) {
  graph.forEachNode((id, a) => {
    graph.setNodeAttribute(id, "size", nodeSize(a.importance, graph.degree(id), graph.order));
  });
}

/** Undirected neighbours (relationships are traversable both ways). */
export function neighbors(graph: KnowledgeGraph, id: string): string[] {
  return graph.hasNode(id) ? graph.neighbors(id) : [];
}

export function neighborhood(graph: KnowledgeGraph, ids: string[], depth: number): Set<string> {
  const seen = new Set(ids.filter((id) => graph.hasNode(id)));
  let frontier = [...seen];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of graph.neighbors(id)) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

/**
 * Most relevant path between two nodes: breadth-first (fewest hops), ignoring
 * edge direction. Among equally short paths it prefers routes through more
 * specific nodes, so "Izzatillo" isn't used as a shortcut for everything.
 */
export function findPath(graph: KnowledgeGraph, from: string, to: string, avoidHub = true): string[] | null {
  if (!graph.hasNode(from) || !graph.hasNode(to)) return null;
  if (from === to) return [from];
  const hub = "izzatillo";
  const run = (skipHub: boolean) => {
    const prev = new Map<string, string | null>([[from, null]]);
    let frontier = [from];
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) {
        // Sort neighbours so lower-degree (more specific) nodes are explored first.
        const ns = graph.neighbors(id).sort((a, b) => graph.degree(a) - graph.degree(b));
        for (const n of ns) {
          if (prev.has(n)) continue;
          if (skipHub && n === hub && n !== to) continue;
          prev.set(n, id);
          if (n === to) {
            const path = [to];
            let cur: string | null | undefined = id;
            while (cur) {
              path.unshift(cur);
              cur = prev.get(cur);
            }
            return path;
          }
          next.push(n);
        }
      }
      frontier = next;
    }
    return null;
  };
  if (avoidHub && from !== hub && to !== hub) {
    const p = run(true);
    if (p) return p;
  }
  return run(false);
}

/** The edge between two adjacent nodes, in either direction. */
export function edgeBetween(graph: KnowledgeGraph, a: string, b: string): string | undefined {
  return graph.edges(a, b)[0] ?? graph.edges(b, a)[0];
}

export function pathEdges(graph: KnowledgeGraph, path: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const e = edgeBetween(graph, path[i], path[i + 1]);
    if (e) out.push(e);
  }
  return out;
}

export function describePath(graph: KnowledgeGraph, path: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const e = edgeBetween(graph, a, b);
    if (!e) continue;
    const rel = graph.getEdgeAttribute(e, "relation").replace(/_/g, " ").toLowerCase();
    const src = graph.source(e);
    const la = graph.getNodeAttribute(a, "label");
    const lb = graph.getNodeAttribute(b, "label");
    parts.push(src === a ? `${la} ${rel} ${lb}` : `${lb} ${rel} ${la}`);
  }
  return parts.join(" → ");
}

export interface Hub {
  id: string;
  label: string;
  category: NodeCategory;
  degree: number;
}

export function topHubs(graph: KnowledgeGraph, limit = 8, exclude: string[] = ["izzatillo"]): Hub[] {
  const hubs: Hub[] = [];
  graph.forEachNode((id, a) => {
    if (exclude.includes(id)) return;
    hubs.push({ id, label: a.label, category: a.category, degree: graph.degree(id) });
  });
  return hubs.sort((x, y) => y.degree - x.degree).slice(0, limit);
}

export function categoryCounts(graph: KnowledgeGraph): Record<NodeCategory, number> {
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, 0])) as Record<NodeCategory, number>;
  graph.forEachNode((_, a) => {
    counts[a.category] = (counts[a.category] ?? 0) + 1;
  });
  return counts;
}

// ── Layouts ───────────────────────────────────────────────────────────

/** Deterministic PRNG so the same graph always gets the same layout. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type LayoutName = "force" | "clusters" | "radial";

type Positions = Record<string, { x: number; y: number }>;

/** Seed nodes in category sectors so the force layout forms readable clusters. */
function seedByCategory(graph: KnowledgeGraph) {
  const rand = mulberry32(42);
  const cats = Object.keys(CATEGORIES);
  graph.forEachNode((id, a) => {
    const ci = cats.indexOf(a.category);
    const angle = (ci / cats.length) * Math.PI * 2;
    const r = 60 + rand() * 40;
    graph.mergeNodeAttributes(id, {
      x: Math.cos(angle) * r + (rand() - 0.5) * 30,
      y: Math.sin(angle) * r + (rand() - 0.5) * 30,
    });
  });
}

export function computeLayout(graph: KnowledgeGraph, name: LayoutName, center?: string | null): Positions {
  const order = graph.order;
  if (name === "clusters") {
    const copy = graph.copy();
    return circlepack(copy, { hierarchyAttributes: ["category"], scale: 1, rng: mulberry32(7) });
  }
  if (name === "radial") {
    const root = center && graph.hasNode(center) ? center : graph.hasNode("izzatillo") ? "izzatillo" : graph.nodes()[0];
    const depth = new Map<string, number>([[root, 0]]);
    let frontier = [root];
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const n of graph.neighbors(id)) {
          if (!depth.has(n)) {
            depth.set(n, depth.get(id)! + 1);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    const rings = new Map<number, string[]>();
    graph.forEachNode((id) => {
      const d = depth.get(id) ?? (Math.max(0, ...depth.values()) + 1);
      if (!rings.has(d)) rings.set(d, []);
      rings.get(d)!.push(id);
    });
    const out: Positions = {};
    for (const [d, ids] of rings) {
      ids.sort((a, b) => graph.getNodeAttribute(a, "category").localeCompare(graph.getNodeAttribute(b, "category")));
      ids.forEach((id, i) => {
        const angle = (i / ids.length) * Math.PI * 2 + d * 0.4;
        const r = d * 120;
        out[id] = { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
      });
    }
    return out;
  }
  // Force-directed (ForceAtlas2) on a copy so the current view can animate to it.
  const copy = graph.copy();
  seedByCategory(copy as KnowledgeGraph);
  const settings = forceAtlas2.inferSettings(copy);
  const forced = forceAtlas2(copy, {
    iterations: order > 2000 ? 80 : order > 500 ? 200 : 400,
    getEdgeWeight: "weight",
    settings: {
      ...settings,
      gravity: 0.8,
      scalingRatio: 12,
      slowDown: 2,
      linLogMode: false,
      adjustSizes: false,
      barnesHutOptimize: order > 300,
    },
  });
  if (order > 1500) return forced;
  // Spread nodes so each has room for its circle and label, like a focused view.
  for (const [id, p] of Object.entries(forced)) copy.mergeNodeAttributes(id, p);
  const box = Object.values(forced);
  const extent = Math.max(
    Math.max(...box.map((p) => p.x)) - Math.min(...box.map((p) => p.x)),
    Math.max(...box.map((p) => p.y)) - Math.min(...box.map((p) => p.y)),
  );
  return noverlap(copy, {
    maxIterations: 300,
    inputReducer: (id, a) => ({ x: a.x, y: a.y, size: extent * (0.035 + 0.075 * graph.getNodeAttribute(id, "importance") ** 2) }),
    settings: { margin: extent * 0.02, ratio: 1, speed: 3 },
  });
}
