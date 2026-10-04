import "server-only";
import { createGraph, topHubs, type KnowledgeGraph } from "@/knowledge/graph";
import { searchGraph } from "@/knowledge/graph-search";
import { findMentions } from "@/knowledge/query";
import { getGraphData } from "@/server/store";
import type { ContextNode } from "@/ai/types";

/**
 * Before JARVIS answers, the server looks up only what is relevant to the
 * message: saved memories and the related part of the knowledge graph.
 * Never the whole database.
 */

const MAX_MEMORIES = 6;
const MAX_NODES = 12;

export interface RetrievedContext {
  memories: ContextNode[];
  nodes: ContextNode[];
  /** True when nothing matched and `nodes` is the graph's overview (top hubs). */
  overview: boolean;
}

function toContext(graph: KnowledgeGraph, id: string, withContent: boolean): ContextNode {
  const a = graph.getNodeAttributes(id);
  return {
    id,
    label: a.label,
    category: a.category,
    description: a.node.description?.slice(0, 300) || undefined,
    updated: a.node.updatedAt?.slice(0, 10),
    links: graph
      .edges(id)
      .slice(0, 8)
      .map((e) => `${graph.getEdgeAttribute(e, "relation")} ${graph.getNodeAttribute(graph.opposite(id, e), "label")}`),
    ...(withContent && a.node.content ? { content: a.node.content.slice(0, 600) } : {}),
  };
}

export async function retrieveContext(message: string, graph?: KnowledgeGraph): Promise<RetrievedContext> {
  const g = graph ?? createGraph(await getGraphData());
  const mentioned = findMentions(g, message);
  const hits = searchGraph(g, message, { limit: 30 }).map((h) => h.id);

  // Memories: those matching the words, then those attached to items the message names.
  const memoryIds = new Set<string>();
  for (const id of hits) if (g.getNodeAttribute(id, "category") === "memory") memoryIds.add(id);
  for (const id of mentioned)
    for (const n of g.neighbors(id)) if (g.getNodeAttribute(n, "category") === "memory") memoryIds.add(n);

  const nodeIds = new Set<string>();
  for (const id of [...mentioned, ...hits]) if (!memoryIds.has(id)) nodeIds.add(id);

  const memories = [...memoryIds].slice(0, MAX_MEMORIES).map((id) => toContext(g, id, true));
  let nodes = [...nodeIds].slice(0, MAX_NODES).map((id) => toContext(g, id, false));
  const overview = !memories.length && !nodes.length;
  if (overview) nodes = topHubs(g, 8).map((h) => toContext(g, h.id, false));
  return { memories, nodes, overview };
}
