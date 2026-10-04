import "server-only";
import { createGraph, describePath, findPath, type KnowledgeGraph } from "@/knowledge/graph";
import type { ItemCategory } from "@/knowledge/items";
import { addItem, getGraphData, setTaskStatus } from "@/server/store";
import { botGraph, botNodeId, checkBots } from "@/server/telegram";
import type { KGEdge, KGNode } from "@/types/graph";
import { requestApproval, type ApprovalEvent } from "@/server/approvals";
import { describe, parseAction, perform } from "@/server/computer";

/**
 * Tools JARVIS's AI brain can call while answering. Each runs here on the
 * server against the knowledge graph, and reports what it did to the browser
 * as an event (so the graph updates live and the activity stream stays honest).
 *
 * Safety: graph tools can read, create and mark tasks done; nothing deletes or
 * changes existing knowledge. check_bots asks Telegram read-only questions.
 * Computer tools (open_app, open_website, set_volume, take_screenshot) run a
 * fixed, validated command and ONLY after Izzatillo presses "Ha" on screen.
 */

export type ChatEvent =
  | { t: "text"; v: string }
  | { t: "tool"; name: string; summary: string }
  | { t: "created"; node: KGNode; edges: KGEdge[] }
  | { t: "updated"; node: KGNode; edges?: KGEdge[] }
  | { t: "focus"; ids: string[]; path?: boolean }
  | ApprovalEvent;

