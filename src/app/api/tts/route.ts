import { getAIConfig } from "@/ai/config";
import { GeminiError, geminiSpeech } from "@/ai/gemini";
import { isLocalRequest } from "@/ai/key-store";

/**
 * POST /api/tts {text} → audio/wav spoken by Gemini.
 * 503 when no GEMINI_API_KEY is set (the client then uses the browser voice).
 */
export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ message: "Local use only" }, { status: 403 });
  if (!getAIConfig().hasGeminiKey) return Response.json({ error: "no_key" }, { status: 503 });
  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim().slice(0, 1500) : "";
  } catch {
    /* invalid JSON */
  }
  if (!text) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    const audio = await geminiSpeech(text, request.signal);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/tts]", err instanceof Error ? err.message : err);
    const status = err instanceof GeminiError ? err.status : 502;
    return Response.json({ error: "upstream", message: status === 401 || status === 403 ? "The Gemini API key is invalid" : "Gemini voice unavailable" }, { status: 502 });
  }
}
