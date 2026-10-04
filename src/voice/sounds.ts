"use client";

import { voiceSettings } from "@/voice/settings";

/**
 * Tiny interface sounds made with WebAudio (no audio files): a soft rising
 * chime on wake, a tick when listening starts, a confirm when a command is
 * accepted and a low tone on error.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.05, type: OscillatorType = "sine", to?: number) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export type Sound = "wake" | "listen" | "accept" | "error";

export function playSound(s: Sound) {
  if (!voiceSettings().sounds) return;
  if (s === "wake") {
    tone(660, 0, 0.12, 0.045);
    tone(990, 0.08, 0.18, 0.04);
  } else if (s === "listen") tone(1320, 0, 0.07, 0.025, "triangle");
  else if (s === "accept") tone(880, 0, 0.12, 0.03, "sine", 1180);
  else tone(220, 0, 0.22, 0.05, "triangle", 160);
}

/** Browsers start audio only after a click or key press; call this from one. */
export function unlockAudio() {
  audio();
}
