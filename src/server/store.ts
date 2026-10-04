import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { JARVIS_HOME } from "@/server/home";
import { buildDemoGraph } from "@/knowledge/demo-graph";
import { botGraph, listBots } from "@/server/telegram";
import { buildItem, ITEM_CATEGORIES, type ItemSpec } from "@/knowledge/items";
import type { KGData, KGEdge, KGNode } from "@/types/graph";
import { shared } from "@/server/shared";
import { safeExternalUrl } from "@/lib/external-link";

/**
 * JARVIS's permanent memory on this computer: everything the user or JARVIS
 * creates (memories, tasks, notes) is saved to ~/.jarvis/jarvis-store.json,
 * outside the project folder, so it survives restarts, browser changes and updates.
 * A plain JSON file keeps installation dependency-free; the API is shaped so
 * it can move to SQLite/Postgres later without touching callers.
 */

const DIR = JARVIS_HOME;
const FILE = path.join(DIR, "jarvis-store.json");

interface StoreFile {
  version: 1;
  nodes: KGNode[];
  edges: KGEdge[];
  /** Links the user added to any item, including demo knowledge (node id → http(s) URL). */
  links?: Record<string, string>;
}


const S = shared("store", () => ({ cache: null as StoreFile | null, writing: Promise.resolve() as Promise<void> }));

async function load(): Promise<StoreFile> {
  if (S.cache) return S.cache;
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as StoreFile;
    const links = parsed.links && typeof parsed.links === "object" ? parsed.links : {};
    S.cache = { version: 1, nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [], edges: Array.isArray(parsed.edges) ? parsed.edges : [], links };
  } catch {
    S.cache = { version: 1, nodes: [], edges: [] };
  }
  return S.cache;
}

/** Writes are queued and atomic (temp file + rename), so a crash never leaves half a file. */
function save(): Promise<void> {
  S.writing = S.writing.then(async () => {
    if (!S.cache) return;
    await mkdir(DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(S.cache, null, 1), "utf8");
    await rename(tmp, FILE);
  });
  return S.writing;
}

/** Demo knowledge + everything saved on this computer + connected Telegram bots. */
export async function getGraphData(): Promise<KGData> {
  const demo = buildDemoGraph();
  const store = await load();
  const ids = new Set(demo.nodes.map((n) => n.id));
  const links = store.links ?? {};
  const withLink = (n: KGNode): KGNode => (links[n.id] ? { ...n, url: links[n.id] } : n);
  const nodes = [...demo.nodes, ...store.nodes.filter((n) => !ids.has(n.id))].map(withLink);
  const bots = botGraph(await listBots(), (id) => ids.has(id));
  nodes.push(...bots.nodes);
  const all = new Set(nodes.map((n) => n.id));
  const edges = [...demo.edges, ...store.edges.filter((e) => all.has(e.source) && all.has(e.target)), ...bots.edges];
  return { nodes, edges };
}

export async function addItem(spec: ItemSpec): Promise<{ node: KGNode; edges: KGEdge[] }> {
  if (!ITEM_CATEGORIES.includes(spec.category)) throw new Error("Unsupported item type");
  const data = await getGraphData();
  const ids = new Set(data.nodes.map((n) => n.id));
  const item = buildItem(spec, (id) => ids.has(id));
  const store = await load();
  store.nodes.push(item.node);
  store.edges.push(...item.edges);
  await save();
  return item;
}

/** Marks a saved task done/open. Only items JARVIS created can change. */
export async function setTaskStatus(id: string, status: "open" | "done"): Promise<KGNode | null> {
  const store = await load();
  const node = store.nodes.find((n) => n.id === id && n.category === "task");
  if (!node) return null;
  node.metadata = { ...node.metadata, status };
  node.updatedAt = new Date().toISOString();
  await save();
  return node;
}

/**
 * Saves (or clears, with null) the external link of any item, demo knowledge included.
 * Only http(s) links are accepted. Returns the updated node, or null if the item doesn't exist.
 */
export async function setItemUrl(id: string, raw: string | null): Promise<KGNode | null> {
  const url = raw === null || raw.trim() === "" ? null : safeExternalUrl(raw);
  if (raw !== null && raw.trim() !== "" && !url) throw new Error("Only http(s) web addresses can be saved as links");
  const data = await getGraphData();
  const node = data.nodes.find((n) => n.id === id);
  if (!node) return null;
  const store = await load();
  const links = { ...store.links };
  if (url) links[id] = url;
  else delete links[id];
  store.links = links;
  const own = store.nodes.find((n) => n.id === id);
  if (own) {
    if (url) own.url = url;
    else delete own.url;
  }
  await save();
  const updated: KGNode = { ...node };
  if (url) updated.url = url;
  else delete updated.url;
  return updated;
}

export async function removeItem(id: string): Promise<boolean> {
  const store = await load();
  if (!store.nodes.some((n) => n.id === id)) return false;
  store.nodes = store.nodes.filter((n) => n.id !== id);
  store.edges = store.edges.filter((e) => e.source !== id && e.target !== id);
  if (store.links?.[id]) delete store.links[id];
  await save();
  return true;
}

/** One-time move of items saved in the browser (Phase 1) into the permanent store. */
export async function importItems(nodes: KGNode[], edges: KGEdge[]): Promise<number> {
  const store = await load();
  const have = new Set(store.nodes.map((n) => n.id));
  const ok = nodes.filter(
    (n) => n && typeof n.id === "string" && typeof n.label === "string" && ITEM_CATEGORIES.includes(n.category as never) && !have.has(n.id),
  );
  if (!ok.length) return 0;
  const okIds = new Set(ok.map((n) => n.id));
  store.nodes.push(
    ...ok.map((n) => ({
      ...n,
      label: n.label.slice(0, 120),
      content: typeof n.content === "string" ? n.content.slice(0, 4000) : undefined,
      description: String(n.description ?? "").slice(0, 400),
      tags: Array.isArray(n.tags) ? n.tags.map(String).slice(0, 12) : [],
      importance: typeof n.importance === "number" ? Math.min(1, Math.max(0, n.importance)) : 0.4,
      source: "JARVIS (browser)",
      url: safeExternalUrl(n.url) ?? undefined,
      updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : new Date().toISOString(),
    })),
  );
  store.edges.push(...edges.filter((e) => e && okIds.has(e.source) && typeof e.target === "string"));
  await save();
  return ok.length;
}
