import "server-only";

/**
 * Server-side AI configuration, read from environment variables (.env.local).
 * This module is server-only: importing it from a client component fails the
 * build, so API keys can never reach the browser.
 */
export function getAIConfig() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.JARVIS_MODEL?.trim() || "claude-sonnet-5-5";
  return {
    hasAnthropicKey: Boolean(anthropicKey),
    hasElevenLabsKey: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    model,
    modelLabel: "CLAUDE",
  };
}
