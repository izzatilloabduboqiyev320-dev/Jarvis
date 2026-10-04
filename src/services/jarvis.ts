"use client";

import { CHAT_LIMITS, type ChatRequest, type ChatTurn, type ContextNode } from "@/ai/types";
import type { ChatEvent } from "@/ai/tools";
import { addEdgeToGraph, addNodeToGraph, refreshSizes, topHubs } from "@/knowledge/graph";
import { buildItem, type ItemCategory } from "@/knowledge/items";
import { detectLang } from "@/knowledge/uzbek";
import { runQuery, type QueryResult } from "@/knowledge/query";
import { graphCommands } from "@/lib/graph-commands";
import { getGraph, persistLocal } from "@/lib/graph-instance";
import { CHAT_KEY, useJarvis, type ActivityKind } from "@/lib/store";
import { speak, speakGemini } from "@/voice/speak";
import { startPushToTalk } from "@/voice/push-to-talk";
import type { KGEdge, KGNode } from "@/types/graph";

/**
 * JARVIS request pipeline.
 *
 *   understand intent → search graph → (AI with tools | local brain) → respond → speak
 *
 * With an AI key, Claude or Gemini answers via /api/chat and acts on the graph
 * through server-side tools (search, save memory/task/note…); without one, the
 * local brain answers. Every step is written to the activity stream.
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
  // The saved conversation is archived on the server, and a new one starts.
  void fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json", "x-jarvis-local": "1" }, body: JSON.stringify({ action: "new" }) }).catch(() => {});
}

/** In AI mode the conversation saved on this computer is the source of truth (it survives browser changes). */
export async function loadSavedConversation() {
  try {
    const j = (await fetch("/api/conversations").then((r) => r.json())) as { current?: { messages: { role: "user" | "assistant"; content: string; ts: number }[] } };
    const saved = j.current?.messages ?? [];
    if (!saved.length) return;
    useJarvis.getState().setMessages(
      saved.slice(-50).map((m, i) => ({ id: i + 1, role: m.role === "user" ? "user" : "jarvis", text: m.content, ts: m.ts })),
    );
    saveChat();
  } catch {
    /* keep the copy in this browser */
  }
}

/** Earlier activity from the server log, so the panel shows what JARVIS did before this page opened. */
export async function loadActivity() {
  try {
    const j = (await fetch("/api/activity").then((r) => r.json())) as { entries?: { ts: number; kind: ActivityKind; text: string; channel?: string }[] };
    const items = (j.entries ?? []).slice(-60).map((e) => ({ ts: e.ts, kind: e.kind, text: e.channel === "telegram" ? `Telegram: ${e.text}` : e.text }));
    if (items.length) useJarvis.getState().seedActivity(items);
  } catch {
    /* the log is optional */
  }
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

/** Adds an item the server saved to the on-screen graph. */
function mergeItem(node: KGNode, edges: KGEdge[]) {
  const graph = getGraph();
  if (!graph.hasNode(node.id)) addNodeToGraph(graph, node, edges[0]?.target);
  for (const e of edges) addEdgeToGraph(graph, e);
  refreshSizes(graph);
  useJarvis.getState().bumpGraph();
}

/** Adds or refreshes server items (e.g. Telegram bots) on the on-screen graph; `drop` removes ids no longer present. */
export function syncNodes(nodes: KGNode[], edges: KGEdge[], drop: string[] = []) {
  const graph = getGraph();
  for (const id of drop) if (graph.hasNode(id)) graph.dropNode(id);
  for (const n of nodes) {
    if (graph.hasNode(n.id)) {
      graph.setNodeAttribute(n.id, "node", n);
      graph.setNodeAttribute(n.id, "label", n.label);
    } else {
      const link = edges.find((e) => e.source === n.id || e.target === n.id);
      addNodeToGraph(graph, n, link && (link.source === n.id ? link.target : link.source));
    }
  }
  for (const e of edges) if (graph.hasNode(e.source) && graph.hasNode(e.target)) addEdgeToGraph(graph, e);
  refreshSizes(graph);
  useJarvis.getState().bumpGraph();
}

/** Highlights what the AI is talking about. */
function focusIds(ids: string[], path?: boolean) {
  const graph = getGraph();
  const list = ids.filter((id) => graph.hasNode(id));
  if (!list.length) return;
  applyResult({ intent: "topic", answer: "", nodes: list, anchors: [list[0]], path: path ? list : undefined });
}

// ── Approvals ("Ha / Yo'q") ─────────────────────────────────────────────

let stopVoiceAnswer: (() => void) | null = null;
/** The JARVIS reply currently streaming (approval cards attach to it). */
let replyId: number | undefined;

/** Sends the user's answer to a pending computer action. */
export async function answerApproval(id: string, approved: boolean) {
  stopVoiceAnswer?.();
  await fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json", "x-jarvis-local": "1" }, body: JSON.stringify({ id, approved }) }).catch(
    () => useJarvis.getState().log("error", "Could not send the answer"),
  );
}

