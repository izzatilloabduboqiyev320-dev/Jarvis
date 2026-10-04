import { safeExternalUrl } from "@/lib/external-link";
import type { KGEdge, KGNode } from "@/types/graph";

/** Things JARVIS (or the user) can create in the graph. */
export type ItemCategory = Extract<KGNode["category"], "memory" | "task" | "note">;
export const ITEM_CATEGORIES: ItemCategory[] = ["memory", "task", "note"];

export interface ItemSpec {
  category: ItemCategory;
  label: string;
  content: string;
  links: string[];
  /** Original link of the thing being saved (a video, article…). Kept only if it is a safe http(s) address. */
  url?: string;
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "item"
  );
}

/** Builds a node and its edges. `exists` says which link targets are real nodes. */
export function buildItem(spec: ItemSpec, exists: (id: string) => boolean, source = "JARVIS"): { node: KGNode; edges: KGEdge[] } {
  const now = new Date().toISOString();
  const label = spec.label.trim().slice(0, 120) || spec.content.trim().slice(0, 60) || "Untitled";
  const content = spec.content.trim().slice(0, 4000);
  const url = safeExternalUrl(spec.url) ?? undefined;
  const node: KGNode = {
    id: `${spec.category}-${slug(label)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    label,
    category: spec.category,
    description: content.slice(0, 280) || label,
    content,
    importance: spec.category === "memory" ? 0.45 : 0.4,
    tags: [spec.category, "created by jarvis"],
    source,
    ...(url ? { url } : {}),
    updatedAt: now,
    metadata: spec.category === "task" ? { status: "open" } : undefined,
  };
  const links = [...new Set(spec.links)].filter(exists).slice(0, 8);
  const relation = spec.category === "task" ? "RELATED_TO" : "MENTIONS";
  const edges: KGEdge[] = links.map((target) => ({ id: `${node.id}|${relation}|${target}`, source: node.id, target, relation, weight: 0.6 }));
  if (!edges.length && exists("izzatillo")) {
    edges.push({ id: `${node.id}|RELATED_TO|izzatillo`, source: node.id, target: "izzatillo", relation: "RELATED_TO", weight: 0.4 });
  }
  return { node, edges };
}
