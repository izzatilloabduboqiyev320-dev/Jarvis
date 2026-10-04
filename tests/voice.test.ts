import { test } from "node:test";
import assert from "node:assert/strict";
import { detectWake, isCancel, stripWake } from "@/voice/wake-word";
import { speechLang, toSpeech } from "@/voice/speech-text";
import { pickVoice } from "@/voice/providers/browser-tts";
import { VoiceManager, type VoiceDeps } from "@/voice/voice-manager";
import type { SpeechToTextProvider, SttErrorCode, SttHandlers, SttOptions } from "@/voice/providers/speech-to-text";
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "@/voice/settings";
import type { JarvisVoiceState } from "@/voice/voice-state";

// ── Wake word, cancel, spoken text ────────────────────────────────────

test("wake word: variants recognisers produce, in three languages", () => {
  for (const t of ["Jarvis", "jarvis!", "Hey Jarvis", "jervis", "Jarves", "Djarvis", "Джарвис", "ok JARVIS"]) assert.equal(detectWake(t).heard, true, t);
});

test("wake word: no false activation on similar words", () => {
  for (const t of ["Travis", "service", "jarvisga", "Jarvisning loyihasi", "harvest", "jar of beans", "Ivan Jarvisovich"]) assert.equal(detectWake(t).heard, false, t);
});

test("wake word with a command in the same breath", () => {
  assert.deepEqual(detectWake("Jarvis, bugungi ishlarimni ko'rsat"), { heard: true, command: "bugungi ishlarimni ko'rsat" });
  assert.deepEqual(detectWake("Джарвис, покажи мои проекты"), { heard: true, command: "покажи мои проекты" });
  assert.equal(stripWake("Jarvis, show ICT"), "show ICT");
  assert.equal(stripWake("tell Jarvis stories"), "tell Jarvis stories");
});

test("cancel phrases", () => {
  for (const t of ["cancel", "Jarvis, stop.", "never mind", "Bekor qil", "to'xta", "отмена"]) assert.equal(isCancel(t), true, t);
  for (const t of ["stop the music on YouTube", "cancel my 5pm task", "show ICT"]) assert.equal(isCancel(t), false, t);
});

test("spoken version drops links, lists and markdown and stays short", () => {
  const spoken = toSpeech("**Found 12 items.** See https://example.com\n- ICT strategy\n- Trading Journal\n\n" + "More detail. ".repeat(80));
  assert.ok(!spoken.includes("http") && !spoken.includes("*") && !spoken.includes("- "));
  assert.ok(spoken.length <= 421, String(spoken.length));
  assert.match(spoken, /^Found 12 items\./);
});

test("spoken language detection", () => {
  assert.equal(speechLang("Bugun sizda uchta loyiha bor"), "uz");
  assert.equal(speechLang("You have three active projects"), "en");
  assert.equal(speechLang("У вас три проекта"), "ru");
});

test("voice choice prefers a male voice in the right language, never assumes one exists", () => {
  const v = (name: string, lang: string, d = false) => ({ name, lang, default: d, localService: true, voiceURI: name }) as SpeechSynthesisVoice;
  const voices = [v("Samantha", "en-US", true), v("Daniel", "en-GB"), v("Milena", "ru-RU"), v("Yuri", "ru-RU"), v("Yelda", "tr-TR")];
  assert.equal(pickVoice(voices, "en")?.name, "Daniel");
  assert.equal(pickVoice(voices, "ru")?.name, "Yuri");
  assert.equal(pickVoice(voices, "uz")?.name, "Yelda");
  assert.equal(pickVoice([v("Samantha", "en-US", true)], "ru")?.name, "Samantha", "falls back to the default voice");
  assert.equal(pickVoice([], "en"), undefined);
});

// ── Voice manager with fake microphone and recogniser ─────────────────

