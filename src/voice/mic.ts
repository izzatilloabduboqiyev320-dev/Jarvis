"use client";

/**
 * The microphone level meter that drives the HUD rings. One MediaStream and
 * one AudioContext at most, shared by everything that listens; released when
 * nothing needs them. Audio is only measured here, never recorded or stored.
 */

type Listener = (level: number) => void;
const listeners = new Set<Listener>();
const activeListeners = new Set<(active: boolean) => void>();

let stream: MediaStream | null = null;
let ctx: AudioContext | null = null;
let raf = 0;
let users = 0;
let starting: Promise<void> | null = null;
let smooth = 0;

export function onMicLevel(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Called with true while the microphone is open (for the privacy indicator). */
export function onMicActive(fn: (active: boolean) => void) {
  activeListeners.add(fn);
  return () => {
    activeListeners.delete(fn);
  };
}

export class MicPermissionError extends Error {}

function emit(level: number) {
  listeners.forEach((fn) => fn(level));
}

async function open() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser has no microphone access");
  let s: MediaStream;
  try {
    s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new MicPermissionError("Microphone permission denied");
    if (name === "NotFoundError") throw new Error("No microphone was found");
    throw err;
  }
  if (!users) {
    s.getTracks().forEach((t) => t.stop());
    return;
  }
  stream = s;
  ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(s).connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);
  activeListeners.forEach((fn) => fn(true));
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += ((v - 128) / 128) ** 2;
    const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
    // Rise fast, fall slowly: smooth rings without jitter.
    smooth = level > smooth ? smooth * 0.5 + level * 0.5 : smooth * 0.88 + level * 0.12;
    emit(smooth);
    raf = requestAnimationFrame(tick);
  };
  tick();
}

/** Opens the microphone (or joins the open one). Throws MicPermissionError when access is denied. */
export async function acquireMic(): Promise<void> {
  users++;
  if (stream) return;
  starting ??= open().finally(() => {
    starting = null;
  });
  try {
    await starting;
  } catch (err) {
    users = Math.max(0, users - 1);
    throw err;
  }
}

/** Leaves the microphone; it closes when nobody uses it any more. */
export function releaseMic() {
  users = Math.max(0, users - 1);
  if (users) return;
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  void ctx?.close().catch(() => {});
  ctx = null;
  smooth = 0;
  emit(0);
  activeListeners.forEach((fn) => fn(false));
}

export function micOpen(): boolean {
  return Boolean(stream);
}
