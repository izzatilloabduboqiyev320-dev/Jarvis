import { CATEGORIES } from "@/knowledge/categories";
import { describePath, findPath, neighborhood, type KnowledgeGraph } from "@/knowledge/graph";
import type { NodeCategory } from "@/types/graph";

/**
 * Local natural-language query engine ("demo brain").
 *
 * Works fully offline and powers search + the command palette in DEMO MODE.
 * In Phase 2 the same functions become tools Claude can call
 * (graph_search, graph_path, create_memory …), so nothing here is throwaway.
 */

export type QueryIntent =
  | "path"
  | "topic"
  | "working-on"
  | "create"
  | "open"
  | "needs-ai"
  | "greeting"
  | "empty";

export interface CreateSpec {
  category: Extract<NodeCategory, "memory" | "task" | "note">;
  label: string;
  content: string;
  links: string[];
}

export interface QueryResult {
  intent: QueryIntent;
  answer: string;
  /** Nodes to highlight in the graph. */
  nodes: string[];
  /** The main entities the query was about. */
  anchors: string[];
  path?: string[];
  create?: CreateSpec;
  open?: string;
}

const STOPWORDS = new Set(
  `a an the and or of to in on for with about from by at is are was were be been am i me my mine we our you your it its this that these those
   what which who whom how why when where do does did done can could would should will shall please show find search get give list display
   everything anything something all any some related relating relevant connected connection connections between link linked
   tell know see look up into out up over just also more most only than then there here have has had being
   jarvis hey ok okay yes`.split(/\s+/),
);

const CATEGORY_WORDS: Record<string, NodeCategory> = (() => {
  const map: Record<string, NodeCategory> = {};
  for (const [cat, style] of Object.entries(CATEGORIES)) {
    for (const a of style.aliases) map[a] = cat as NodeCategory;
  }
  // A few words are too ambiguous to act as filters.
  delete map["hub"];
  delete map["source"];
  delete map["sources"];
  delete map["web"];
  delete map["platform"];
  delete map["who"];
  return map;
})();

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/^\s*(hey\s+)?jarvis[\s,.:!-]*/i, "")
    .replace(/[?!.]+$/g, "")
    .trim();
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Span {
  id: string;
  start: number;
  end: number;
  score: number;
}

