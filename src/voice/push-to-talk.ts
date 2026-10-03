"use client";

/**
 * Push-to-talk speech-to-text using the browser's Web Speech API (free, no key)
 * plus a microphone level meter that drives the HUD's listening ring.
 * Phase 5 replaces/augments this with server-side STT and a wake word.
 */

type Listener = (level: number) => void;
const levelListeners = new Set<Listener>();

export function onMicLevel(fn: Listener) {
  levelListeners.add(fn);
  return () => {
    levelListeners.delete(fn);
  };
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export interface PushToTalkHandlers {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone permission was denied. Allow microphone access for this site in your browser settings, then try again.",
  "service-not-allowed": "Speech recognition is blocked by the browser. Try Chrome or Edge, served from localhost.",
  "no-speech": "I didn't hear anything. Hold the mic button and speak, or type with ⌘K.",
  "audio-capture": "No microphone was found. Check that one is connected and selected in system settings.",
  network: "The browser's speech service could not be reached. Check your internet connection.",
};

/** Starts listening. Returns a stop function. */
export function startPushToTalk(h: PushToTalkHandlers): () => void {
  const w = window as unknown as Record<string, new () => RecognitionLike>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) {
    h.onError("Speech recognition isn't supported in this browser. Use Chrome or Edge, or type with ⌘K.");
    h.onEnd();
    return () => {};
  }

  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let raf = 0;
  let finalText = "";
  let stopped = false;

  const stopMeter = () => {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
    levelListeners.forEach((fn) => fn(0));
  };

  navigator.mediaDevices
    ?.getUserMedia({ audio: true })
    .then((s) => {
      if (stopped) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        levelListeners.forEach((fn) => fn(Math.min(1, rms * 4)));
        raf = requestAnimationFrame(tick);
      };
      tick();
    })
    .catch(() => {
      /* level meter is cosmetic; recognition reports permission errors itself */
    });

  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let interim = "";
    finalText = "";
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    h.onInterim?.(finalText + interim);
  };
  rec.onerror = (e) => {
    if (e.error === "aborted") return;
    h.onError(ERRORS[e.error] ?? `Speech recognition error: ${e.error}`);
  };
  rec.onend = () => {
    stopMeter();
    if (finalText.trim()) h.onFinal(finalText.trim());
    h.onEnd();
  };
  try {
    rec.start();
  } catch (err) {
    stopMeter();
    h.onError(`Could not start the microphone: ${(err as Error).message}`);
    h.onEnd();
  }

  return () => {
    stopped = true;
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  };
}
