"use client";

import { CHAT_LIMITS, type ChatRequest, type ChatTurn, type ContextNode } from "@/ai/chat-types";
import { addEdgeToGraph, addNodeToGraph, refreshSizes, topHubs } from "@/knowledge/graph";
import { detectLang } from "@/knowledge/uzbek";
import { runQuery, type QueryResult } from "@/knowledge/query";
import { graphCommands } from "@/lib/graph-commands";
import { getGraph, persistLocal } from "@/lib/graph-instance";
import { CHAT_KEY, useJarvis } from "@/lib/store";
import { speak, speakGemini } from "@/voice/speak";
import type { KGEdge, KGNode } from "@/types/graph";

/**
 * JARVIS request pipeline (demo brain).
 *
 *   understand intent → search graph → (tool / create) → respond → speak
 *
 * Every step is written to the activity stream so actions stay transparent.
 * Phase 2 inserts Claude between "understand" and "respond" via /api/chat,
 * with the query engine exposed to it as tools.
 */

function saveChat() {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(useJarvis.getState().messages.filter((m) => m.text)));
  } catch {
    /* storage full or unavailable: chat history lasts for this visit only */
  }
}

export function clearChat() {
  useJarvis.getState().setMessages([]);
  saveChat();
}

/** Knowledge-graph items Claude should see for this message. */
function buildContext(result: QueryResult): ChatRequest["context"] {
  const graph = getGraph();
  const selected = useJarvis.getState().selected;
  const ids = [...new Set([...result.anchors, ...(result.path ?? []), ...result.nodes, ...(selected ? [selected] : [])])].filter((id) =>
    graph.hasNode(id),
  );
  // Nothing matched: give Claude the overall shape of the graph (top hubs).
  const chosen = ids.length ? ids : topHubs(graph, 12).map((h) => h.id);
  const nodes: ContextNode[] = chosen.slice(0, CHAT_LIMITS.nodes).map((id) => {
    const a = graph.getNodeAttributes(id);
    return {
      label: a.label,
      category: a.category,
      description: a.node.description,
      updated: a.node.updatedAt?.slice(0, 10),
      links: graph.neighbors(id).slice(0, CHAT_LIMITS.links).map((n) => graph.getNodeAttribute(n, "label")),
    };
  });
  return {
    nodes,
    selected: selected && graph.hasNode(selected) ? graph.getNodeAttribute(selected, "label") : undefined,
    localAction: result.create ? `saved ${result.create.category} "${result.create.label}"` : undefined,
  };
}

/** Streams Claude's reply via /api/chat; throws with a readable message on failure. */
async function streamChat(text: string, result: QueryResult, lang: "en" | "uz", onPartial: (t: string) => void): Promise<string> {
  const history: ChatTurn[] = useJarvis
    .getState()
    .messages.filter((m) => m.text)
    .slice(-CHAT_LIMITS.messages)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
  const body: ChatRequest = { messages: history, lang, context: buildContext(result) };
  const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? "JARVIS AI service unavailable");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
    onPartial(out);
  }
  out = out.trim();
  if (!out) throw new Error("Claude returned an empty reply");
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let busy = false;

/** Client-side router, registered by the app shell (keeps this module React-free). */
let navigate: (path: string) => void = () => {};
export function setNavigator(fn: (path: string) => void) {
  navigate = fn;
}

/** Natural Gemini voice when its key is set, otherwise the browser's voice. */
async function say(text: string, lang: "en" | "uz"): Promise<string | null> {
  if (useJarvis.getState().status.voiceOutput === "gemini") {
    const v = await speakGemini(text);
    if (v) return v;
    useJarvis.getState().log("error", "Gemini voice unavailable — using the browser voice");
  }
  return speak(text, lang);
}

/** Says a short test phrase so the user can check that sound works. */
export async function testVoice() {
  const s = useJarvis.getState();
  const uz = s.voiceLang === "uz-UZ";
  if (!s.voiceReplies) s.setVoiceReplies(true);
  s.setHud("speaking", uz ? "Ovoz sinovi" : "Voice test");
  const voice = await say(uz ? "Salom! Men JARVIS. Ovozim eshitilyaptimi?" : "Hello. I am JARVIS. Can you hear me?", uz ? "uz" : "en");
  s.log("system", voice ? `Voice test — voice: ${voice}` : "This browser has no speech output");
  if (useJarvis.getState().hud === "speaking") useJarvis.getState().setHud("idle");
}

