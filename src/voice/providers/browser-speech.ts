"use client";

import type { SpeechToTextProvider, SttErrorCode, SttHandlers, SttOptions } from "@/voice/providers/speech-to-text";

/**
 * The browser's built-in speech recognition (Chrome/Edge; free, no key).
 * Chrome sends the audio to its own speech service while recognising; JARVIS
 * never records or stores audio itself.
 */

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const CODES: Record<string, SttErrorCode> = {
  "not-allowed": "permission",
  "service-not-allowed": "permission",
  "no-speech": "no-speech",
  "audio-capture": "audio",
  network: "network",
  "language-not-supported": "language",
};

export class BrowserSpeechProvider implements SpeechToTextProvider {
  readonly name = "Browser (Chrome speech)";
  private rec: Recognition | null = null;

  supported(): boolean {
    if (typeof window === "undefined") return false;
    const w = window as unknown as Record<string, unknown>;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  async start(opts: SttOptions, h: SttHandlers): Promise<void> {
    this.abort();
    const w = window as unknown as Record<string, new () => Recognition>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      h.onError("unsupported");
      h.onEnd();
      return;
    }
    const rec = new Ctor();
    this.rec = rec;
    rec.lang = opts.lang;
    rec.interimResults = true;
    rec.continuous = opts.continuous;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      if (this.rec !== rec) return;
      // Report each phrase once it is final, and the phrase in progress as interim.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript?.trim() ?? "";
        if (text) h.onTranscript(text, r.isFinal);
      }
    };
    rec.onerror = (e) => {
      if (this.rec !== rec || e.error === "aborted") return;
      h.onError(CODES[e.error] ?? "other", e.error);
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      h.onEnd();
    };
    try {
      rec.start();
    } catch (err) {
      this.rec = null;
      h.onError("other", (err as Error).message);
      h.onEnd();
    }
  }

  async stop(): Promise<void> {
    try {
      this.rec?.stop();
    } catch {
      /* already stopped */
    }
  }

  abort(): void {
    const rec = this.rec;
    this.rec = null;
    try {
      rec?.abort();
    } catch {
      /* already stopped */
    }
  }
}