export interface ToolSpec {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

const str = { type: "string" };
const ids = { type: "array", items: { type: "string" }, description: "Item ids from search_graph or get_item" };

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "search_graph",
    description:
      "Search Izzatillo's knowledge graph (projects, notes, files, tools, people, tasks, goals, memories) by keywords. Use English or Uzbek keywords and names. Returns up to 10 items with id, name, type and description.",
    parameters: { type: "object", properties: { query: str, type: { ...str, description: "Optional item type filter, e.g. project, task, memory, note, file, tool, person, goal" } }, required: ["query"] },
  },
  {
    name: "get_item",
    description: "Read one item by id or exact name: full content, tags, status and every connected item with its relation.",
    parameters: { type: "object", properties: { item: { ...str, description: "Item id or name" } }, required: ["item"] },
  },
  {
    name: "find_connection",
    description: "Find how two items are connected (shortest chain of relationships) and show the chain on the graph.",
    parameters: { type: "object", properties: { from: str, to: str }, required: ["from", "to"] },
  },
  {
    name: "show_on_graph",
    description: "Highlight items on Izzatillo's screen. Call ttheir after finding the items an answer is about.",
    parameters: { type: "object", properties: { ids }, required: ["ids"] },
  },
  {
    name: "list_tasks",
    description: "List Izzatillo's tasks with their status (open/done) and when they were updated.",
    parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "done", "all"] } } },
  },
  {
    name: "save_memory",
    description:
      "Permanently remember a fact, decision or preference Izzatillo tells you (when they say remember / eslab qol / yodda tut, or shares something clearly worth keeping). Link it to related item ids.",
    parameters: { type: "object", properties: { title: { ...str, description: "2-6 word label" }, text: { ...str, description: "The fact, in their words" }, links: ids }, required: ["title", "text"] },
  },
  {
    name: "create_task",
    description: "Create a task for Izzatillo (when they ask to add a task / vazifa qo'sh / remind them to do something). Link it to related item ids.",
    parameters: { type: "object", properties: { title: str, details: str, links: ids }, required: ["title"] },
  },
  {
    name: "add_note",
    description: "Save a note (an idea, plan or piece of information they dictate). Link it to related item ids.",
    parameters: { type: "object", properties: { title: str, text: str, links: ids }, required: ["title", "text"] },
  },
  {
    name: "check_bots",
    description:
      "Check Izzatillo's connected Telegram bots right now: whether each token works, whether it is receiving messages (webhook errors, messages waiting unanswered). Use when they ask about their bots / botlarim ishlayaptimi.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "open_app",
    description:
      "Open an application on Izzatillo's Mac, e.g. Telegram, Safari, Google Chrome, Notes, Calendar, Music, TradingView. Use the app's usual English name. They are asked to approve first.",
    parameters: { type: "object", properties: { app: str }, required: ["app"] },
  },
  {
    name: "open_website",
    description:
      "Open a web page in their browser (https only). Build the URL yourself: YouTube search https://www.youtube.com/results?search_query=..., Google https://www.google.com/search?q=..., TradingView chart https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT. They are asked to approve first.",
    parameters: { type: "object", properties: { url: str }, required: ["url"] },
  },
  {
    name: "set_volume",
    description: "Set the Mac's output volume (0-100). They are asked to approve first.",
    parameters: { type: "object", properties: { level: { type: "number" } }, required: ["level"] },
  },
  {
    name: "take_screenshot",
    description: "Take a screenshot of their screen and save it to the Desktop. They are asked to approve first.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "complete_task",
    description: "Mark one of Izzatillo's saved tasks as done (only when they say it is finished).",
    parameters: { type: "object", properties: { id: str }, required: ["id"] },
  },
];

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[’‘ʻʼ`´]/g, "'")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

function search(graph: KnowledgeGraph, q: string, type?: string, limit = 10) {
  const words = norm(q)
    .split(/[^a-z0-9'+#.]+/)
    .filter((w) => w.length > 1);
  const scored: [number, string][] = [];
  graph.forEachNode((id, a) => {
    if (type && a.category !== type) return;
    const label = norm(a.label);
    const body = norm(`${a.node.description} ${a.node.tags.join(" ")} ${a.category} ${a.node.content ?? ""}`);
    let s = words.length ? 0 : 1;
    for (const w of words) {
      if (label === w) s += 12;
      else if (label.includes(w)) s += 6;
      if (body.includes(w)) s += 2;
    }
    if (s) scored.push([s + a.importance * 2 + graph.degree(id) * 0.05, id]);
  });
  return scored
    .sort((x, y) => y[0] - x[0])
    .slice(0, limit)
    .map(([, id]) => id);
}

function resolve(graph: KnowledgeGraph, ref: string): string | null {
  if (graph.hasNode(ref)) return ref;
  const k = norm(ref).trim();
  let hit: string | null = null;
  graph.forEachNode((id, a) => {
    if (!hit && norm(a.label) === k) hit = id;
  });
  return hit ?? search(graph, ref, undefined, 1)[0] ?? null;
}

function brief(graph: KnowledgeGraph, id: string) {
  const a = graph.getNodeAttributes(id);
  return { id, name: a.label, type: a.category, about: a.node.description, updated: a.node.updatedAt.slice(0, 10), status: a.node.metadata?.status };
}

const toList = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);

/** Runs one tool call. Returns plain data for the model; reports effects through `emit`. */
export async function runTool(name: string, input: Record<string, unknown>, emit: (e: ChatEvent) => void, signal: AbortSignal): Promise<unknown> {
  const graph = createGraph(await getGraphData());
  const s = (k: string) => String(input[k] ?? "").trim();
  console.info(`[jarvis tool] ${name} ${JSON.stringify(input).slice(0, 200)}`);

  switch (name) {
    case "search_graph": {
      const found = search(graph, s("query"), s("type") || undefined);
      emit({ t: "tool", name, summary: `Searched the graph for “${s("query")}” — ${found.length} found` });
      return found.map((id) => brief(graph, id));
    }
    case "get_item": {
      const id = resolve(graph, s("item"));
      if (!id) throw new Error(`No item called "${s("item")}"`);
      const a = graph.getNodeAttributes(id);
      emit({ t: "tool", name, summary: `Opened “${a.label}”` });
      return {
        ...brief(graph, id),
        content: a.node.content?.slice(0, 2000),
        tags: a.node.tags,
        connections: graph.edges(id).slice(0, 40).map((e) => {
          const other = graph.opposite(id, e);
          return { id: other, name: graph.getNodeAttribute(other, "label"), relation: graph.getEdgeAttribute(e, "relation"), direction: graph.source(e) === id ? "out" : "in" };
        }),
      };
    }
    case "find_connection": {
      const a = resolve(graph, s("from"));
      const b = resolve(graph, s("to"));
      if (!a || !b) throw new Error(`Not found: ${!a ? s("from") : s("to")}`);
      const path = findPath(graph, a, b);
      if (!path) return { connected: false };
      emit({ t: "focus", ids: path, path: true });
      emit({ t: "tool", name, summary: `Traced a path: ${path.map((id) => graph.getNodeAttribute(id, "label")).join(" → ")}` });
      return { connected: true, chain: describePath(graph, path) };
    }
    case "show_on_graph": {
      const list = toList(input.ids).filter((id) => graph.hasNode(id)).slice(0, 40);
      if (list.length) emit({ t: "focus", ids: list });
      return { shown: list.length };
    }
    case "list_tasks": {
      const want = s("status") || "open";
      const tasks: ReturnType<typeof brief>[] = [];
      graph.forEachNode((id, a) => {
        if (a.category !== "task") return;
        const st = String(a.node.metadata?.status ?? "open");
        if (want === "all" || st === want) tasks.push(brief(graph, id));
      });
      emit({ t: "tool", name, summary: `Listed ${tasks.length} ${want === "all" ? "" : want + " "}task(s)` });
      return tasks.slice(0, 40);
    }
    case "save_memory":
    case "create_task":
    case "add_note": {
      const category: ItemCategory = name === "save_memory" ? "memory" : name === "create_task" ? "task" : "note";
      const item = await addItem({
        category,
        label: s("title"),
        content: s("text") || s("details") || s("title"),
        links: toList(input.links).map((l) => resolve(graph, l) ?? l),
      });
      emit({ t: "created", ...item });
      emit({ t: "focus", ids: [item.node.id, ...item.edges.map((e) => e.target)] });
      emit({ t: "tool", name, summary: `Saved ${category} “${item.node.label}”` });
      return { saved: true, id: item.node.id };
    }
    case "check_bots": {
      const bots = await checkBots();
      if (!bots.length) return { bots: [], note: "No Telegram bots are connected yet. They can add one in Settings → Telegram botlar." };
      const g = botGraph(bots, (id) => graph.hasNode(id));
      for (const node of g.nodes) emit({ t: "updated", node, edges: g.edges.filter((e) => e.source === node.id || e.target === node.id) });
      emit({ t: "focus", ids: bots.map(botNodeId) });
      const bad = bots.filter((b) => b.status && b.status.health !== "ok").length;
      emit({ t: "tool", name, summary: `Checked ${bots.length} Telegram bot(s)${bad ? ` — ${bad} need attention` : " — all fine"}` });
      return bots.map((b) => ({ id: botNodeId(b), username: `@${b.username}`, name: b.name, ...b.status }));
    }
    case "open_app":
    case "open_website":
    case "set_volume":
    case "take_screenshot": {
      const action = parseAction(name, input);
      const summary = describe(action);
      emit({ t: "tool", name, summary: `Asking permission: ${summary}` });
      if (!(await requestApproval(summary, emit, signal))) return { done: false, reason: "Izzatillo did not approve this. Do not retry; say so briefly." };
      const result = await perform(action);
      emit({ t: "tool", name, summary: `Done: ${summary}` });
      return { done: true, result };
    }
    case "complete_task": {
      const node = await setTaskStatus(s("id"), "done");
      if (!node) throw new Error("Only tasks JARVIS saved can be marked done");
      emit({ t: "updated", node });
      emit({ t: "tool", name, summary: `Marked task “${node.label}” done` });
      return { done: true };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}
