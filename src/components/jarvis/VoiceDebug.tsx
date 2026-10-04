"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useJarvis } from "@/lib/store";
import { getVoice } from "@/voice";
import { micOpen, onMicLevel } from "@/voice/mic";

/**
 * Voice debugging overlay. Hidden unless the page is opened with ?voicedebug=1
 * (or localStorage "jarvis.voice-debug" = "1").
 */
function debugWanted(): boolean {
  try {
    return new URLSearchParams(location.search).has("voicedebug") || localStorage.getItem("jarvis.voice-debug") === "1";
  } catch {
    return false;
  }
}
const noop = () => () => {};

export default function VoiceDebug() {
  const on = useSyncExternalStore(noop, debugWanted, () => false);
  const [level, setLevel] = useState(0);
  const [, tick] = useState(0);
  const hud = useJarvis((s) => s.hud);
  const detail = useJarvis((s) => s.hudDetail);

  useEffect(() => {
    if (!on) return;
    const off = onMicLevel(setLevel);
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => {
      off();
      clearInterval(t);
    };
  }, [on]);

  if (!on) return null;
  const v = getVoice();
  return (
    <div className="fixed bottom-2 left-16 z-50 border border-line bg-black/85 p-2 font-mono text-[10.5px] leading-relaxed text-ink-dim" data-testid="voice-debug">
      <div>state: <span className="text-accent">{hud}</span> {detail && `(${detail.slice(0, 40)})`}</div>
      <div>mode: {v.currentMode} · mic: {micOpen() ? "open" : "closed"}</div>
      <div>provider: {v.providerName}</div>
      <div>last wake: {v.lastWake ? new Date(v.lastWake).toLocaleTimeString() : "—"}</div>
      <div>last transcript: {v.lastTranscript || "—"}</div>
      <div>
        level: <span className="inline-block h-1.5 bg-accent align-middle" style={{ width: `${Math.round(level * 80)}px` }} /> {level.toFixed(2)}
      </div>
    </div>
  );
}
