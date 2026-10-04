import { writeFileSync } from "node:fs";
import { buildDemoGraph } from "../src/knowledge/demo-graph";
import { computeLayout, createGraph } from "../src/knowledge/graph";
import { CATEGORIES } from "../src/knowledge/categories";

const data = buildDemoGraph();
const g = createGraph(data);
const pos = computeLayout(g, "force");
const out = {
  categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, { label: v.label, plural: v.plural, color: v.color }])),
  nodes: data.nodes.map((n) => ({
    id: n.id, label: n.label, category: n.category, description: n.description, importance: n.importance,
    tags: n.tags, updatedAt: n.updatedAt.slice(0, 10), content: n.content, x: Math.round(pos[n.id].x * 10) / 10, y: Math.round(pos[n.id].y * 10) / 10,
  })),
  edges: data.edges.map((e) => [e.source, e.target, e.relation]),
};
writeFileSync(process.argv[2], JSON.stringify(out));
console.log(out.nodes.length, out.edges.length);
