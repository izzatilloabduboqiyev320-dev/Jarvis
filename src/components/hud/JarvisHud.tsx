"use client";

import { useEffect, useRef, useState } from "react";
import { useJarvis, type HudState } from "@/lib/store";
import { askJarvis } from "@/services/jarvis";
import { onMicLevel, startPushToTalk } from "@/voice/push-to-talk";
import { stopSpeaking } from "@/voice/speak";

const LABELS: Record<HudState, string> = {
  idle: "STANDBY",
  listening: "LISTENING",
  thinking: "THINKING",
  executing: "EXECUTING",
  speaking: "SPEAKING",
  error: "ERROR",
};

const TICKS = Array.from({ length: 72 }, (_, i) => i);

export default function JarvisHud() {
  const hud = useJarvis((s) => s.hud);
  const detail = useJarvis((s) => s.hudDetail);
  const status = useJarvis((s) => s.status);
  const setPaletteOpen = useJarvis((s) => s.setPaletteOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [interim, setInterim] = useState("");

  // Mic level → CSS variable (no React re-render per frame).
  useEffect(
    () =>
      onMicLevel((level) => {
        rootRef.current?.style.setProperty("--level", level.toFixed(3));
      }),
    [],
  );

  const toggleMic = () => {
    const s = useJarvis.getState();
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
      return;
    }
    stopSpeaking();
    s.setHud("listening", "Push-to-talk");
    s.log("system", "Microphone on — listening");
    setInterim("");
    stopRef.current = startPushToTalk({
      onInterim: setInterim,
      onFinal: (text) => {
        s.log("system", "Speech recognised");
        setInterim("");
        s.setHud("thinking");
        void askJarvis(text);
      },
      onError: (msg) => {
        s.log("error", msg);
        s.setHud("error", msg);
        setTimeout(() => {
          if (useJarvis.getState().hud === "error") useJarvis.getState().setHud("idle");
        }, 4000);
      },
      onEnd: () => {
        stopRef.current = null;
        setInterim("");
        if (useJarvis.getState().hud === "listening") useJarvis.getState().setHud("idle");
      },
    });
  };

  const hint =
    hud === "listening"
      ? interim || 'say "Jarvis..."'
      : hud === "error"
        ? detail || "Something went wrong"
        : hud === "idle"
          ? "click · ⌘K · mic"
          : detail || "";

  return (
    <div ref={rootRef} className="hud select-none" data-state={hud} data-testid="jarvis-hud">
      <button
        className="hud-disc"
        onClick={() => setPaletteOpen(true)}
        aria-label="Open JARVIS command panel"
        title="Ask JARVIS (⌘K)"
      >
        <svg viewBox="0 0 200 200" className="hud-svg" aria-hidden>
          <defs>
            <radialGradient id="hud-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(80,220,240,0.16)" />
              <stop offset="70%" stopColor="rgba(10,40,50,0.18)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="96" fill="url(#hud-core)" />
          {/* tick ring */}
          <g className="hud-ticks">
            {TICKS.map((i) => (
              <line
                key={i}
                x1="100"
                y1={i % 6 === 0 ? 5 : 7}
                x2="100"
                y2="11"
                transform={`rotate(${i * 5} 100 100)`}
                className={i % 6 === 0 ? "major" : ""}
              />
            ))}
          </g>
          {/* outer reactive ring */}
          <circle className="hud-ring hud-ring-outer" cx="100" cy="100" r="86" />
          {/* speaking waves */}
          <circle className="hud-wave w1" cx="100" cy="100" r="72" />
          <circle className="hud-wave w2" cx="100" cy="100" r="72" />
          {/* thinking arcs */}
          <g className="hud-arcs">
            <circle className="hud-arc a1" cx="100" cy="100" r="78" pathLength="100" />
            <circle className="hud-arc a2" cx="100" cy="100" r="70" pathLength="100" />
          </g>
          {/* executing arc */}
          <circle className="hud-exec" cx="100" cy="100" r="62" pathLength="100" />
          <circle className="hud-ring hud-ring-inner" cx="100" cy="100" r="58" />
        </svg>
        <div className="hud-text">
          <div className="hud-title">J.A.R.V.I.S.</div>
          <div className="hud-state">
            <span className="hud-led" />
            {LABELS[hud]}
          </div>
          <div className="hud-hint" title={hint}>{hint}</div>
        </div>
      </button>
      <div className="mt-1 flex items-center justify-between gap-2 px-1">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-faint">
          <span className="text-accent/80">{status.model}</span>
          <span className="mx-1 text-ink-faint/60">·</span>
          {status.mode === "demo" ? "demo mode" : "online"}
        </div>
        <button
          onClick={toggleMic}
          className={`flex h-6 items-center gap-1 border px-2 font-mono text-[9.5px] uppercase tracking-wider transition ${
            hud === "listening" ? "border-accent text-accent" : "border-line text-ink-dim hover:border-accent/60 hover:text-accent"
          }`}
          title="Push to talk"
          data-testid="mic-button"
        >
          <svg width="9" height="11" viewBox="0 0 9 11" fill="none" aria-hidden>
            <rect x="2.5" y="0.5" width="4" height="6.5" rx="2" stroke="currentColor" />
            <path d="M0.8 5.2c0 2 1.6 3.6 3.7 3.6s3.7-1.6 3.7-3.6M4.5 8.8v1.8" stroke="currentColor" />
          </svg>
          {hud === "listening" ? "Stop" : "Talk"}
        </button>
      </div>
    </div>
  );
}
