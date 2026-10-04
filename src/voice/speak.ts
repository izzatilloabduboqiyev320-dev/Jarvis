"use client";

/**
 * Text-to-speech. Phase 1 uses the browser's built-in voice (free, offline on
 * most systems). Phase 5 adds ElevenLabs behind a server route, with this as
 * the fallback.
 */

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

function pickVoice(voices: SpeechSynthesisVoice[], lang: "en" | "uz") {
  const by = (prefix: string) => voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(prefix));
  if (lang === "uz") {
    // Few systems ship an Uzbek voice; Turkish reads Latin Uzbek most naturally.
    return by("uz") ?? by("tr") ?? by("ru") ?? voices.find((v) => v.default) ?? voices[0];
  }
  return (
    voices.find((v) => /Daniel|Google UK English Male|Arthur|Oliver/i.test(v.name)) ??
    by("en-gb") ??
    by("en") ??
    voices.find((v) => v.default) ??
    voices[0]
  );
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Speaks `text`. Resolves with the voice used, or null when the browser has no speech output. */
export async function speak(text: string, lang: "en" | "uz" = "en"): Promise<string | null> {
  if (!speechSynthesisSupported()) return null;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(await loadVoices(synth), lang);
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    // Only name a language we have a voice for: an unknown lang can make the browser stay silent.
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = lang === "uz" ? 0.95 : 1.02;
    u.pitch = 0.9;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
    // Chrome sometimes pauses a queued utterance; nudge it.
    synth.resume();
    // Safety net: some browsers never fire onend.
    setTimeout(resolve, Math.min(30_000, 1500 + text.length * 80));
  });
  return voice ? `${voice.name} (${voice.lang})` : "default voice";
}

let currentAudio: HTMLAudioElement | null = null;

/**
 * Speaks with Gemini's natural voice via /api/tts (the key stays on the server).
 * Resolves with the voice name when audio played, or null when it could not (caller falls back).
 */
export async function speakGemini(text: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  stopSpeaking();
  try {
    const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 1500) }) });
    if (!res.ok) return null;
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    currentAudio = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.onpause = () => resolve();
      audio.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
    return "Gemini";
  } catch {
    return null;
  }
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
