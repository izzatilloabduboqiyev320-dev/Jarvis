"use client";

import { useJarvis } from "@/lib/store";
import { askJarvis, interruptJarvis } from "@/services/jarvis";
import { acquireMic, MicPermissionError, releaseMic } from "@/voice/mic";
import { BrowserSpeechProvider } from "@/voice/providers/browser-speech";
import { voiceSettings } from "@/voice/settings";
import { playSound } from "@/voice/sounds";
import { speak } from "@/voice/speak";
import { VoiceManager } from "@/voice/voice-manager";

/**
 * The page's one voice manager, wired to the real browser providers and to
 * JARVIS's normal chat pipeline. Created on first use, never per render.
 */

let instance: VoiceManager | null = null;

export function getVoice(): VoiceManager {
  if (instance) return instance;
  const store = useJarvis;
  instance = new VoiceManager({
    stt: new BrowserSpeechProvider(),
    ask: (text) => askJarvis(text, { voice: true, lang: store.getState().voiceLang === "uz-UZ" ? "uz" : undefined }),
    speakAck: async (text) => {
      // The browser voice answers instantly (no network); keeps "Yes?" snappy.
      const s = store.getState();
      if (!s.voiceReplies) return;
      await speak(text, s.voiceLang === "uz-UZ" ? "uz" : s.voiceLang === "ru-RU" ? "ru" : "en");
    },
    interrupt: interruptJarvis,
    acquireMic,
    releaseMic,
    isPermissionError: (err) => err instanceof MicPermissionError,
    sound: playSound,
    settings: voiceSettings,
    lang: () => store.getState().voiceLang,
    log: (kind, text) => store.getState().log(kind, text),
    getState: () => store.getState().hud,
    setState: (s, detail) => store.getState().setHud(s, detail),
    setTalking: (on) => store.getState().setTalking(on),
    subscribe: (fn) => store.subscribe((s, prev) => s.hud !== prev.hud && fn(s.hud)),
  });
  return instance;
}
