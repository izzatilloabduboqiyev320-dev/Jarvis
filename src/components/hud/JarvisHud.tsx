"use client";

import { useEffect, useRef, useState } from "react";
import { useJarvis, type HudState } from "@/lib/store";
import { askJarvis, testVoice } from "@/services/jarvis";
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
  const voiceLang = useJarvis((s) => s.voiceLang);
  const setVoiceLang = useJarvis((s) => s.setVoiceLang);
  const uz = voiceLang === "uz-UZ";
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

  // Conversation mode: listen → answer aloud → listen again, until switched off.
  const [talkMode, setTalkMode] = useState(false);
  const talkRef = useRef(false);
  const missesRef = useRef(0);

  const endTalk = () => {
    talkRef.current = false;
    setTalkMode(false);
    useJarvis.getState().setTalking(false);
    stopRef.current?.();
    stopRef.current = null;
  };

  const listen = () => {
    const s = useJarvis.getState();
    stopSpeaking();
    const lang = s.voiceLang;
    let heard = false;
    s.setHud("listening", talkRef.current ? "Conversation" : "Push-to-talk");
    s.log("system", `Microphone on — listening (${lang === "uz-UZ" ? "O'zbekcha" : "English"})`);
    setInterim("");
    stopRef.current = startPushToTalk({
      onInterim: setInterim,
      onFinal: (text) => {
        heard = true;
        missesRef.current = 0;
        s.log("system", "Speech recognised");
        setInterim("");
        s.setHud("thinking");
        void askJarvis(text, { lang: lang === "uz-UZ" ? "uz" : "en" }).then(() => {
          if (talkRef.current) listen();
        });
      },
      onError: (msg) => {
        s.log("error", msg);
        s.setHud("error", msg);
        // A permission or device problem won't fix itself: leave conversation mode.
        if (!/eshitmadim|didn't hear/i.test(msg)) endTalk();
        setTimeout(() => {
          if (useJarvis.getState().hud === "error") useJarvis.getState().setHud("idle");
        }, 4000);
      },
      onEnd: () => {
        stopRef.current = null;
        setInterim("");
        if (useJarvis.getState().hud === "listening") useJarvis.getState().setHud("idle");
        if (!heard && talkRef.current) {
          // Silence: keep listening a couple of times, then rest.
          if (++missesRef.current >= 3) {
            endTalk();
            useJarvis.getState().log("system", "Conversation paused after silence");
          } else setTimeout(() => talkRef.current && !stopRef.current && listen(), 400);
        }
      },
    }, lang);
  };

  const toggleMic = () => {
    if (stopRef.current) {
      endTalk();
      return;
    }
    listen();
  };

  const toggleTalk = () => {
    if (talkRef.current) {
      endTalk();
      stopSpeaking();
      if (useJarvis.getState().hud === "listening") useJarvis.getState().setHud("idle");
      return;
    }
    talkRef.current = true;
    missesRef.current = 0;
    setTalkMode(true);
    useJarvis.getState().setTalking(true);
    if (!useJarvis.getState().voiceReplies) useJarvis.getState().setVoiceReplies(true);
    if (!stopRef.current) listen();
  };

  const hint =
    hud === "listening"
      ? interim || (uz ? "gapiring..." : 'say "Jarvis..."')
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
        <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => {
            stopSpeaking();
            void testVoice();
          }}
          disabled={hud === "listening"}
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
          onClick={() => setVoiceLang(uz ? "en-US" : "uz-UZ")}
          disabled={hud === "listening"}
          className="flex h-6 items-center border border-line px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-dim transition hover:border-accent/60 hover:text-accent disabled:opacity-40"
          title={uz ? "Ovoz tili: o'zbekcha (inglizchaga o'tish uchun bosing)" : "Voice language: English (click for Uzbek)"}
          data-testid="voice-lang"
        >
          {uz ? "UZ" : "EN"}
        </button>
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
      <button
        onClick={toggleTalk}
        className={`mt-2 flex h-8 w-full items-center justify-center gap-2 border font-mono text-[10px] uppercase tracking-[0.2em] transition ${
          talkMode ? "border-accent bg-accent/10 text-accent" : "border-line text-ink-dim hover:border-accent/60 hover:text-accent"
        }`}
        title={uz ? "Gapiring, JARVIS ovoz bilan javob beradi va yana tinglaydi" : "Speak; JARVIS answers aloud and listens again"}
        data-testid="talk-mode"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${talkMode ? "animate-pulse bg-accent" : "bg-ink-faint"}`} />
        {talkMode ? (uz ? "Suhbatni tugatish" : "End conversation") : uz ? "Ovozli suhbat" : "Voice conversation"}
      </button>
    </div>
  );
}
