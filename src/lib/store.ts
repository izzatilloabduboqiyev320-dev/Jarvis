"use client";

import { create } from "zustand";
import type { LayoutName } from "@/knowledge/graph";
import type { NodeCategory } from "@/types/graph";

import type { JarvisVoiceState } from "@/voice/voice-state";

/** JARVIS's single state (voice, pipeline, approvals); the HUD shows it. */
export type HudState = JarvisVoiceState;

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

export interface Approval {
  id: string;
  summary: string;
  status: "pending" | "approved" | "denied" | "expired";
  ts: number;
  /** The JARVIS reply this request belongs to (the card shows just above it). */
  replyId?: number;
}

export type VoiceLang = "uz-UZ" | "en-US" | "ru-RU";
export const VOICE_LANG_KEY = "jarvis.voice-lang.v1";
export const CHAT_KEY = "jarvis.chat.v1";
export const VOICE_REPLIES_KEY = "jarvis.voice-replies.v1";

export interface AppStatus {
  mode: "demo" | "ai";
  model: string;
  voiceOutput: "browser" | "gemini" | "elevenlabs";
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
  /** "Ha / Yo'q" requests for actions on the computer. */
  approvals: Approval[];
  /** Hands-free conversation mode is on (approvals can then be answered by voice). */
  talking: boolean;

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
  /** Adds a chat message and returns its id. */
  addMessage: (role: ChatMessage["role"], text: string) => number;
  updateMessage: (id: number, text: string) => void;
  setMessages: (m: ChatMessage[]) => void;
  log: (kind: ActivityKind, text: string) => void;
  /** Puts saved server activity (from earlier sessions) before what this page logged. */
  seedActivity: (items: { ts: number; kind: ActivityKind; text: string }[]) => void;
  addApproval: (id: string, summary: string, replyId?: number) => void;
  setApproval: (id: string, status: Approval["status"]) => void;
  setTalking: (v: boolean) => void;
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
  hud: "standby",
  hudDetail: "",
  voiceReplies: true,
  voiceLang: "uz-UZ",
  paletteOpen: false,
  graphError: null,
  messages: [],
  activity: [],
  approvals: [],
  talking: false,

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
  setVoiceReplies: (voiceReplies) => {
    try {
      localStorage.setItem(VOICE_REPLIES_KEY, voiceReplies ? "1" : "0");
    } catch {
      /* storage unavailable: setting lasts for this visit only */
    }
    set({ voiceReplies });
  },
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
  addMessage: (role, text) => {
    const id = ++seq;
    set((s) => ({ messages: [...s.messages, { id, role, text, ts: Date.now() }].slice(-50) }));
    return id;
  },
  updateMessage: (id, text) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, text } : m)) })),
  setMessages: (messages) => {
    seq = Math.max(seq, ...messages.map((m) => m.id));
    set({ messages });
  },
  log: (kind, text) =>
    set((s) => ({ activity: [...s.activity, { id: ++seq, ts: Date.now(), kind, text }].slice(-200) })),
  seedActivity: (items) =>
    set((s) => ({ activity: [...items.map((a) => ({ ...a, id: ++seq })), ...s.activity].slice(-200) })),
  addApproval: (id, summary, replyId) =>
    set((s) => ({ approvals: [...s.approvals, { id, summary, status: "pending" as const, ts: Date.now(), replyId }].slice(-10) })),
  setApproval: (id, status) => set((s) => ({ approvals: s.approvals.map((a) => (a.id === id ? { ...a, status } : a)) })),
  setTalking: (talking) => set({ talking }),
}));