/** Find every node whose label (or short alias) appears in the text. */
export function findMentions(graph: KnowledgeGraph, text: string): string[] {
  const t = ` ${text.toLowerCase()} `;
  const spans: Span[] = [];
  graph.forEachNode((id, a) => {
    const candidates = new Set<string>([a.label.toLowerCase()]);
    // "Quasimodo (QM)" → also "qm"; "$100M Offers" → "100m offers"
    const paren = a.label.match(/\(([^)]+)\)/);
    if (paren) candidates.add(paren[1].toLowerCase());
    candidates.add(a.label.toLowerCase().replace(/\s*\([^)]*\)/, "").replace(/[$]/g, ""));
    for (const c of candidates) {
      if (c.length < 2) continue;
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(c)}(s)?(?=[^a-z0-9]|$)`, "i");
      const m = re.exec(t);
      if (m) {
        const start = m.index + m[1].length;
        spans.push({ id, start, end: start + c.length, score: c.length + a.importance });
      }
    }
  });
  // Longest, most important match wins overlapping spans ("trading knowledge" beats "trading").
  spans.sort((x, y) => y.score - x.score);
  const taken: Span[] = [];
  const ids: string[] = [];
  for (const s of spans) {
    if (taken.some((o) => s.start < o.end && o.start < s.end)) continue;
    if (ids.includes(s.id)) continue;
    taken.push(s);
    ids.push(s.id);
  }
  return ids;
}

/** Best single node for a phrase, used for "how is X connected to Y". */
export function resolveEntity(graph: KnowledgeGraph, phrase: string): string | null {
  const p = phrase.toLowerCase().replace(/^(the|my|project|concept|file|note|skill|tool)\s+/g, "").trim();
  if (!p) return null;
  // "my youtube project" → prefer a project node over the YouTube company node.
  const cats = categoriesIn(phrase.toLowerCase());
  const words0 = keywords(p);
  if (cats.length && words0.length) {
    let best: string | null = null;
    let bestScore = 0;
    graph.forEachNode((id, a) => {
      if (!cats.includes(a.category)) return;
      const label = a.label.toLowerCase();
      let score = 0;
      for (const w of words0) if (label.includes(w) || a.node.tags.includes(w)) score += 2;
      score += a.importance;
      if (score > 2 && score > bestScore) {
        bestScore = score;
        best = id;
      }
    });
    if (best) return best;
  }
  const mentions = findMentions(graph, p);
  if (mentions.length) return mentions[0];
  let best: string | null = null;
  let bestScore = 0;
  const words = p.split(/\s+/).filter((w) => w.length > 1 && !STOPWORDS.has(w));
  graph.forEachNode((id, a) => {
    const label = a.label.toLowerCase();
    let score = 0;
    if (label.includes(p)) score += 5;
    for (const w of words) {
      if (label.includes(w)) score += 2;
      if (a.node.tags.some((t) => t === w)) score += 1;
    }
    score += a.importance;
    if (score > bestScore && score > 1.5) {
      bestScore = score;
      best = id;
    }
  });
  return best;
}

function keywords(text: string): string[] {
  return text
    .split(/[^a-z0-9$#+-]+/i)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !CATEGORY_WORDS[w]);
}

function categoriesIn(text: string): NodeCategory[] {
  const cats = new Set<NodeCategory>();
  for (const w of text.split(/[^a-z]+/)) {
    const c = CATEGORY_WORDS[w];
    if (c) cats.add(c);
  }
  return [...cats];
}

function labelList(graph: KnowledgeGraph, ids: string[], max = 6): string {
  const all = [...new Set(ids.map((id) => graph.getNodeAttribute(id, "label")))];
  const labels = all.slice(0, max);
  const more = all.length > max ? ` and ${all.length - max} more` : "";
  return labels.join(", ") + more;
}

function rank(graph: KnowledgeGraph, ids: Iterable<string>): string[] {
  return [...ids].sort((a, b) => {
    const ia = graph.getNodeAttribute(a, "importance") + graph.degree(a) / 100;
    const ib = graph.getNodeAttribute(b, "importance") + graph.degree(b) / 100;
    return ib - ia;
  });
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export interface QueryContext {
  /** Currently selected node — resolves "this project", "this file". */
  selected?: string | null;
}

export function runQuery(graph: KnowledgeGraph, raw: string, ctx: QueryContext = {}): QueryResult {
  const text = normalize(raw);
  const empty: QueryResult = { intent: "empty", answer: "", nodes: [], anchors: [] };
  if (!text) return empty;
  const sel = ctx.selected && graph.hasNode(ctx.selected) ? ctx.selected : null;

  if (/^(hi|hello|hey|yo|salom|good (morning|evening|afternoon))\b/.test(text) || text === "") {
    return { ...empty, intent: "greeting", answer: "Yes? I'm online. Ask me about your projects, knowledge or files." };
  }

  // ── Create: remember / task / note ────────────────────────────────
  const create = text.match(/^(remember( that)?|note( that)?|add (a )?note|create (a )?task|add (a )?task|new task|todo|remind me to)[:\s,]*(.*)$/);
  if (create) {
    const verb = create[1];
    const body = raw.replace(/^\s*(hey\s+)?jarvis[\s,.:!-]*/i, "").slice(verb.length).replace(/^[\s:,]*(that\s+)?/i, "").trim();
    const category: CreateSpec["category"] = /task|todo|remind/.test(verb) ? "task" : /note/.test(verb) ? "note" : "memory";
    if (!body) {
      return { ...empty, intent: "create", answer: `What should the ${category} say? Try: "${verb} …"` };
    }
    const links = findMentions(graph, body);
    if (sel && /\b(this|it)\b/i.test(body) && !links.includes(sel)) links.unshift(sel);
    const label = body.length > 48 ? body.slice(0, 46).trimEnd() + "…" : body;
    const linkText = links.length ? ` and linked it to ${labelList(graph, links, 4)}` : "";
    const noun = category === "memory" ? "Memory saved" : category === "task" ? "Task created" : "Note added";
    return {
      intent: "create",
      answer: `${noun}${linkText}.`,
      nodes: links,
      anchors: links,
      create: { category, label: label.charAt(0).toUpperCase() + label.slice(1), content: body, links },
    };
  }

  // ── Path: how is X connected to Y ─────────────────────────────────
  const pathMatch =
    text.match(/(?:how (?:is|are|do|does)|what(?:'s| is) the (?:connection|link|relationship|path) between|connection between|path (?:from|between)|link between|relationship between)\s+(.+?)\s+(?:and|to|with)\s+(.+?)(?:\s+(?:connected|related|linked|relate|connect))?(?:\s+to each other)?$/) ??
    text.match(/^(?:connect|trace)\s+(.+?)\s+(?:and|to|with)\s+(.+)$/);
  if (pathMatch) {
    const a = /^(this|it)$/.test(pathMatch[1].trim()) ? sel : resolveEntity(graph, pathMatch[1]);
    const b = /^(this|it)$/.test(pathMatch[2].trim()) ? sel : resolveEntity(graph, pathMatch[2]);
    if (a && b && a !== b) {
      const path = findPath(graph, a, b);
      if (path) {
        const la = graph.getNodeAttribute(a, "label");
        const lb = graph.getNodeAttribute(b, "label");
        const hops = path.length - 1;
        return {
          intent: "path",
          answer: `${la} and ${lb} are ${hops === 1 ? "directly connected" : `connected in ${hops} steps`}: ${describePath(graph, path)}.`,
          nodes: path,
          anchors: [a, b],
          path,
        };
      }
      return { ...empty, intent: "path", answer: "I found both, but there is no connection between them in the graph yet.", anchors: [a, b], nodes: [a, b] };
    }
    // fall through to topic search if the entities weren't resolved
  }

  // ── What am I working on ──────────────────────────────────────────
  if (/(what|which).*(am i|was i|i am|i was|i'm).*(work|doing|busy|focus)|^(my )?(current|active) (work|projects)|what.*working on/.test(text)) {
    const projects = graph.hasNode("izzatillo")
      ? graph.outNeighbors("izzatillo").filter((id) => graph.getNodeAttribute(id, "category") === "project")
      : [];
    const tasks = graph.filterNodes((_, a) => a.category === "task" && a.node.metadata?.status !== "done");
    const byRecent = [...projects, ...tasks].sort(
      (x, y) => +new Date(graph.getNodeAttribute(y, "node").updatedAt) - +new Date(graph.getNodeAttribute(x, "node").updatedAt),
    );
    const recent = byRecent.slice(0, 4).map((id) => {
      const n = graph.getNodeAttribute(id, "node");
      return `${n.label} (${relativeDay(n.updatedAt)})`;
    });
    const yesterday = /yesterday/.test(text);
    const lead = yesterday ? "Most recent activity" : "You're working on";
    return {
      intent: "working-on",
      answer: `${lead}: ${recent.join(", ")}. ${projects.length} active projects and ${tasks.length} open tasks in total.`,
      nodes: graph.hasNode("izzatillo") ? ["izzatillo", ...byRecent] : byRecent,
      anchors: byRecent.slice(0, 4),
    };
  }

  // ── Open ──────────────────────────────────────────────────────────
  const open = text.match(/^open\s+(.+)$/);
  if (open) {
    const target = /^(this|it|this (project|file|note|node))$/.test(open[1]) ? sel : resolveEntity(graph, open[1]);
    if (target) {
      return { intent: "open", answer: `Opening ${graph.getNodeAttribute(target, "label")}.`, nodes: [target], anchors: [target], open: target };
    }
    if (/^(agents|skills|settings|files|memory|tasks|chat)$/.test(open[1])) {
      return { ...empty, intent: "open", answer: `Opening ${open[1]}.`, open: `page:${open[1]}` };
    }
  }

  // ── Needs the AI brain / later phases ─────────────────────────────
  if (/\b(search|look up|google)\b.*\b(web|internet|online)\b|^(browse|research)\b/.test(text)) {
    return { ...empty, intent: "needs-ai", answer: "Web search needs the Claude brain and the Web Search tool (Phase 2). For now I can search your knowledge graph." };
  }
  if (/\bsummari[sz]e\b/.test(text)) {
    const target = sel && /\b(this|it)\b/.test(text) ? sel : findMentions(graph, text)[0] ?? sel;
    if (target) {
      const n = graph.getNodeAttribute(target, "node");
      const body = n.content ? ` Content: ${n.content.replace(/\n/g, " ")}` : "";
      return {
        intent: "topic",
        answer: `${n.label}: ${n.description}${body} (Full AI summaries arrive with Claude in Phase 2.)`,
        nodes: [...neighborhood(graph, [target], 1)],
        anchors: [target],
      };
    }
    return { ...empty, intent: "needs-ai", answer: "Select a file or note first, then ask me to summarise it." };
  }

  // ── Topic search (default) ────────────────────────────────────────
  const decision = /\b(decide|decided|decision|decisions|agreed)\b/.test(text);
  let cats = categoriesIn(text);
  if (decision) cats = [...new Set<NodeCategory>([...cats, "memory", "note"])];
  const anchors = findMentions(graph, text);
  if (sel && /\b(this|it)\b/.test(text) && !anchors.includes(sel)) anchors.unshift(sel);
  const anchorLabels = anchors.map((a) => graph.getNodeAttribute(a, "label").toLowerCase());
  const kws = keywords(text).filter((k) => !anchorLabels.some((l) => l === k));

  // Tag / label hits for remaining keywords and anchor names.
  const terms = [...new Set([...kws, ...anchorLabels.filter((l) => !l.includes(" "))])];
  const tagHits = new Set<string>();
  if (terms.length) {
    graph.forEachNode((id, a) => {
      const label = a.label.toLowerCase();
      for (const t of terms) {
        if (t.length < 2) continue;
        if (a.node.tags.includes(t) || (t.length > 3 && label.includes(t))) {
          tagHits.add(id);
          break;
        }
      }
    });
  }

  let result = new Set<string>([...anchors, ...tagHits]);
  if (anchors.length) for (const n of neighborhood(graph, anchors, 1)) result.add(n);

  if (cats.length) {
    // Category filter: anchors + matching nodes within 2 hops (or anywhere, if no anchor).
    const inCats = (id: string) => cats.includes(graph.getNodeAttribute(id, "category"));
    const seeds = [...anchors, ...tagHits];
    let filtered = seeds.length ? [...neighborhood(graph, seeds, 1)].filter(inCats) : graph.filterNodes((id) => inCats(id));
    if (!filtered.length && seeds.length) filtered = [...neighborhood(graph, seeds, 2)].filter(inCats);
    result = new Set([...anchors, ...filtered]);
  }

  // Full-text fallback over descriptions/content.
  if (!result.size && kws.length) {
    graph.forEachNode((id, a) => {
      const hay = `${a.node.description} ${a.node.content ?? ""}`.toLowerCase();
      if (kws.some((k) => k.length > 2 && hay.includes(k))) result.add(id);
    });
  }

  const ranked = rank(graph, result);
  if (!ranked.length) {
    return { ...empty, intent: "topic", answer: `I couldn't find anything about "${raw.trim()}" in your knowledge graph yet.` };
  }
  const focusLabel = anchors.length ? labelList(graph, anchors, 3) : kws.slice(0, 3).join(", ");
  const catLabel = cats.length && !decision ? cats.map((c) => CATEGORIES[c].plural.toLowerCase()).join(" and ") : "nodes";
  const shown = ranked.filter((id) => !anchors.includes(id));
  let answer = `Found ${cats.length ? shown.length : ranked.length} ${catLabel} related to ${focusLabel || "your query"}`;
  answer += shown.length ? `: ${labelList(graph, shown)}.` : ".";
  if (decision) {
    const decisions = ranked.filter((id) => graph.getNodeAttribute(id, "category") === "memory" || graph.getNodeAttribute(id, "category") === "note");
    const withContent = decisions.map((id) => graph.getNodeAttribute(id, "node")).find((n) => n.content || n.category === "memory");
    if (withContent) answer = `Latest decision on record — ${withContent.label}: ${withContent.content ?? withContent.description}`;
  }
  return { intent: "topic", answer, nodes: ranked, anchors: anchors.length ? anchors : ranked.slice(0, 1) };
}

/** Quick label search for autocomplete. */
export function searchLabels(graph: KnowledgeGraph, q: string, limit = 8): string[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const scored: [string, number][] = [];
  graph.forEachNode((id, a) => {
    const l = a.label.toLowerCase();
    let score = 0;
    if (l === s) score = 100;
    else if (l.startsWith(s)) score = 60;
    else if (l.includes(s)) score = 40;
    else if (a.node.tags.some((t) => t.startsWith(s))) score = 20;
    if (score) scored.push([id, score + a.importance * 10]);
  });
  return scored.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}
