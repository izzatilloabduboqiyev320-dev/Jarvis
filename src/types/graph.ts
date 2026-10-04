/**
 * Core knowledge-graph types. These are storage-agnostic: today they come from
 * the demo dataset, in Phase 3 they are rows in SQLite (and later Postgres).
 */

export const NODE_CATEGORIES = [
  "person",
  "project",
  "world",
  "router",
  "wiki",
  "suite",
  "concept",
  "skill",
  "tool",
  "agent",
  "automation",
  "note",
  "file",
  "book",
  "video",
  "web",
  "company",
  "task",
  "goal",
  "memory",
] as const;

export type NodeCategory = (typeof NODE_CATEGORIES)[number];

export const RELATION_TYPES = [
  "USES",
  "CREATED_BY",
  "RELATED_TO",
  "PART_OF",
  "REQUIRES",
  "LEARNT_FROM",
  "WORKS_ON",
  "DEPENDS_ON",
  "MENTIONS",
  "CONTAINS",
  "CONNECTED_TO",
  "GENERATED_BY",
  "TEACHES",
  "OWNS",
  "PURSUES",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export interface KGNode {
  id: string;
  label: string;
  category: NodeCategory;
  description: string;
  /** 0..1 — drives node size and ranking. */
  importance: number;
  tags: string[];
  source: string;
  /** External link (video, website, docs…). Only http(s); opened via src/lib/external-link.ts. */
  url?: string;
  /** ISO timestamp */
  updatedAt: string;
  /** Optional longer body (notes, file excerpts, memories). */
  content?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface KGEdge {
  id: string;
  source: string;
  target: string;
  relation: RelationType;
  /** 0..1 */
  weight: number;
}

export interface KGData {
  nodes: KGNode[];
  edges: KGEdge[];
}
