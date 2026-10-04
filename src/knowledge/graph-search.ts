import type { KnowledgeGraph } from "@/knowledge/graph";

/**
 * Keyword search over the knowledge graph, shared by the AI tools and the
 * context JARVIS retrieves before answering. Works for English, Uzbek and
 * Russian words; ranks by match quality, importance, connections and recency.
 */

export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[’‘ʻʼ`´]/g, "'")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

// Words that say nothing about the topic (question words, pronouns, filler).
const STOP = new Set(
  (
    "the a an and or of to in on at for with about from by is are was were be been do does did i me my mine you your we our it its this that these those " +
    "what which who whom whose when where why how can could would should will shall may might must have has had not no yes please tell show give find " +
    "say said know remember everything anything something all any some jarvis hey ok okay " +
    "va yoki bilan uchun haqida nima nimani nega qanday qachon qayerda kim men meni mening sen seni sening biz u bu shu o'sha ham emas bor yo'q " +
    "ayt aytchi ko'rsat ber top eslab qol menga senga " +
    "и или в на с о об для по что как где когда кто я мне мой ты твой мы это все"
  ).split(" "),
);

/** Meaningful search words of a message ("What did I say about my trading bot?" → trading, bot). */
export function keywords(q: string): string[] {
  return [...new Set(norm(q).split(/[^\p{L}\p{N}'+#.]+/u))]
    .map((w) => w.replace(/^'+|'+$|\.+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Uzbek and English endings, so "botlarim", "ICTga" and "bots" still match "bot", "ict". */
function stem(w: string): string {
  if (w.length < 5) return w;
  return w.replace(/(larimizni|larimiz|laringiz|larini|larni|larga|lardan|larda|lari|lar|imizni|ingizni|ning|dagi|dan|ga|ka|qa|da|ni|im|ing|ies|es|s)$/u, "") || w;
}

export interface SearchHit {
  id: string;
  score: number;
}

export function searchGraph(graph: KnowledgeGraph, q: string, opts: { type?: string; limit?: number; now?: number } = {}): SearchHit[] {
  const words = keywords(q);
  const stems = words.map(stem);
  const now = opts.now ?? Date.now();
  const scored: SearchHit[] = [];
  graph.forEachNode((id, a) => {
    if (opts.type && a.category !== opts.type) return;
    const label = norm(a.label);
    const body = norm(`${a.node.description} ${a.node.tags.join(" ")} ${a.category} ${a.node.content ?? ""}`);
    let s = 0;
    words.forEach((w, i) => {
      const st = stems[i];
      if (label === w) s += 12;
      else if (label.includes(w)) s += 6;
      else if (st.length >= 3 && label.includes(st)) s += 4;
      if (body.includes(w)) s += 2;
      else if (st.length >= 3 && body.includes(st)) s += 1;
    });
    if (!words.length) s = 1;
    if (!s) return;
    const ageDays = (now - Date.parse(a.node.updatedAt || "")) / 86_400_000;
    const recency = Number.isFinite(ageDays) ? Math.max(0, 1 - ageDays / 30) : 0;
    scored.push({ id, score: s + a.importance * 2 + Math.min(graph.degree(id), 20) * 0.05 + recency });
  });
  return scored.sort((x, y) => y.score - x.score).slice(0, opts.limit ?? 10);
}

/** An item by id or exact name, else the best search match. */
export function resolveItem(graph: KnowledgeGraph, ref: string): string | null {
  if (graph.hasNode(ref)) return ref;
  const k = norm(ref).trim();
  let hit: string | null = null;
  graph.forEachNode((id, a) => {
    if (!hit && norm(a.label) === k) hit = id;
  });
  return hit ?? searchGraph(graph, ref, { limit: 1 })[0]?.id ?? null;
}
