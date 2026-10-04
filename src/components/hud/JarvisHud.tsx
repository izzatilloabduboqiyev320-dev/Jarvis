"use client";

import { useEffect, useRef, useState } from "react";
import { useJarvis } from "@/lib/store";
import { testVoice } from "@/services/jarvis";
import { getVoice } from "@/voice";
import { onMicActive, onMicLevel } from "@/voice/mic";
import { useVoiceSettings } from "@/voice/settings";
import { unlockAudio } from "@/voice/sounds";
import { stopSpeaking } from "@/voice/speak";
import { BUSY_STATES, STATE_LABELS } from "@/voice/voice-state";

const TICKS = Array.from({ length: 72 }, (_, i) => i);
const LANGS = ["uz-UZ", "en-US", "ru-RU"] as const;

export default function JarvisHud() {
  const hud = useJarvis((s) => s.hud);
  const detail = useJarvis((s) => s.hudDetail);
  const status = useJarvis((s) => s.status);
  const voiceLang = useJarvis((s) => s.voiceLang);
  const setVoiceLang = useJarvis((s) => s.setVoiceLang);
  const voiceOn = useVoiceSettings((s) => s.enabled);
  const updateVoice = useVoiceSettings((s) => s.update);
  const uz = voiceLang === "uz-UZ";
  const rootRef = useRef<HTMLDivElement>(null);
  const [micActive, setMicActive] = useState(false);

  // Mic level → CSS variable (no React re-render per frame).
  useEffect(
    () =>
      onMicLevel((level) => {
        rootRef.current?.style.setProperty("--level", level.toFixed(3));
      }),
    [],
  );
  useEffect(() => onMicActive(setMicActive), []);

  const listening = hud === "listening";
  const busy = BUSY_STATES.includes(hud) || hud === "awake";

  /** Click on the HUD or Talk: listen now (no wake word needed); while JARVIS works, stop it. */
  const talk = () => {
    unlockAudio();
    if (busy) getVoice().stop();
    else getVoice().listenNow();
  };

  const toggleVoice = () => {
    unlockAudio();
    updateVoice({ enabled: !voiceOn });
    if (voiceOn) getVoice().stop("Voice assistant off");
    else useJarvis.getState().log("system", "Voice assistant on");
    getVoice().sync();
  };

  const hint =
    hud === "listening"
      ? detail || (uz ? "gapiring..." : voiceLang === "ru-RU" ? "говорите..." : "speak...")
      : hud === "error"
        ? detail || "Something went wrong"
        : hud === "standby"
          ? "click · ⌘⇧Space · ⌘K"
          : hud === "wake_listening"
            ? uz
              ? "mikrofon yoniq"
              : "mic on"
            : detail || "";

  return (
    <div ref={rootRef} className="hud select-none" data-state={hud} data-testid="jarvis-hud">
      <button
        className="hud-disc"
        onClick={talk}
        aria-label={busy ? "Stop JARVIS" : "Talk to JARVIS"}
        title={busy ? "Stop (Esc)" : "Talk to JARVIS (⌘⇧Space) · type with ⌘K"}
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
            {STATE_LABELS[hud]}
          </div>
          <div className="hud-hint" title={hint}>{hint}</div>
        </div>
      </button>
      <div className="mt-1 flex items-center justify-between gap-2 px-1">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-faint">
          <span className="text-accent/80">{status.model}</span>
          <span className="mx-1 text-ink-faint/60">·</span>
          {status.mode === "demo" ? "demo mode" : "online"}
          {micActive && (
            <span className="ml-1.5 animate-pulse text-danger" title={uz ? "Mikrofon yoniq" : "Microphone is on"} aria-label="Microphone is on" data-testid="mic-indicator">
              ●
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => {
            stopSpeaking();
            void testVoice();
          }}
          disabled={listening}
          className="flex h-6 items-center border border-line px-1.5 text-ink-dim transition hover:border-accent/60 hover:text-accent disabled:opacity-40"
          title={uz ? "Ovozni sinash" : "Test voice"}
          aria-label={uz ? "Ovozni sinash" : "Test voice"}
          data-testid="voice-test"
        >
          <svg width="12" height="11" viewBox="0 0 12 11" fill="none" aria-hidden>
            <path d="M1 4h2l3-2.5v8L3 7H1z" stroke="currentColor" strokeLinejoin="round" />
            <path d="M8.2 3.3a3 3 0 0 1 0 4.4M9.8 1.8a5 5 0 0 1 0 7.4" stroke="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => setVoiceLang(LANGS[(LANGS.indexOf(voiceLang) + 1) % LANGS.length])}
          disabled={listening}
          className="flex h-6 items-center border border-line px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-dim transition hover:border-accent/60 hover:text-accent disabled:opacity-40"
          title={uz ? "Tinglash tili: o'zbekcha (almashtirish uchun bosing)" : "Listening language (click to change)"}
          data-testid="voice-lang"
        >
          {voiceLang.slice(0, 2).toUpperCase()}
        </button>
        <button
          onClick={talk}
          className={`flex h-6 items-center gap-1 border px-2 font-mono text-[9.5px] uppercase tracking-wider transition ${
            listening || busy ? "border-accent text-accent" : "border-line text-ink-dim hover:border-accent/60 hover:text-accent"
          }`}
          title="Push to talk (⌘⇧Space)"
          data-testid="mic-button"
        >
          <svg width="9" height="11" viewBox="0 0 9 11" fill="none" aria-hidden>
            <rect x="2.5" y="0.5" width="4" height="6.5" rx="2" stroke="currentColor" />
            <path d="M0.8 5.2c0 2 1.6 3.6 3.7 3.6s3.7-1.6 3.7-3.6M4.5 8.8v1.8" stroke="currentColor" />
          </svg>
          {listening || busy ? "Stop" : "Talk"}
        </button>
        </div>
      </div>
      <button
        onClick={toggleVoice}
        className={`mt-2 flex h-8 w-full items-center justify-center gap-2 border font-mono text-[10px] uppercase tracking-[0.2em] transition ${
          voiceOn ? "border-accent bg-accent/10 text-accent" : "border-line text-ink-dim hover:border-accent/60 hover:text-accent"
        }`}
        title={uz ? "Yoniq bo'lsa, JARVIS “Jarvis” so'zini tinglaydi (sahifa ochiq turganda)" : "When on, JARVIS listens for “Jarvis” while this page is open"}
        data-testid="voice-toggle"
        aria-pressed={voiceOn}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${voiceOn ? "animate-pulse bg-accent" : "bg-ink-faint"}`} />
        {voiceOn ? "Voice · On" : "Voice · Off"}
      </button>
    </div>
  );
}
