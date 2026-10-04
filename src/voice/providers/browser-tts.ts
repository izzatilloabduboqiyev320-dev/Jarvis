"use client";

import type { SpeakOptions, TextToSpeechProvider } from "@/voice/providers/text-to-speech";

/** Chrome loads its voice list asynchronously; wait briefly for it on first use. */
function loadVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", done);
    setTimeout(done, 1200);
  });
}

// Calm male voices that ship with macOS, Chrome and Windows. Used only to rank voices that exist.
const MALE = /\b(daniel|alex|fred|aaron|arthur|oliver|tom|rishi|evan|nathan|reed|eddy|ralph|lee|gordon|thomas|jorge|yuri|maxim|pavel|dmitri|cem|guy|ryan|davis|george|male)\b/i;
const FEMALE = /\b(samantha|karen|moira|tessa|victoria|fiona|serena|kate|susan|allison|ava|zoe|nicky|milena|katya|yelda|female|zira|hazel|libby|sonia|aria|jenny|google us english)\b/i;
const QUALITY = /(premium|enhanced|natural|neural|siri)/i;

/** Best voice for a language: matching language, male, higher quality. Never assumes a voice exists. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: "uz" | "en" | "ru"): SpeechSynthesisVoice | undefined {
  // Few systems have an Uzbek voice; Turkish reads Latin Uzbek most naturally.
  const prefs = lang === "uz" ? ["uz", "tr", "ru"] : lang === "ru" ? ["ru"] : ["en-gb", "en"];
  let best: SpeechSynthesisVoice | undefined;
  let bestScore = -Infinity;
  for (const v of voices) {
    const vl = v.lang.toLowerCase().replace("_", "-");
    const p = prefs.findIndex((x) => vl.startsWith(x));
    if (p < 0) continue;
    let score = (prefs.length - p) * 100; // language first, then voice qualities
    if (MALE.test(v.name)) score += 6;
    if (FEMALE.test(v.name)) score -= 6;
    if (QUALITY.test(v.name)) score += 3;
    if (v.localService) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best ?? voices.find((v) => v.default) ?? voices[0];
}

export class BrowserTTSProvider implements TextToSpeechProvider {
  readonly name = "Browser voice";

  supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  async speak(text: string, opts: SpeakOptions): Promise<string | null> {
    if (!this.supported()) return null;
    const synth = window.speechSynthesis;
    synth.cancel();
    const voice = pickVoice(await loadVoices(synth), opts.lang);
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      // Only name a language we have a voice for: an unknown lang can make the browser stay silent.
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.rate = (opts.lang === "uz" ? 0.95 : 1.02) * opts.rate;
      u.pitch = 0.9;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
      // Chrome sometimes pauses a queued utterance; nudge it.
      synth.resume();
      // Safety net: some browsers never fire onend.
      setTimeout(resolve, Math.min(40_000, 1500 + (text.length * 80) / opts.rate));
    });
    return voice ? `${voice.name} (${voice.lang})` : "default voice";
  }

  async stop(): Promise<void> {
    if (this.supported()) window.speechSynthesis.cancel();
  }
}