class FakeStt implements SpeechToTextProvider {
  readonly name = "fake";
  starts: SttOptions[] = [];
  active: SttHandlers | null = null;
  supported() {
    return true;
  }
  async start(opts: SttOptions, h: SttHandlers) {
    this.starts.push(opts);
    this.active = h;
  }
  async stop() {
    const h = this.active;
    this.active = null;
    h?.onEnd();
  }
  abort() {
    this.active = null;
  }
  say(text: string, final = true) {
    this.active?.onTranscript(text, final);
  }
  error(code: SttErrorCode) {
    this.active?.onError(code);
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function setup(over: Partial<VoiceSettings> = {}, opts: { micDenied?: boolean } = {}) {
  const stt = new FakeStt();
  let state: JarvisVoiceState = "standby";
  const subs = new Set<(s: JarvisVoiceState) => void>();
  const asked: string[] = [];
  const logs: string[] = [];
  const states: JarvisVoiceState[] = [];
  const settings: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS, enabled: true, silenceMs: 30, followUpSeconds: 0.15 as number, ...over };
  let mics = 0;
  let interrupts = 0;
  let talking = false;
  const deps: VoiceDeps = {
    stt,
    ask: async (text) => {
      asked.push(text);
      setState("thinking");
      await tick(5);
      setState("speaking");
      await tick(5);
      setState("standby");
    },
    speakAck: async () => {},
    interrupt: () => interrupts++,
    acquireMic: async () => {
      if (opts.micDenied) throw new Error("denied");
      mics++;
    },
    releaseMic: () => {
      mics--;
    },
    isPermissionError: () => true,
    sound: () => {},
    settings: () => settings,
    lang: () => "uz-UZ",
    log: (_k, t) => logs.push(t),
    getState: () => state,
    setState: (s) => setState(s),
    setTalking: (on) => {
      talking = on;
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  function setState(s: JarvisVoiceState) {
    const changed = s !== state;
    state = s;
    states.push(s);
    if (changed) subs.forEach((fn) => fn(s));
  }
  const vm = new VoiceManager(deps);
  return { vm, stt, asked, logs, states, settings, get state() { return state; }, get mics() { return mics; }, get interrupts() { return interrupts; }, get talking() { return talking; }, setState };
}

test("voice off: the microphone is never opened", () => {
  const t = setup({ enabled: false });
  t.vm.sync();
  assert.equal(t.stt.starts.length, 0);
  assert.equal(t.mics, 0);
  assert.equal(t.state, "standby");
});

test("full flow: Jarvis → Yes? → command → same pipeline → follow-up → back to wake", async () => {
  const t = setup();
  t.vm.sync();
  t.vm.sync(); // repeated calls (React re-renders) must not add listeners
  assert.equal(t.state, "wake_listening");
  assert.equal(t.stt.starts.length, 1);
  assert.equal(t.mics, 1);

  t.stt.say("tell me something", true); // no wake word: ignored
  assert.equal(t.state, "wake_listening");

  t.stt.say("Jarvis");
  await tick(1);
  assert.equal(t.state, "listening");
  assert.ok(t.states.includes("awake"));
  assert.ok(t.logs.includes("Wake word detected: JARVIS"));

  t.stt.say("What is", false);
  t.stt.say("What is JARVIS");
  await tick(60); // silence ends the command
  assert.deepEqual(t.asked, ["What is JARVIS"]);
  assert.ok(t.states.includes("transcribing"));
  await tick(20);
  // Follow-up window: listening again without the wake word.
  assert.equal(t.state, "listening");
  t.stt.say("and its files?");
  await tick(80);
  assert.deepEqual(t.asked, ["What is JARVIS", "and its files?"]);
  await tick(250); // follow-up window closes with no speech
  assert.equal(t.state, "wake_listening");
  assert.ok(t.logs.includes("Follow-up window closed"));
  assert.equal(t.mics, 1, "one microphone the whole time");
});

test("wake word and command in one breath skips the question", async () => {
  const t = setup({ followUp: false });
  t.vm.sync();
  t.stt.say("Jarvis, show everything connected to ICT");
  await tick(30);
  assert.deepEqual(t.asked, ["show everything connected to ICT"]);
  assert.ok(!t.states.includes("awake"));
  assert.equal(t.state, "wake_listening");
});

test("cancel by voice does not reach the AI", async () => {
  const t = setup();
  t.vm.sync();
  t.stt.say("Jarvis");
  await tick(1);
  t.stt.say("never mind");
  await tick(60);
  assert.deepEqual(t.asked, []);
  assert.ok(t.logs.includes("Cancelled by voice"));
  assert.equal(t.state, "wake_listening");
});

test("manual activation works with the voice assistant off, then the microphone closes", async () => {
  const t = setup({ enabled: false });
  t.vm.listenNow();
  assert.equal(t.state, "listening");
  assert.equal(t.mics, 1);
  t.stt.say("bugungi ishlarimni ayt");
  await tick(80);
  assert.deepEqual(t.asked, ["bugungi ishlarimni ayt"]);
  assert.equal(t.state, "standby");
  assert.equal(t.mics, 0);
  assert.equal(t.stt.active, null);
});

test("stop interrupts speech and the request, and approvals by voice end", async () => {
  const t = setup();
  t.vm.sync();
  t.stt.say("Jarvis, what am I working on");
  await tick(1);
  assert.equal(t.talking, true);
  t.vm.stop();
  assert.equal(t.interrupts, 1);
  assert.equal(t.talking, false);
  await tick(30);
  assert.equal(t.state, "wake_listening");
});

test("denied microphone permission shows the explanation and stops", async () => {
  const t = setup({}, { micDenied: true });
  t.vm.sync();
  await tick(1);
  assert.equal(t.state, "error");
  assert.ok(t.logs.some((l) => l.startsWith("Microphone permission is required")));
  assert.equal(t.stt.active, null);
});

test("recogniser permission error is handled the same way", async () => {
  const t = setup();
  t.vm.sync();
  t.stt.error("permission");
  assert.equal(t.state, "error");
  assert.equal(t.mics, 0);
});

test("the wake listener restarts when the browser ends it, and steps aside while JARVIS answers typed chat", async () => {
  const t = setup();
  t.vm.sync();
  await t.stt.stop(); // browser ended recognition
  await tick(300);
  assert.equal(t.stt.starts.length, 2);
  assert.equal(t.state, "wake_listening");

  t.setState("thinking"); // a typed request
  assert.equal(t.stt.active, null, "not listening while JARVIS answers");
  t.setState("speaking");
  t.setState("standby");
  assert.equal(t.state, "wake_listening");
  assert.ok(t.stt.active);
});

test("turning voice off releases the microphone and stops listening", () => {
  const t = setup();
  t.vm.sync();
  t.settings.enabled = false;
  t.vm.sync();
  assert.equal(t.mics, 0);
  assert.equal(t.stt.active, null);
  assert.equal(t.state, "standby");
});
