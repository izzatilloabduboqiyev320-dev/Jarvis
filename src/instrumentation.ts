/** Runs once when the JARVIS server starts: resumes the Telegram assistant and price alerts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAssistant } = await import("@/server/telegram-assistant");
  startAssistant();
  const { startAlertWatcher } = await import("@/server/market");
  startAlertWatcher();
}
