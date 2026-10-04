import "server-only";
import { getAIConfig } from "@/ai/config";
import type { ChatRequest } from "@/ai/chat-types";
import { MAX_ROUNDS, systemPrompt } from "@/ai/claude";
import { runTool, TOOL_SPECS, type ChatEvent } from "@/ai/tools";
import type { Verify } from "@/ai/key-route";

/**
 * Google Gemini provider: natural speech (TTS, including Uzbek) and, when no
 * Claude key is set, the chat brain. Server-only; the key never reaches the browser.
 */

const base = () => (process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
const key = () => process.env.GEMINI_API_KEY?.trim() ?? "";

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(`Gemini ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }
  return res;
}

/** Free call (lists models) to check a key before saving it. */
export const verifyGeminiKey: Verify = async (k) => {
  try {
    const res = await fetch(`${base()}/v1beta/models?pageSize=1`, { headers: { "x-goog-api-key": k } });
    if (res.ok) return "ok";
    return res.status === 400 || res.status === 401 || res.status === 403 ? "invalid" : "unverified";
  } catch {
    return "unverified";
  }
};

// ── Speech ────────────────────────────────────────────────────────────

/** 16-bit mono PCM → WAV, for APIs that return raw samples. */
function wav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function findAudio(json: unknown): string | null {
  // Interactions API: steps[].content[].data; generateContent: candidates[].content.parts[].inlineData.data
  const j = json as {
    steps?: { content?: { data?: string }[] }[];
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  for (const s of j.steps ?? []) for (const c of s.content ?? []) if (c.data) return c.data;
  for (const c of j.candidates ?? []) for (const p of c.content?.parts ?? []) if (p.inlineData?.data) return p.inlineData.data;
  return null;
}

const STYLE = "calm, confident, warm personal assistant; natural native pronunciation of the language the text is in";

/** Returns a WAV file of `text` spoken by Gemini. */
export async function geminiSpeech(text: string, signal?: AbortSignal): Promise<Buffer> {
  const { geminiTtsModel: model, geminiVoice: voice } = getAIConfig();
  let json: unknown;
  try {
    const res = await post(
      "/v1beta/interactions",
      {
        model,
        input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: STYLE }] }] }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice }] },
      },
      signal,
    );
    json = await res.json();
  } catch (err) {
    // Older endpoint, for models or regions without the Interactions API.
    if (!(err instanceof GeminiError) || ![400, 404].includes(err.status)) throw err;
    const res = await post(
      `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        contents: [{ parts: [{ text: `Say this in a ${STYLE} voice:\n${text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      },
      signal,
    );
    json = await res.json();
  }
  const b64 = findAudio(json);
  if (!b64) throw new GeminiError("Gemini returned no audio", 502);
  const audio = Buffer.from(b64, "base64");
  return audio.subarray(0, 4).toString("ascii") === "RIFF" ? audio : wav(audio);
}

// ── Chat ──────────────────────────────────────────────────────────────

/**
 * Each Gemini model has its own free daily limit, so when one is used up (429)
 * the request moves on to a lighter model instead of failing.
 */
const BACKUP_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"];

async function generate(model: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const models = [model, ...BACKUP_MODELS.filter((m) => m !== model)];
  let last: unknown;
  for (const [i, m] of models.entries()) {
    try {
      return await post(`/v1beta/models/${encodeURIComponent(m)}:generateContent`, body, signal);
    } catch (err) {
      if (!last) last = err; // report the first model's limit, not a later 404
      // Only a used-up limit moves on; a missing backup model (404) is skipped too.
      const s = err instanceof GeminiError ? err.status : 0;
      if (s !== 429 && !(i > 0 && s === 404)) throw err;
    }
  }
  throw last;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  [k: string]: unknown;
}
interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

/** Runs Gemini with JARVIS's tools until it answers (used when no Claude key is set). */
export async function runGeminiAgent(req: ChatRequest, signal: AbortSignal, emit: (e: ChatEvent) => void): Promise<void> {
  const { geminiModel } = getAIConfig();
  const contents: GeminiContent[] = req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const tools = [{ functionDeclarations: TOOL_SPECS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await generate(
      geminiModel,
      {
        systemInstruction: { parts: [{ text: systemPrompt(req) }] },
        contents,
        ...(round < MAX_ROUNDS - 1 ? { tools } : {}),
        generationConfig: { maxOutputTokens: 1024 },
      },
      signal,
    );
    const json = (await res.json()) as { candidates?: { content?: GeminiContent }[] };
    const content = json.candidates?.[0]?.content;
    if (!content?.parts?.length) throw new GeminiError("Gemini returned an empty answer", 502);
    const text = content.parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("");
    const calls = content.parts.filter((p) => p.functionCall);
    if (text) emit({ t: "text", v: calls.length ? text + "\n\n" : text });
    if (!calls.length) return;
    // Send the model's turn back unchanged (it may carry thought signatures Gemini needs).
    contents.push({ role: "model", parts: content.parts });
    const responses: GeminiPart[] = [];
    for (const p of calls) {
      const call = p.functionCall!;
      let response: Record<string, unknown>;
      try {
        response = { result: await runTool(call.name, call.args ?? {}, emit, signal) };
      } catch (err) {
        response = { error: (err as Error).message };
      }
      responses.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response } });
    }
    contents.push({ role: "user", parts: responses });
  }
}

/** Speech-to-text for Telegram voice messages (OGG/Opus), Uzbek or English. */
export async function transcribe(audio: Buffer, mime: string, signal?: AbortSignal): Promise<string> {
  const { geminiModel } = getAIConfig();
  const res = await generate(
    geminiModel,
    {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mime, data: audio.toString("base64") } },
            { text: "Transcribe this voice message exactly as spoken (usually Uzbek in Latin script, sometimes English or Russian). Reply with the transcript only." },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 1024 },
    },
    signal,
  );
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  return (json.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();
}