const NO = /(yo'?q|yoq|no\b|kerak emas|bekor|to'xta|stop|cancel)/i;
const YES = /(\bha+\b|\bxa\b|mayli|ruxsat|yes|ok(ay)?\b|albatta|bo'ladi|roziman|\boch\b|davom)/i;

/** Shows the card; in conversation mode also asks aloud and listens for "ha" / "yo'q". */
async function askApproval(id: string, summary: string) {
  const s = useJarvis.getState();
  s.addApproval(id, summary, replyId);
  s.setHud("executing", "Ruxsat kutilmoqda");
  s.log("system", `Waiting for your approval: ${summary}`);
  if (!s.talking) return;
  const uz = s.voiceLang === "uz-UZ";
  await say(uz ? `Ruxsat berasizmi? ${summary}.` : `May I? ${summary}.`, uz ? "uz" : "en");
  if (useJarvis.getState().approvals.find((a) => a.id === id)?.status !== "pending") return;
  stopVoiceAnswer = startPushToTalk(
    {
      onFinal: (text) => {
        const t = text.toLowerCase().replace(/[’‘ʻʼ`]/g, "'");
        if (NO.test(t)) void answerApproval(id, false);
        else if (YES.test(t)) void answerApproval(id, true);
        else useJarvis.getState().log("system", `Heard “${text}” — press Ha or Yo'q`);
      },
      onError: () => {},
      onEnd: () => {
        stopVoiceAnswer = null;
      },
    },
    s.voiceLang,
  );
}

/** Runs the AI via /api/chat (NDJSON events); throws with a readable message on failure. */
async function streamChat(result: QueryResult, lang: "en" | "uz", onPartial: (t: string) => void): Promise<string> {
  const s = useJarvis.getState();
  const history: ChatTurn[] = s.messages
    .filter((m) => m.text)
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
  let buf = "";
  const handle = (line: string) => {
    if (!line.trim()) return;
    let e: ChatEvent;
    try {
      e = JSON.parse(line) as ChatEvent;
    } catch {
      return;
    }
    if (e.t === "text") {
      out += e.v;
      onPartial(out.trim());
    } else if (e.t === "tool") {
      s.log("tool", e.summary);
      s.setHud("executing", e.summary.slice(0, 40));
    } else if (e.t === "created") {
      mergeItem(e.node, e.edges);
      s.log("memory", `Saved ${e.node.category} “${e.node.label}” (permanent)`);
    } else if (e.t === "activity") {
      if (e.kind !== "user") s.log(e.kind, e.text); // the request itself is already logged here
    } else if (e.t === "updated") syncNodes([e.node], e.edges ?? []);
    else if (e.t === "focus") focusIds(e.ids, e.path);
    else if (e.t === "approval") void askApproval(e.id, e.summary);
    else if (e.t === "approval-done") {
      stopVoiceAnswer?.();
      s.setApproval(e.id, e.approved ? "approved" : e.reason ? "expired" : "denied");
      const what = useJarvis.getState().approvals.find((a) => a.id === e.id)?.summary ?? "";
      s.log(e.approved ? "system" : "error", `${e.approved ? "Approved" : e.reason === "timeout" ? "No answer — cancelled" : "Declined"}: ${what}`);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buf);
  out = out.trim();
  if (!out) throw new Error("The AI returned an empty reply");
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

    const aiMode = useJarvis.getState().status.mode === "ai";
    // With an AI brain, the AI decides what to save (via tools); the local parser only saves in demo mode.
    if (result.create && !aiMode) {
      s.setHud("executing", `Saving ${result.create.category}`);
      const node = await createNode(result.create.category, result.create.label, result.create.content, result.create.links);
      s.log("memory", `Created ${result.create.category} “${node.label}”${result.create.links.length ? ` linked to ${result.create.links.length} node(s)` : ""}`);
      result.nodes = [node.id, ...result.create.links];
      result.anchors = [node.id];
    }

    if (aiMode && result.open && !result.open.startsWith("page:")) {
      // "…ni och" may mean the app on the computer: the AI decides; just highlight the item.
      applyResult({ ...result, open: undefined, nodes: result.nodes.length ? result.nodes : [result.open], anchors: [result.open] });
    } else if (!(aiMode && result.create)) applyResult(result);

    const lang = result.lang ?? detectLang(text);
    let answer = result.answer;
    let brain = "demo brain";
    if (aiMode) {
      const name = useJarvis.getState().status.model === "GEMINI" ? "Gemini" : "Claude";
      s.setHud("thinking", `Asking ${name}`);
      const id = s.addMessage("jarvis", "");
      replyId = id;
      try {
        answer = await streamChat(result, lang, (partial) => useJarvis.getState().updateMessage(id, partial));
        brain = name;
      } catch (err) {
        s.log("error", `${(err as Error).message} — answered from local knowledge`);
        answer = result.answer;
      }
      useJarvis.getState().updateMessage(id, answer);
    } else {
      if (result.intent === "needs-ai") s.log("system", "Needs an AI key (Settings → Gemini or Claude). Answered from local knowledge");
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

/** Saves a memory/task/note permanently on this computer (falls back to browser storage). */
export async function createNode(category: ItemCategory, label: string, content: string, links: string[]): Promise<KGNode> {
  try {
    const res = await fetch("/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, label, content, links }) });
    if (!res.ok) throw new Error(String(res.status));
    const { node, edges } = (await res.json()) as { node: KGNode; edges: KGEdge[] };
    mergeItem(node, edges);
    return node;
  } catch {
    const graph = getGraph();
    const { node, edges } = buildItem({ category, label, content, links }, (id) => graph.hasNode(id), "JARVIS (browser)");
    mergeItem(node, edges);
    if (!persistLocal(node, edges)) useJarvis.getState().log("error", "Could not save (server and browser storage unavailable)");
    else useJarvis.getState().log("error", "Server storage unavailable — saved in this browser only");
    return node;
  }
}

/** Marks a task JARVIS saved as done (or open again). */
export async function setTaskDone(id: string, done: boolean) {
  const s = useJarvis.getState();
  const res = await fetch(`/api/items/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: done ? "done" : "open" }) });
  if (!res.ok) return s.log("error", "Could not update the task");
  const { node } = (await res.json()) as { node: KGNode };
  const graph = getGraph();
  if (graph.hasNode(id)) graph.setNodeAttribute(id, "node", node);
  s.bumpGraph();
  s.log("memory", `Task “${node.label}” ${done ? "done" : "reopened"}`);
}

/** Deletes an item JARVIS saved (the UI asks first). */
export async function deleteItem(id: string) {
  const s = useJarvis.getState();
  const res = await fetch(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) return s.log("error", "Could not delete this item");
  const graph = getGraph();
  const label = graph.hasNode(id) ? graph.getNodeAttribute(id, "label") : id;
  if (graph.hasNode(id)) graph.dropNode(id);
  refreshSizes(graph);
  s.clearFocus();
  s.bumpGraph();
  s.log("memory", `Deleted “${label}”`);
}

const ALERTS_SEEN_KEY = "jarvis.alerts-seen.v1";

/** Announces price alerts that fired since the last check (chat, activity, voice). */
export async function checkFiredAlerts() {
  let seen = "";
  try {
    seen = localStorage.getItem(ALERTS_SEEN_KEY) ?? "";
    // First run on this browser: start from now, don't replay old alerts.
    if (!seen) localStorage.setItem(ALERTS_SEEN_KEY, (seen = new Date().toISOString()));
  } catch {
    seen ||= new Date(Date.now() - 60_000).toISOString();
  }
  const j = (await fetch("/api/alerts", { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => null)) as { alerts?: { triggeredAt?: string; triggeredPrice?: number; text: string }[] } | null;
  const fired = (j?.alerts ?? []).filter((a) => a.triggeredAt && a.triggeredAt > seen);
  if (!fired.length) return;
  try {
    localStorage.setItem(ALERTS_SEEN_KEY, fired.map((a) => a.triggeredAt!).sort().pop()!);
  } catch {
    /* ignore */
  }
  const s = useJarvis.getState();
  for (const a of fired) {
    const text = `🔔 Narx ogohlantirishi: ${a.text}. Hozirgi narx: ${a.triggeredPrice}`;
    s.log("system", text);
    s.addMessage("jarvis", text);
  }
  saveChat();
  if (s.voiceReplies && !busy) {
    const uz = s.voiceLang === "uz-UZ";
    await say(fired.map((a) => `${uz ? "Diqqat! " : "Alert: "}${a.text.replace(/≥/g, uz ? "dan yuqori" : "above").replace(/≤/g, uz ? "dan past" : "below")}`).join(". "), uz ? "uz" : "en");
  }
}
