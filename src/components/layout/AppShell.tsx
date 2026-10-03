"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import CommandPalette from "@/components/jarvis/CommandPalette";
import ItemViewer from "@/components/jarvis/ItemViewer";
import NavRail from "@/components/layout/NavRail";
import { loadGraph } from "@/lib/graph-instance";
import { useJarvis, VOICE_LANG_KEY, VOICE_REPLIES_KEY, CHAT_KEY, type ChatMessage } from "@/lib/store";
import { refreshStatus } from "@/lib/status";
import { setNavigator } from "@/services/jarvis";
import type { KGData } from "@/types/graph";

let booted = false;

async function boot() {
  if (booted) return;
  booted = true;
  const s = useJarvis.getState();
  s.log("system", "JARVIS booting…");
  try {
    const stress = new URLSearchParams(window.location.search).get("stress");
    const res = await fetch(`/api/graph${stress ? `?stress=${encodeURIComponent(stress)}` : ""}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as KGData & { source?: string };
    const graph = loadGraph(data);
    s.setReady(true);
    s.bumpGraph();
    s.log("system", `Knowledge graph loaded — ${graph.order} nodes, ${graph.size} links (${data.source ?? "demo"})`);
  } catch (err) {
    s.log("error", `Could not load the knowledge graph: ${(err as Error).message}`);
    s.setHud("error", "Knowledge graph unavailable");
  }
  try {
    const lang = localStorage.getItem(VOICE_LANG_KEY);
    if (lang === "uz-UZ" || lang === "en-US") s.setVoiceLang(lang);
    const saved = JSON.parse(localStorage.getItem(CHAT_KEY) ?? "[]") as ChatMessage[];
    if (Array.isArray(saved) && saved.length && !s.messages.length) {
      s.setMessages(saved.filter((m) => m && typeof m.text === "string" && (m.role === "user" || m.role === "jarvis")).slice(-50));
    }
    const replies = localStorage.getItem(VOICE_REPLIES_KEY);
    if (replies === "0") s.setVoiceReplies(false);
  } catch {
    /* storage unavailable: keep the default */
  }
  await refreshStatus();
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    setNavigator((path) => router.push(path));
    void boot();
  }, [router]);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <NavRail />
      <main className="relative min-w-0 flex-1">{children}</main>
      <CommandPalette />
      <ItemViewer />
    </div>
  );
}
