import { detectWake, isCancel, stripWake } from "@/voice/wake-word";
import type { JarvisVoiceState } from "@/voice/voice-state";
import type { SpeechToTextProvider, SttErrorCode } from "@/voice/providers/speech-to-text";
import type { VoiceSettings } from "@/voice/settings";
import type { Sound } from "@/voice/sounds";

/**
 * The voice assistant: wake word → "Yes?" → listen → transcript → the SAME
 * JARVIS pipeline as typed chat → spoken answer → short follow-up window →
 * back to waiting for "Jarvis".
 *
 * One instance per page (created once, never per React render), one
 * recogniser at a time, the microphone released whenever voice is off.
 * Audio is never recorded or stored; only recognised text is used.
 */

export type ActivityKind = "user" | "search" | "result" | "tool" | "ai" | "error" | "system" | "memory";

export interface VoiceDeps {
  stt: SpeechToTextProvider;
  /** Runs a command through JARVIS's normal chat pipeline (it also speaks the answer). */
  ask: (text: string) => Promise<unknown>;
  /** Short spoken acknowledgement ("Yes?"). */
  speakAck: (text: string) => Promise<unknown>;
  /** Stops speech output and cancels the AI request in progress. */
  interrupt: () => void;
  acquireMic: () => Promise<void>;
  releaseMic: () => void;
  isPermissionError: (err: unknown) => boolean;
  sound: (s: Sound) => void;
  settings: () => VoiceSettings;
  /** BCP-47 language to listen in. */
  lang: () => string;
  log: (kind: ActivityKind, text: string) => void;
  getState: () => JarvisVoiceState;
  setState: (s: JarvisVoiceState, detail?: string) => void;
  /** While true, approvals are also asked and answered by voice. */
  setTalking: (on: boolean) => void;
  /** Subscribes to state changes made anywhere in the app. */
  subscribe: (fn: (s: JarvisVoiceState) => void) => () => void;
}

type Mode = "off" | "wake" | "command" | "busy";

const ACK: Record<string, string> = { uz: "Labbay?", ru: "Да?", en: "Yes?" };
const PERMISSION_MESSAGE =
  "Microphone permission is required for JARVIS voice mode. In Chrome click the lock icon next to localhost → Microphone → Allow; on the Mac also check System Settings → Privacy & Security → Microphone → Google Chrome.";
/** First command after "Jarvis" or a click: how long to wait for speech to start. */
const COMMAND_START_MS = 8000;

export class VoiceManager {
  private mode: Mode = "off";
  /** Bumped on every stop, so late callbacks from an old session are ignored. */
  private session = 0;
  private micHeld = false;
  private heard = "";
  private interim = "";
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restarts: number[] = [];
  /** The wake listener stepped aside while the app answered a typed message. */
  private paused = false;
  private unsubscribe: (() => void) | null = null;
  private announced = false;
  lastWake: number | null = null;
  lastTranscript = "";

  constructor(private d: VoiceDeps) {
    this.unsubscribe = d.subscribe((s) => this.onAppState(s));
  }

  get currentMode(): Mode {
    return this.mode;
  }

  get providerName(): string {
    return this.d.stt.name;
  }

  dispose() {
    this.stopEverything();
    this.unsubscribe?.();
  }

  /** Applies the settings: starts or stops the wake listener. Safe to call any number of times. */
  sync() {
    const s = this.d.settings();
    const wantWake = s.enabled && s.wakeWord;
    if (wantWake && this.mode === "off") this.startWake();
    else if (!wantWake && this.mode === "wake") this.goIdle();
    else if (!s.enabled && this.mode === "command") this.stop("Voice assistant off");
  }

  /** HUD click, Talk button or ⌘⇧Space: listen for a command now, no wake word needed. */
  listenNow() {
    if (this.mode === "command") return this.stop("Stopped listening");
    if (this.mode === "busy") return this.stop("Stopped");
    this.cancelRecognition();
    this.d.sound("listen");
    this.listenCommand(false);
  }

  /** STOP button / Esc: stop speaking, cancel the request, stop listening. */
  stop(reason = "Stopped") {
    const wasActive = this.mode !== "off" || this.isBusyState();
    this.session++;
    this.cancelRecognition();
    this.d.interrupt();
    this.d.setTalking(false);
    if (wasActive) this.d.log("system", reason);
    this.goIdle();
  }

