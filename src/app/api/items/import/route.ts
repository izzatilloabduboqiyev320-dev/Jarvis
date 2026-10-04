import { isLocalRequest } from "@/ai/key-store";
import { importItems } from "@/server/store";
import type { KGEdge, KGNode } from "@/types/graph";

/** POST /api/items/import {nodes, edges} — moves items saved in the browser (Phase 1) into permanent storage. */
export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ message: "Local use only" }, { status: 403 });
  try {
    const b = (await request.json()) as { nodes?: KGNode[]; edges?: KGEdge[] };
    const n = await importItems(Array.isArray(b.nodes) ? b.nodes.slice(0, 2000) : [], Array.isArray(b.edges) ? b.edges.slice(0, 10000) : []);
    return Response.json({ imported: n });
  } catch {
    return Response.json({ message: "Invalid import" }, { status: 400 });
  }
}
