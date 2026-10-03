import { getAIConfig } from "@/ai/config";

/**
 * GET /api/status — what the UI needs to know about the backend.
 * Only booleans/labels leave the server; keys never do.
 */
export function GET() {
  const ai = getAIConfig();
  return Response.json({
    mode: ai.hasAnthropicKey ? "ai" : "demo",
    model: ai.modelLabel,
    voiceOutput: ai.hasElevenLabsKey ? "elevenlabs" : "browser",
  });
}