  // ── Wake word ───────────────────────────────────────────────────────

  private startWake() {
    if (!this.d.stt.supported()) {
      this.fail("Speech recognition isn't supported in this browser. Use Google Chrome.");
      return;
    }
    this.mode = "wake";
    this.paused = false;
    this.holdMic();
    this.d.setState("wake_listening");
    if (!this.announced) {
      this.d.log("system", "Voice wake listener started");
      this.announced = true;
    }
    this.runWakeRecognizer();
  }

  private runWakeRecognizer() {
    const session = this.session;
    void this.d.stt.start(
      { lang: this.d.lang(), continuous: true },
      {
        onTranscript: (text, final) => {
          if (session !== this.session || this.mode !== "wake" || !final) return;
          const w = detectWake(text);
          if (!w.heard) return;
          this.lastWake = Date.now();
          this.cancelRecognition();
          this.d.log("system", "Wake word detected: JARVIS");
          if (w.command && !isCancel(w.command)) void this.runCommand(w.command);
          else if (w.command) this.startWake();
          else void this.awaken();
        },
        onError: (code) => {
          if (session !== this.session) return;
          this.onRecognitionError(code);
        },
        onEnd: () => {
          if (session !== this.session || this.mode !== "wake" || this.paused) return;
          this.scheduleWakeRestart();
        },
      },
    );
  }

  /** Browsers end continuous recognition now and then; restart it, backing off if it keeps failing. */
  private scheduleWakeRestart() {
    const now = Date.now();
    this.restarts = [...this.restarts.filter((t) => now - t < 20_000), now];
    const delay = this.restarts.length > 8 ? 5000 : 250;
    this.clearTimer("restartTimer");
    const session = this.session;
    this.restartTimer = setTimeout(() => {
      if (session === this.session && this.mode === "wake" && !this.paused) this.runWakeRecognizer();
    }, delay);
  }

  private async awaken() {
    this.mode = "busy";
    const session = this.session;
    this.d.setState("awake");
    this.d.sound("wake");
    const lang = this.d.lang().slice(0, 2);
    await this.d.speakAck(ACK[lang] ?? ACK.en);
    if (session !== this.session) return;
    this.listenCommand(false);
  }

  // ── Commands ────────────────────────────────────────────────────────

  private listenCommand(followUp: boolean) {
    this.mode = "command";
    this.heard = "";
    this.interim = "";
    this.holdMic();
    this.d.setState("listening", followUp ? "Follow-up" : "");
    this.d.log("system", followUp ? "Listening for a follow-up" : "Listening for command");
    const session = this.session;
    const waitMs = followUp ? this.d.settings().followUpSeconds * 1000 : COMMAND_START_MS;
    this.clearTimer("waitTimer");
    this.waitTimer = setTimeout(() => {
      if (session !== this.session || this.mode !== "command" || this.heard || this.interim) return;
      this.cancelRecognition();
      this.d.log("system", followUp ? "Follow-up window closed" : "No command heard");
      this.goIdle();
    }, waitMs);
    this.runCommandRecognizer(session);
  }

  private runCommandRecognizer(session: number) {
    void this.d.stt.start(
      { lang: this.d.lang(), continuous: true },
      {
        onTranscript: (text, final) => {
          if (session !== this.session || this.mode !== "command") return;
          this.clearTimer("waitTimer");
          if (final) {
            this.heard = `${this.heard} ${text}`.trim();
            this.interim = "";
          } else this.interim = text;
          this.d.setState("listening", `${this.heard} ${this.interim}`.trim());
          // End of command: a short silence after speech.
          this.clearTimer("silenceTimer");
          this.silenceTimer = setTimeout(() => {
            if (session === this.session && this.mode === "command") void this.finishCommand();
          }, this.d.settings().silenceMs);
        },
        onError: (code) => {
          if (session !== this.session) return;
          if (code === "no-speech") return; // the wait timer decides
          this.onRecognitionError(code);
        },
        onEnd: () => {
          if (session !== this.session || this.mode !== "command") return;
          if (this.heard || this.interim) void this.finishCommand();
          else if (this.waitTimer) this.runCommandRecognizer(session); // still waiting for speech
        },
      },
    );
  }

