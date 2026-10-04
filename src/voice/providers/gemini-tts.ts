"use client";

import type { SpeakOptions, TextToSpeechProvider } from "@/voice/providers/text-to-speech";

/** Gemini's natural voice via /api/tts (the key stays on the server). Optional: needs a Gemini key. */
export class GeminiTTSProvider implements TextToSpeechProvider {
  readonly name = "Gemini";
  private audio: HTMLAudioElement | null = null;

  async speak(text: string, opts: SpeakOptions): Promise<string | null> {
    if (typeof window === "undefined") return null;
    await this.stop();
    try {
      const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 1500) }) });
      if (!res.ok) return null;
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.playbackRate = opts.rate;
      this.audio = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.onpause = () => resolve();
        audio.play().catch(() => resolve());
      });
      URL.revokeObjectURL(url);
      if (this.audio === audio) this.audio = null;
      return "Gemini";
    } catch {
      return null;
    }
  }

  async stop(): Promise<void> {
    this.audio?.pause();
    this.audio = null;
  }
}
