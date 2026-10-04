import Anthropic from "@anthropic-ai/sdk";
import { streamClaude } from "@/ai/claude";
import { GeminiError, streamGemini } from "@/ai/gemini";
import { isLocalRequest } from "@/ai/key-store";
import { getAIConfig } from "@/ai/config";
import { CHAT_LIMITS, type ChatRequest, type ChatTurn, type ContextNode } from "@/ai/chat-types";

/**
 * POST /api/chat — streams JARVIS's reply (Claude, or Gemini when only its key is set) as plain text.
 * 503 when no AI key is set (the client then uses the local brain).
 */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function parse(body: unknown): ChatRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages)) return null;

  // Claude needs alternating turns starting with the user: merge repeats, drop leading replies.
  const messages: ChatTurn[] = [];
  for (const m of b.messages.slice(-CHAT_LIMITS.messages)) {
    const role = (m as ChatTurn)?.role;
    const content = str((m as ChatTurn)?.content, CHAT_LIMITS.messageChars).trim();
    if ((role !== "user" && role !== "assistant") || !content) continue;
    if (!messages.length && role !== "user") continue;
    const last = messages[messages.length - 1];
    if (last?.role === role) last.content += `\n\n${content}`;
    else messages.push({ role, content });
  }
  if (!messages.length || messages[messages.length - 1].role !== "user") return null;

  const ctx = (b.context ?? {}) as Record<string, unknown>;
  const nodes: ContextNode[] = (Array.isArray(ctx.nodes) ? ctx.nodes : []).slice(0, CHAT_LIMITS.nodes).map((n) => {
    const o = (n ?? {}) as Record<string, unknown>;
    return {
      label: str(o.label, 120),
      category: str(o.category, 40),
      description: str(o.description, CHAT_LIMITS.fieldChars) || undefined,
      updated: str(o.updated, 40) || undefined,
      links: Array.isArray(o.links) ? o.links.slice(0, CHAT_LIMITS.links).map((l) => str(l, 120)).filter(Boolean) : undefined,
    };
  });

  return {
    messages,
    lang: b.lang === "uz" ? "uz" : "en",
    context: {
      nodes: nodes.filter((n) => n.label),
      selected: str(ctx.selected, 120) || undefined,
      localAction: str(ctx.localAction, 300) || undefined,
    },
  };
}

// Simple per-process limit so a stuck client can't burn through API credit.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
let windowStart = 0;
let count = 0;

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ error: "forbidden", message: "Local use only" }, { status: 403 });
  const provider = getAIConfig().chatProvider;
  if (!provider) {
    return Response.json({ error: "no_key", message: "No AI key is set" }, { status: 503 });
  }

  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    count = 0;
  }
  if (++count > MAX_PER_WINDOW) {
    return Response.json({ error: "rate_limited", message: "Too many requests, wait a minute" }, { status: 429 });
  }

  let req: ChatRequest | null = null;
  try {
    req = parse(await request.json());
  } catch {
    /* invalid JSON */
  }
  if (!req) return Response.json({ error: "bad_request", message: "Invalid chat request" }, { status: 400 });

  const iterator = provider === "claude" ? streamClaude(req, request.signal) : streamGemini(req, request.signal);
  // Pull the first chunk before responding so auth/model errors become a proper status code.
  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (err) {
    const status = err instanceof Anthropic.APIError && err.status ? err.status : err instanceof GeminiError ? (err.status === 403 || err.status === 400 ? 401 : err.status) : 502;
    const message =
      status === 401
        ? `The ${provider === "claude" ? "Claude" : "Gemini"} API key is invalid`
        : status === 404
          ? `The configured model was not found (check ${provider === "claude" ? "JARVIS_MODEL" : "GEMINI_MODEL"})`
          : status === 429
            ? "AI rate limit reached"
            : "JARVIS AI service unavailable";
    console.error("[api/chat]", err instanceof Error ? err.message : err);
    return Response.json({ error: "upstream", message }, { status: status === 401 ? 401 : 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        for (let r = await iterator.next(); !r.done; r = await iterator.next()) controller.enqueue(encoder.encode(r.value));
      } catch (err) {
        console.error("[api/chat] stream", err instanceof Error ? err.message : err);
      } finally {
        controller.close();
      }
    },
    cancel() {
      void iterator.return?.(undefined);
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