  private async finishCommand() {
    if (this.mode !== "command") return;
    this.clearTimer("silenceTimer");
    this.clearTimer("waitTimer");
    const text = `${this.heard} ${this.interim}`.trim();
    this.cancelRecognition();
    if (!text) return this.goIdle();
    this.d.log("system", "Speech captured");
    this.d.setState("transcribing");
    this.lastTranscript = text;
    this.d.log("system", `Transcript: “${text.slice(0, 120)}”`);
    if (isCancel(text)) {
      this.d.sound("accept");
      this.d.log("system", "Cancelled by voice");
      return this.goIdle();
    }
    await this.runCommand(stripWake(text) || text);
  }

  private async runCommand(text: string) {
    this.mode = "busy";
    const session = this.session;
    this.d.sound("accept");
    this.d.log("system", "Sent command to JARVIS");
    this.d.setTalking(true);
    try {
      await this.d.ask(text);
    } finally {
      if (session === this.session) this.d.setTalking(false);
    }
    if (session !== this.session) return;
    const s = this.d.settings();
    if (s.enabled && s.followUp) this.listenCommand(true);
    else this.goIdle();
  }

  // ── Shared ──────────────────────────────────────────────────────────

  /** Back to waiting for "Jarvis" when voice is on, otherwise standby with the microphone closed. */
  private goIdle() {
    this.clearTimers();
    const s = this.d.settings();
    if (s.enabled && s.wakeWord && this.d.stt.supported()) {
      if (this.mode !== "off") this.d.log("system", "Returned to wake mode");
      this.mode = "off";
      this.startWake();
      return;
    }
    this.stopEverything();
    if (this.d.getState() !== "error") this.d.setState("standby");
  }

  private stopEverything() {
    this.session++;
    this.mode = "off";
    this.paused = false;
    this.announced = false;
    this.clearTimers();
    this.cancelRecognition();
    this.dropMic();
  }

  /** Typed chat also changes the state: the wake listener steps aside while JARVIS answers, so it never hears itself. */
  private onAppState(s: JarvisVoiceState) {
    if (this.mode !== "wake") return;
    if (s === "wake_listening") return;
    if (s === "standby") {
      // The app finished (or a cancelled request wound down): show that JARVIS is listening again.
      const resume = this.paused;
      this.paused = false;
      this.d.setState("wake_listening");
      if (resume) this.runWakeRecognizer();
      return;
    }
    if (s !== "error" && !this.paused) {
      this.paused = true;
      this.session++;
      this.cancelRecognition();
    }
  }

  private onRecognitionError(code: SttErrorCode) {
    if (code === "no-speech") return;
    if (code === "permission") return this.fail(PERMISSION_MESSAGE, true);
    if (code === "unsupported") return this.fail("Speech recognition isn't supported in this browser. Use Google Chrome.", true);
    if (code === "language") return this.fail("This browser can't recognise the selected language. Try another language in Settings → Ovoz.", true);
    if (code === "audio") return this.fail("No microphone was found. Check that one is connected.", true);
    // Network or other: report once, the restart logic retries.
    this.d.log("error", code === "network" ? "Speech service unreachable (internet?) — retrying" : "Speech recognition error — retrying");
  }

  private fail(message: string, permanent = false) {
    this.d.sound("error");
    this.d.log("error", message);
    this.stopEverything();
    this.d.setState("error", message);
    if (!permanent) return;
    setTimeout(() => {
      if (this.d.getState() === "error" && this.mode === "off") this.d.setState("standby");
    }, 6000);
  }

  private holdMic() {
    if (this.micHeld) return;
    this.micHeld = true;
    this.d.acquireMic().catch((err) => {
      this.micHeld = false;
      if (this.d.isPermissionError(err)) this.fail(PERMISSION_MESSAGE, true);
    });
  }

  private dropMic() {
    if (!this.micHeld) return;
    this.micHeld = false;
    this.d.releaseMic();
  }

  private cancelRecognition() {
    this.d.stt.abort();
  }

  private isBusyState() {
    return !["standby", "wake_listening", "error"].includes(this.d.getState());
  }

  private clearTimer(k: "silenceTimer" | "waitTimer" | "restartTimer") {
    if (this[k]) clearTimeout(this[k]!);
    this[k] = null;
  }

  private clearTimers() {
    this.clearTimer("silenceTimer");
    this.clearTimer("waitTimer");
    this.clearTimer("restartTimer");
  }
}
