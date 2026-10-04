/**
 * Speech-to-text providers. The voice manager only talks to this interface,
 * so the browser recogniser can later be swapped for a local macOS helper
 * (Speech framework / whisper.cpp on 127.0.0.1) without touching the UI.
 */

export type SttErrorCode = "permission" | "no-speech" | "network" | "unsupported" | "language" | "audio" | "other";

export interface SttHandlers {
  /** Text heard so far in this session; `final` when the recogniser is sure. */
  onTranscript: (text: string, final: boolean) => void;
  onError: (code: SttErrorCode, detail?: string) => void;
  /** The recogniser stopped (by itself or after stop()). */
  onEnd: () => void;
}

export interface SttOptions {
  /** BCP-47 language, e.g. "uz-UZ", "en-US", "ru-RU". */
  lang: string;
  /** Keep listening across pauses (wake word); otherwise stop after the first phrase. */
  continuous: boolean;
}

export interface SpeechToTextProvider {
  readonly name: string;
  supported(): boolean;
  start(opts: SttOptions, handlers: SttHandlers): Promise<void>;
  /** Stop and deliver what was heard. */
  stop(): Promise<void>;
  /** Stop and discard. */
  abort(): void;
}