export async function askJarvis(input: string, opts: { lang?: "en" | "uz" } = {}): Promise<QueryResult | null> {
  const text = input.trim();
  if (!text || busy) return null;
  busy = true;
  const s = useJarvis.getState();
  try {
    s.addMessage("user", text);
    s.log("user", `User: “${text}”`);
    s.setHud("thinking", "Understanding request");
    await wait(320);

    const graph = getGraph();
    const result = runQuery(graph, text, { selected: useJarvis.getState().selected, lang: opts.lang });
    s.log("search", `Searched knowledge graph — intent: ${result.intent}`);
    if (result.nodes.length) s.log("result", `Found ${result.nodes.length} related node${result.nodes.length === 1 ? "" : "s"}`);

    if (result.create) {
      s.setHud("executing", `Saving ${result.create.category}`);
      await wait(280);
      const node = createNode(result.create.category, result.create.label, result.create.content, result.create.links);
      s.log("memory", `Created ${result.create.category} “${node.label}”${result.create.links.length ? ` linked to ${result.create.links.length} node(s)` : ""}`);
      result.nodes = [node.id, ...result.create.links];
      result.anchors = [node.id];
    }

    applyResult(result);

    const lang = result.lang ?? detectLang(text);
    let answer = result.answer;
    let brain = "demo brain";
    // Saving a memory/task/note is done locally (deterministic); Claude answers everything else.
    if (useJarvis.getState().status.mode === "ai" && !result.create) {
      s.setHud("thinking", "Asking Claude");
      s.log("ai", "Asking Claude");
      const id = s.addMessage("jarvis", "");
      try {
        answer = await streamChat(text, result, lang, (partial) => useJarvis.getState().updateMessage(id, partial));
        brain = "Claude";
      } catch (err) {
        s.log("error", `${(err as Error).message} — answered from local knowledge`);
        answer = result.answer;
      }
      useJarvis.getState().updateMessage(id, answer);
    } else {
      if (result.intent === "needs-ai") s.log("system", "Needs Claude: add ANTHROPIC_API_KEY to .env.local. Answered from local knowledge");
      s.addMessage("jarvis", answer);
    }
    saveChat();

    s.log("ai", `JARVIS responded (${brain})`);
    s.setHud("speaking", "Responding");
    if (useJarvis.getState().voiceReplies) {
      const voice = await say(answer, lang);
      s.log("system", voice ? `Spoke reply — voice: ${voice}` : "This browser has no speech output; reply shown as text");
    } else await wait(Math.min(2400, 700 + answer.length * 12));
    return result;
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    s.log("error", `JARVIS error: ${msg}`);
    s.addMessage("jarvis", `Something went wrong: ${msg}`);
    saveChat();
    s.setHud("error", msg);
    await wait(1800);
    return null;
  } finally {
    busy = false;
    if (useJarvis.getState().hud !== "listening") useJarvis.getState().setHud("idle");
  }
}

/** Reflect a query result in the graph (focus / path / open). */
export function applyResult(r: QueryResult) {
  const s = useJarvis.getState();
  if (r.open?.startsWith("page:")) {
    navigate(`/${r.open.slice(5)}`);
    return;
  }
  if (r.path && r.path.length > 1) {
    s.select(r.path[0]);
    s.setFocus({ kind: "path", nodes: r.path });
    graphCommands.focusNodes(r.path);
    return;
  }
  if (r.open) {
    s.select(r.open);
    s.openViewer(r.open);
    graphCommands.centerOn(r.open);
    return;
  }
  if (r.nodes.length) {
    // Un-hide categories the answer lives in, so results are never invisible.
    const graph = getGraph();
    const needed = new Set(r.nodes.map((id) => graph.getNodeAttribute(id, "category")));
    if (s.hidden.some((h) => needed.has(h))) s.setHidden(s.hidden.filter((h) => !needed.has(h)));
    if (r.anchors.length === 1) {
      s.select(r.anchors[0]);
    }
    s.setFocus({ kind: "query", nodes: r.nodes, anchors: r.anchors, label: r.answer });
    graphCommands.focusNodes(r.nodes);
  }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export function createNode(category: KGNode["category"], label: string, content: string, links: string[]): KGNode {
  const graph = getGraph();
  const now = new Date().toISOString();
  const node: KGNode = {
    id: `${category}-${slug(label)}-${Date.now().toString(36)}`,
    label,
    category,
    description: content,
    content,
    importance: category === "memory" ? 0.45 : 0.4,
    tags: [category, "created by jarvis"],
    source: "JARVIS (local)",
    updatedAt: now,
    metadata: category === "task" ? { status: "open" } : undefined,
  };
  addNodeToGraph(graph, node, links[0]);
  const relation = category === "task" ? "RELATED_TO" : "MENTIONS";
  const edges: KGEdge[] = links.map((target) => ({
    id: `${node.id}|${relation}|${target}`,
    source: node.id,
    target,
    relation,
    weight: 0.6,
  }));
  if (!links.length && graph.hasNode("izzatillo")) {
    edges.push({ id: `${node.id}|RELATED_TO|izzatillo`, source: node.id, target: "izzatillo", relation: "RELATED_TO", weight: 0.4 });
  }
  for (const e of edges) addEdgeToGraph(graph, e);
  refreshSizes(graph);
  if (!persistLocal(node, edges)) useJarvis.getState().log("error", "Could not persist locally (browser storage unavailable)");
  useJarvis.getState().bumpGraph();
  return node;
}
