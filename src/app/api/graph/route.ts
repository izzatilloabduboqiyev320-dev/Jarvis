import { addStressNodes, buildDemoGraph } from "@/knowledge/demo-graph";

/**
 * GET /api/graph — the knowledge graph.
 * Phase 1 serves the demo dataset. Phase 3 reads nodes/edges from SQLite,
 * seeding it with this same demo data on first run.
 * `?stress=N` appends N synthetic nodes (max 10,000) for performance testing.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const stress = Math.min(10_000, Math.max(0, Number(url.searchParams.get("stress")) || 0));
  let data = buildDemoGraph();
  if (stress) data = addStressNodes(data, stress);
  return Response.json({ ...data, source: stress ? `demo + ${stress} synthetic` : "demo" });
}
