import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { runClaudeAgent } from "@/ai/claude";
import type { ChatRequest } from "@/ai/chat-types";
import { GeminiError, runGeminiAgent } from "@/ai/gemini";
import type { ChatEvent } from "@/ai/tools";

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
