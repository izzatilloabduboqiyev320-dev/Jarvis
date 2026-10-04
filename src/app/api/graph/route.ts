import { addStressNodes } from "@/knowledge/demo-graph";
import { getGraphData } from "@/server/store";

/**
 * GET /api/graph — the knowledge graph: demo knowledge plus everything saved
 * on this computer (~/.jarvis). `?stress=N` appends N synthetic nodes (max 10,000).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const stress = Math.min(10_000, Math.max(0, Number(url.searchParams.get("stress")) || 0));
  let data = await getGraphData();
  if (stress) data = addStressNodes(data, stress);
  return Response.json({ ...data, source: stress ? `demo + ${stress} synthetic` : "demo + saved" });
}
