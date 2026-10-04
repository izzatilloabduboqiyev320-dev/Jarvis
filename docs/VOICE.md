# JARVIS voice

## How it works now (Level 1, free, in Chrome)

```
microphone ─▶ BrowserSpeechProvider (Chrome speech recognition, continuous)
                │  final phrase contains "Jarvis"?  (src/voice/wake-word.ts)
                ▼
            AWAKE ── chime + "Labbay?" / "Yes?" / "Да?" (browser voice, instant)
                ▼
            LISTENING ── interim text on the HUD; ~1.1 s of silence ends the command
                ▼
            TRANSCRIBING ── "cancel / bekor qil / отмена" stops here
                ▼
            askJarvis(text, { voice: true })   ← the SAME pipeline as typed chat
                │  /api/chat → runJarvis: memory + graph → Claude (Gemini backup) → tools
                │  approvals: card on screen + "ha / yo'q" by voice (never voice-only)
                ▼
            SPEAKING ── short spoken version (toSpeech), full answer in chat
                ▼
            follow-up window (10 s, no "Jarvis" needed) ─▶ back to SAY "JARVIS"
```

- **One state:** `useJarvis().hud` holds a `JarvisVoiceState` (`src/voice/voice-state.ts`). The voice manager, the chat pipeline and approvals all write that one value; the HUD only reads it.
- **One manager per page:** `getVoice()` (`src/voice/index.ts`) creates the `VoiceManager` once. React components call it; they never own microphones or recognisers. Keyboard shortcuts are installed once (`src/voice/controls.ts`).
- **One microphone:** `src/voice/mic.ts` opens a single MediaStream + AudioContext for the HUD level meter, reference-counted, closed when voice stops.
- **Never hears itself:** recognition is stopped while JARVIS thinks or speaks, also for typed requests.
- **Privacy:** no audio is recorded or stored by JARVIS. Chrome's recogniser sends audio to Google's speech service while it listens (that is how the free browser recogniser works). A red dot next to the model name shows whenever the microphone is open; Voice · Off closes it.
- **Controls:** HUD click / Talk / ⌘⇧Space (Ctrl+Shift+Space) listen without the wake word; the same while JARVIS works, or Esc, stops it.
- **Settings → Ovoz:** voice assistant, wake word, follow-up (timeout), text-to-speech, speed, interface sounds, listening language. Saved in the browser (`jarvis.voice.v1`).
- **Debug:** open `/graph?voicedebug=1` for state, mic, provider, last wake, last transcript and level.

### Providers

| Interface | Now | Later |
|---|---|---|
| `SpeechToTextProvider` (`src/voice/providers/speech-to-text.ts`) | `BrowserSpeechProvider` | `MacSpeechProvider` (helper below), `WhisperProvider` |
| `TextToSpeechProvider` (`src/voice/providers/text-to-speech.ts`) | `BrowserTTSProvider` (picks a calm male voice that exists, per language), `GeminiTTSProvider` (optional, natural Uzbek) | `MacOSTTSProvider` (`say`), ElevenLabs |

Limits of Level 1: the JARVIS tab must be open (it can be in the background); Chrome listens in one language at a time (Settings → Ovoz → listening language; JARVIS answers in the language it hears).

## Level 2: local macOS helper (prepared, not built)

Goal: JARVIS answers "Jarvis" with the browser closed, and audio stays on the Mac.

```
jarvis-voice-helper (Swift, menu-bar app, launches at login)
  ├─ wake word: SFSpeechRecognizer with requiresOnDeviceRecognition = true
  │            (or a small keyword model), always local
  ├─ command STT: SFSpeechRecognizer on-device (en, ru; uz not offered on-device yet)
  │            or whisper.cpp (ggml-small, multilingual incl. Uzbek) for the command only
  ├─ TTS: AVSpeechSynthesizer / `say` with the chosen voice
  └─ WebSocket server on 127.0.0.1:47823 only
         auth: random token written to ~/.jarvis/voice-helper.token (mode 600),
               sent by the Next.js server on connect; no other origin accepted
                 │
JARVIS Next.js server ── /api/voice/helper bridge
   └─ runs the same runJarvis() pipeline, sends back text + "speak" events
      and state changes to the browser HUD when it is open
```

Why this choice: the macOS Speech framework is built in (no download, low CPU, on-device for English and Russian); whisper.cpp covers Uzbek well and runs fast on Apple Silicon, but only after the wake word, never continuously. faster-whisper needs Python and is heavier. In the web app the helper becomes `MacSpeechProvider` and `MacOSTTSProvider`, so the voice manager and HUD don't change.

Safety rules carry over unchanged: the helper only moves text; every action still goes through JARVIS's registered tools and approvals; nothing listens on a public interface.
