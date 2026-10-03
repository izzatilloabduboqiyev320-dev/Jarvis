"use client";

import { create } from "zustand";
import type { LayoutName } from "@/knowledge/graph";
import type { NodeCategory } from "@/types/graph";

export type HudState = "idle" | "listening" | "thinking" | "executing" | "speaking" | "error";

export type ActivityKind = "user" | "search" | "result" | "tool" | "ai" | "error" | "system" | "memory";

export interface ActivityItem {
  id: number;
  ts: number;
  kind: ActivityKind;
  text: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "jarvis";
  text: string;
  ts: number;
}

/** What the graph is currently focused on. Drives dimming / highlighting. */
export type Focus =
  | { kind: "none" }
  | { kind: "select"; node: string }
  | { kind: "path"; nodes: string[] }
  | { kind: "query"; nodes: string[]; anchors: string[]; label: string };

export type VoiceLang = "uz-UZ" | "en-US";
export const VOICE_LANG_KEY = "jarvis.voice-lang.v1";

export interface AppStatus {
  mode: "demo" | "ai";
  model: string;
  voiceOutput: "browser" | "elevenlabs";
}

interface JarvisStore {
  /** Bumped whenever the graph's nodes/edges change (not positions). */
  graphVersion: number;
  ready: boolean;
  status: AppStatus;

  selected: string | null;
  focus: Focus;
  hidden: NodeCategory[];
  layout: LayoutName;
  recent: string[];
  viewer: string | null;

  hud: HudState;
  hudDetail: string;
  voiceReplies: boolean;
  /** Language the microphone listens in (and JARVIS speaks back in). */
  voiceLang: VoiceLang;

  paletteOpen: boolean;
  graphError: string | null;
  messages: ChatMessage[];
  activity: ActivityItem[];

  setReady: (v: boolean) => void;
  setStatus: (s: AppStatus) => void;
  bumpGraph: () => void;
  select: (id: string | null) => void;
  setFocus: (f: Focus) => void;
  clearFocus: () => void;
  toggleCategory: (c: NodeCategory) => void;
  setHidden: (c: NodeCategory[]) => void;
  setLayout: (l: LayoutName) => void;
  openViewer: (id: string | null) => void;
  setHud: (s: HudState, detail?: string) => void;
  setVoiceReplies: (v: boolean) => void;
  setVoiceLang: (l: VoiceLang) => void;
  setPaletteOpen: (v: boolean) => void;
  setGraphError: (e: string | null) => void;
  addMessage: (role: ChatMessage["role"], text: string) => void;
  log: (kind: ActivityKind, text: string) => void;
}

let seq = 0;

export const useJarvis = create<JarvisStore>((set) => ({
  graphVersion: 0,
  ready: false,
  status: { mode: "demo", model: "CLAUDE", voiceOutput: "browser" },
  selected: null,
  focus: { kind: "none" },
  hidden: [],
  layout: "force",
  recent: [],
  viewer: null,
  hud: "idle",
  hudDetail: "",
  voiceReplies: false,
  voiceLang: "uz-UZ",
  paletteOpen: false,
  graphError: null,
  messages: [],
  activity: [],

  setReady: (ready) => set({ ready }),
  setStatus: (status) => set({ status }),
  bumpGraph: () => set((s) => ({ graphVersion: s.graphVersion + 1 })),
  select: (id) =>
    set((s) => ({
      selected: id,
      focus: id ? { kind: "select", node: id } : { kind: "none" },
      recent: id ? [id, ...s.recent.filter((r) => r !== id)].slice(0, 8) : s.recent,
    })),
  setFocus: (focus) => set({ focus }),
  clearFocus: () => set({ focus: { kind: "none" }, selected: null }),
  toggleCategory: (c) =>
    set((s) => ({ hidden: s.hidden.includes(c) ? s.hidden.filter((h) => h !== c) : [...s.hidden, c] })),
  setHidden: (hidden) => set({ hidden }),
  setLayout: (layout) => set({ layout }),
  openViewer: (viewer) => set({ viewer }),
  setHud: (hud, hudDetail = "") => set({ hud, hudDetail }),
  setVoiceReplies: (voiceReplies) => set({ voiceReplies }),
  setVoiceLang: (voiceLang) => {
    try {
      localStorage.setItem(VOICE_LANG_KEY, voiceLang);
    } catch {
      /* storage unavailable: setting lasts for this visit only */
    }
    set({ voiceLang });
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setGraphError: (graphError) => set({ graphError }),
  addMessage: (role, text) =>
    set((s) => ({ messages: [...s.messages, { id: ++seq, role, text, ts: Date.now() }].slice(-50) })),
  log: (kind, text) =>
    set((s) => ({ activity: [...s.activity, { id: ++seq, ts: Date.now(), kind, text }].slice(-200) })),
}));
