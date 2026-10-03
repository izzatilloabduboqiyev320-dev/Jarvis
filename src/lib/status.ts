"use client";

import { useJarvis, type AppStatus } from "@/lib/store";

/** Asks the server whether Claude is configured (it answers with booleans and labels only). */
export async function refreshStatus(): Promise<AppStatus | null> {
  const s = useJarvis.getState();
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    const status = (await res.json()) as AppStatus;
    s.setStatus(status);
    s.log(
      "system",
      status.mode === "demo" ? "DEMO MODE — no Claude API key; using the local brain" : "Claude connected — chat answers come from Claude",
    );
    return status;
  } catch {
    s.log("error", "JARVIS AI service unavailable.");
    return null;
  }
}
