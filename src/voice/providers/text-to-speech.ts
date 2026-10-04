/**
 * Text-to-speech providers. Browser voices are free and always available;
 * Gemini (natural Uzbek) is an optional upgrade when its key is set; a macOS
 * helper (`say`) or ElevenLabs can be added behind the same interface.
 */
export interface SpeakOptions {
  lang: "uz" | "en" | "ru";
  /** 1 = normal speed. */
  rate: number;
}

export interface TextToSpeechProvider {
  readonly name: string;
  /** Resolves when speech ends (or is stopped); returns the voice used, or null when it could not speak. */
  speak(text: string, opts: SpeakOptions): Promise<string | null>;
  stop(): Promise<void>;
}
