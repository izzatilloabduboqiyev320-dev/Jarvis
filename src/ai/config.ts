import "server-only";

/**
 * Server-side AI configuration, read from environment variables (.env.local).
 * This module is server-only: importing it from a client component fails the
 * build, so API keys can never reach the browser.
 */
export function getAIConfig() {
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  // Claude is the brain when its key is set; Gemini answers when only its key is set.
  const chatProvider: "claude" | "gemini" | null = hasAnthropicKey ? "claude" : hasGeminiKey ? "gemini" : null;
  return {
    hasAnthropicKey,
    hasGeminiKey,
    hasElevenLabsKey: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    chatProvider,
    model: process.env.JARVIS_MODEL?.trim() || "claude-sonnet-5-5",
    geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
    geminiTtsModel: process.env.GEMINI_TTS_MODEL?.trim() || "gemini-3.8-flash-lite-tts",
    geminiVoice: process.env.GEMINI_VOICE?.trim() || "Charon",
    modelLabel: chatProvider === "gemini" ? "GEMINI" : "CLAUDE",
  };
}
