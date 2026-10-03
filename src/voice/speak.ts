"use client";

/**
 * Text-to-speech. Phase 1 uses the browser's built-in voice (free, offline on
 * most systems). Phase 5 adds ElevenLabs behind a server route, with this as
 * the fallback.
 */
function pickVoice(voices: SpeechSynthesisVoice[], lang: "en" | "uz") {
  if (lang === "uz") {
    // Few systems ship an Uzbek voice; Turkish is the closest-sounding fallback.
    return (
      voices.find((v) => v.lang.toLowerCase().startsWith("uz")) ??
      voices.find((v) => v.lang.toLowerCase().startsWith("tr")) ??
      voices.find((v) => v.lang.toLowerCase().startsWith("ru"))
    );
  }
  return (
    voices.find((v) => /Daniel|Google UK English Male|Arthur|Oliver/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en-GB")) ??
    voices.find((v) => v.lang.startsWith("en"))
  );
}

export function speak(text: string, lang: "en" | "uz" = "en"): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const preferred = pickVoice(synth.getVoices(), lang);
    if (preferred) u.voice = preferred;
    u.lang = preferred?.lang ?? (lang === "uz" ? "uz-UZ" : "en-GB");
    u.rate = 1.02;
    u.pitch = 0.9;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
    // Safety net: some browsers never fire onend.
    setTimeout(resolve, Math.min(20_000, 1500 + text.length * 70));
  });
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
