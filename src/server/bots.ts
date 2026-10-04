import "server-only";
import { botGraph, type PublicBot } from "@/server/telegram";
import { getGraphData } from "@/server/store";

/** Bots plus their graph items, so the screen can update without a reload. */
export async function withGraph(bots: PublicBot[]) {
  const data = await getGraphData();
  const ids = new Set(data.nodes.map((n) => n.id));
  return { ok: true, bots, ...botGraph(bots, (id) => ids.has(id)) };
}
