"use client";

import { create } from "zustand";

/** Voice settings (Settings → Ovoz), kept in this browser. */
export interface VoiceSettings {
  /** Voice assistant on: JARVIS may use the microphone in the background (wake word). */
  enabled: boolean;
  /** Listen for "Jarvis" while the page is open. */
  wakeWord: boolean;
  /** After an answer, keep listening briefly without "Jarvis". */
  followUp: boolean;
  followUpSeconds: number;
  /** Pause after speech that ends a command. */
  silenceMs: number;
  /** Speech speed for the browser voice. */
  rate: number;
  /** Short interface sounds (wake, listening, accepted, error). */
  sounds: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  wakeWord: true,
  followUp: true,
  followUpSeconds: 10,
  silenceMs: 1100,
  rate: 1,
  sounds: true,
};

const KEY = "jarvis.voice.v1";

function load(): VoiceSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<VoiceSettings>;
    const s = { ...DEFAULT_VOICE_SETTINGS, ...raw };
    s.followUpSeconds = Math.min(30, Math.max(3, Number(s.followUpSeconds) || 10));
    s.silenceMs = Math.min(4000, Math.max(500, Number(s.silenceMs) || 1100));
    s.rate = Math.min(1.6, Math.max(0.6, Number(s.rate) || 1));
    return s;
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

interface Store extends VoiceSettings {
  loaded: boolean;
  load: () => void;
  update: (patch: Partial<VoiceSettings>) => void;
}

export const useVoiceSettings = create<Store>((set, get) => ({
  ...DEFAULT_VOICE_SETTINGS,
  loaded: false,
  load: () => set({ ...load(), loaded: true }),
  update: (patch) => {
    set(patch);
    const all = get();
    const rest = Object.fromEntries(Object.keys(DEFAULT_VOICE_SETTINGS).map((k) => [k, all[k as keyof VoiceSettings]]));
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* storage unavailable: setting lasts for this visit only */
    }
  },
}));

export const voiceSettings = () => useVoiceSettings.getState();
