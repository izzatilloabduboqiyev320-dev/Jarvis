import "server-only";
import { getAIConfig } from "@/ai/config";
import type { ChatRequest } from "@/ai/chat-types";
import { systemPrompt } from "@/ai/claude";
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

/** Streams a Gemini chat reply as plain text chunks (used when no Claude key is set). */
export async function* streamGemini(req: ChatRequest, signal: AbortSignal): AsyncGenerator<string> {
  const { geminiModel } = getAIConfig();
  const res = await post(
    `/v1beta/models/${encodeURIComponent(geminiModel)}:streamGenerateContent?alt=sse`,
    {
      systemInstruction: { parts: [{ text: systemPrompt(req) }] },
      contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 1024 },
    },
    signal,
  );
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const j = JSON.parse(line.slice(5)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
        if (t) yield t;
      } catch {
        /* partial or keep-alive line */
      }
    }
  }
}
