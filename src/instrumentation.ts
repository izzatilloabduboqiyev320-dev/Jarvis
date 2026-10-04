/** Runs once when the JARVIS server starts: resumes the Telegram assistant and price alerts, then prints the start-up report. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAssistant } = await import("@/server/telegram-assistant");
  startAssistant();
  const { startAlertWatcher } = await import("@/server/market");
  startAlertWatcher();
  // In the background: the server must not wait for network checks before it is ready.
  const { runBootChecks } = await import("@/server/boot");
  void runBootChecks().catch((err) => console.error("[ERROR] start-up checks failed:", err instanceof Error ? err.message : err));
}
