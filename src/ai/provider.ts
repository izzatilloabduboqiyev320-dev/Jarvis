import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { runClaudeAgent } from "@/ai/claude";
import type { ChatRequest } from "@/ai/types";
import { getAIConfig } from "@/ai/config";
import { retrieveContext } from "@/ai/context";
import { GeminiError, runGeminiAgent } from "@/ai/gemini";
import type { ChatEvent } from "@/ai/tools";
import { logActivity, type ActivityKind } from "@/server/activity";
import { appendTurns } from "@/server/conversations";

/**
 * JARVIS's request pipeline on the server, for the app and Telegram alike:
 *
 *   receive → search memory + graph (only what's relevant) → AI with tools
 *   (approval for outside actions) → save the conversation → log every step.
 *
 * Streams events through `emit`; returns which AI answered and the reply.
 */
export async function runJarvis(req: ChatRequest, signal: AbortSignal, emit: (e: ChatEvent) => void): Promise<{ provider: "claude" | "gemini"; text: string }> {
  const provider = getAIConfig().chatProvider;
  if (!provider) throw new Error("No AI key is set");
  const channel = req.channel ?? "app";
  const act = (kind: ActivityKind, text: string) => {
    emit({ t: "activity", kind, text });
    void logActivity(kind, text, channel);
  };
  const users = req.messages.filter((m) => m.role === "user");
  const question = users[users.length - 1]?.content ?? "";
  act("user", `Received request: “${question.slice(0, 120)}”`);

  act("search", "Searching memory and knowledge graph");
  // The previous question helps follow-ups like "and what about the second one?".
  const found = await retrieveContext(users.slice(-2).map((m) => m.content).join("\n"));
  act(
    "result",
    found.overview ? "Nothing related found, using the graph overview" : `Found ${found.memories.length} relevant memor${found.memories.length === 1 ? "y" : "ies"} and ${found.nodes.length} related item${found.nodes.length === 1 ? "" : "s"}`,
  );
  // Items the screen already matched (client hints) are added after the server's own results.
  const base = found.overview && req.context.nodes.length ? [] : found.nodes;
  const seen = new Set(base.map((n) => n.label));
  const nodes = [...base, ...req.context.nodes.filter((n) => !seen.has(n.label))].slice(0, 20);
  const request: ChatRequest = { ...req, context: { ...req.context, memories: found.memories, nodes } };

  const name = provider === "claude" ? "Claude" : "Gemini";
  act("ai", `Asking ${name}`);
  let text = "";
  const relay = (e: ChatEvent) => {
    if (e.t === "text") text += e.v;
    else if (e.t === "tool") void logActivity("tool", e.summary, channel);
    else if (e.t === "created") void logActivity("memory", `Saved ${e.node.category} “${e.node.label}”`, channel);
    else if (e.t === "approval") void logActivity("system", `Waiting for approval: ${e.summary}`, channel);
    else if (e.t === "approval-done") void logActivity(e.approved ? "system" : "error", e.approved ? "User approved" : e.reason === "timeout" ? "No answer, cancelled" : "User declined", channel);
    emit(e);
  };
  try {
    const used = await runAgent(provider, request, signal, relay);
    text = text.trim();
    act("ai", `${used === "claude" ? "Claude" : "Gemini"} reasoning complete, response generated`);
    await appendTurns(channel, [{ role: "user", content: req.voice ? `🎙 ${question}` : question }, { role: "assistant", content: text }]);
    return { provider: used, text };
  } catch (err) {
    if (signal.aborted) act("system", "Request cancelled");
    else act("error", explainAIError(err));
    // A failed request is saved only if JARVIS had started answering; an unanswered question would otherwise merge into the next one.
    if (text.trim()) await appendTurns(channel, [{ role: "user", content: question }, { role: "assistant", content: text.trim() }]);
    throw err;
  }
}

/**
 * Runs JARVIS's AI: Claude when its key is set, otherwise Gemini. If Claude
 * fails before saying anything (no credit, bad key, overloaded…) and a Gemini
 * key exists, Gemini answers instead, so JARVIS keeps working.
 */

/** Why the AI failed, in plain Uzbek (shown in Telegram and the app's activity log). */
export function explainAIError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const msg = String(err.message).toLowerCase();
    if (msg.includes("credit balance")) return "Claude hisobida mablag' yo'q: console.anthropic.com → Billing'da hisobni to'ldiring";
    if (err.status === 401) return "Claude kaliti noto'g'ri yoki o'chirilgan";
    if (err.status === 403) return "Claude kalitiga ruxsat yo'q (Scope: Default workspace bo'lishi kerak)";
    if (err.status === 429) return "Claude limiti tugadi, bir daqiqa kuting";
    if (err.status === 529 || (err.status ?? 0) >= 500) return "Claude hozir band, birozdan keyin urinib ko'ring";
    return `Claude xatosi: ${err.message.slice(0, 120)}`;
  }
  if (err instanceof GeminiError) {
    if (err.status === 400 || err.status === 401 || err.status === 403) return "Gemini kaliti noto'g'ri";
    if (err.status === 429) return "Gemini bepul limiti tugadi, birozdan keyin urinib ko'ring";
    return "Gemini hozir javob bermadi";
  }
  return "AI bilan bog'lanib bo'lmadi (internetni tekshiring)";
}

export async function runAgent(provider: "claude" | "gemini", req: ChatRequest, signal: AbortSignal, emit: (e: ChatEvent) => void): Promise<"claude" | "gemini"> {
  if (provider === "gemini") {
    await runGeminiAgent(req, signal, emit);
    return "gemini";
  }
  let started = false;
  try {
    await runClaudeAgent(req, signal, (e) => {
      started = true;
      emit(e);
    });
    return "claude";
  } catch (err) {
    if (started || signal.aborted || !process.env.GEMINI_API_KEY?.trim()) throw err;
    console.error(`[jarvis ai] Claude failed (${explainAIError(err)}); answering with Gemini`);
    emit({ t: "tool", name: "fallback", summary: `Claude: ${explainAIError(err)} — Gemini javob beryapti` });
    await runGeminiAgent(req, signal, emit);
    return "gemini";
  }
}
