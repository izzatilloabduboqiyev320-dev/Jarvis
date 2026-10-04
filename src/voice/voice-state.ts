/**
 * JARVIS's one authoritative state. It lives in the app store as `hud` and
 * every part of the app (voice, chat pipeline, approvals, HUD) reads and
 * writes that single value, so the HUD always shows what is really happening.
 */
export type JarvisVoiceState =
  | "standby"
  | "wake_listening"
  | "awake"
  | "listening"
  | "transcribing"
  | "thinking"
  | "searching"
  | "executing"
  | "waiting_approval"
  | "speaking"
  | "error";

export const STATE_LABELS: Record<JarvisVoiceState, string> = {
  standby: "STANDBY",
  wake_listening: 'SAY "JARVIS"',
  awake: "ONLINE",
  listening: "LISTENING",
  transcribing: "TRANSCRIBING",
  thinking: "THINKING",
  searching: "SEARCHING",
  executing: "EXECUTING",
  waiting_approval: "APPROVAL",
  speaking: "SPEAKING",
  error: "ERROR",
};

/** States in which JARVIS is working on a request (the HUD's Stop button cancels them). */
export const BUSY_STATES: JarvisVoiceState[] = ["transcribing", "thinking", "searching", "executing", "waiting_approval", "speaking"];
