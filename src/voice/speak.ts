"use client";

import { BrowserTTSProvider } from "@/voice/providers/browser-tts";
import { GeminiTTSProvider } from "@/voice/providers/gemini-tts";
import { voiceSettings } from "@/voice/settings";

/**
 * JARVIS's voice output: Gemini's natural voice when its key is set, the
 * browser's voice otherwise (and whenever Gemini can't speak).
 */

export const browserTTS = new BrowserTTSProvider();
export const geminiTTS = new GeminiTTSProvider();

export function speechSynthesisSupported(): boolean {
  return browserTTS.supported();
}

/** Speaks with the browser voice. Resolves with the voice used, or null when the browser has no speech output. */
export function speak(text: string, lang: "en" | "uz" | "ru" = "en"): Promise<string | null> {
  return browserTTS.speak(text, { lang, rate: voiceSettings().rate });
}

/** Speaks with Gemini; null when it could not (the caller falls back). */
export function speakGemini(text: string, lang: "en" | "uz" | "ru" = "uz"): Promise<string | null> {
  return geminiTTS.speak(text, { lang, rate: voiceSettings().rate });
}

export function stopSpeaking() {
  void geminiTTS.stop();
  void browserTTS.stop();
}
