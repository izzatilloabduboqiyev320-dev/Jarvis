/** Runs once when the JARVIS server starts: resumes the Telegram assistant if one is set up. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAssistant } = await import("@/server/telegram-assistant");
  startAssistant();
}
