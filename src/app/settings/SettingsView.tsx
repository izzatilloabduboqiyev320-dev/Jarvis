"use client";

import { useSyncExternalStore } from "react";
import { PageFrame } from "@/components/layout/SectionPage";
import ApiKeySection from "@/components/settings/ApiKeySection";
import TelegramSection from "@/components/settings/TelegramSection";
import { PanelTitle } from "@/components/layout/ui";
import { useJarvis } from "@/lib/store";
import { testVoice } from "@/services/jarvis";
import { speechRecognitionSupported } from "@/voice/push-to-talk";

const noopSubscribe = () => () => {};

export default function SettingsView() {
  const status = useJarvis((s) => s.status);
  const voiceReplies = useJarvis((s) => s.voiceReplies);
  const setVoiceReplies = useJarvis((s) => s.setVoiceReplies);
  const voiceLang = useJarvis((s) => s.voiceLang);
  const setVoiceLang = useJarvis((s) => s.setVoiceLang);
  const sttSupported = useSyncExternalStore(noopSubscribe, speechRecognitionSupported, () => false);

  return (
    <PageFrame title="Settings" subtitle="Configuration and system status.">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <section>
          <PanelTitle>System</PanelTitle>
          <dl className="grid grid-cols-[150px_1fr] gap-y-2 font-mono text-[12px]">
            <dt className="text-ink-faint">MODE</dt>
            <dd className={status.mode === "demo" ? "text-amber-300/90" : "text-emerald-300/90"}>
              {status.mode === "demo" ? "DEMO (no API key)" : "AI KEY DETECTED"}
            </dd>
            <dt className="text-ink-faint">MODEL</dt>
            <dd className="text-ink-dim">{status.model}</dd>
            <dt className="text-ink-faint">VOICE OUTPUT</dt>
            <dd className="text-ink-dim">{status.voiceOutput === "gemini" ? "Gemini (natural Uzbek voice)" : status.voiceOutput === "elevenlabs" ? "ElevenLabs" : "Browser voice"}</dd>
            <dt className="text-ink-faint">SPEECH INPUT</dt>
            <dd className="text-ink-dim">{sttSupported ? "Browser push-to-talk" : "Not supported in this browser"}</dd>
            <dt className="text-ink-faint">STORAGE</dt>
            <dd className="text-ink-dim">Demo graph + ~/.jarvis on this computer (permanent)</dd>
          </dl>
        </section>

        <section>
          <PanelTitle>Preferences</PanelTitle>
          <label className="flex cursor-pointer items-center gap-3 text-[13px] text-ink-dim">
            <input type="checkbox" checked={voiceReplies} onChange={(e) => setVoiceReplies(e.target.checked)} className="accent-[var(--color-accent)]" />
            Speak JARVIS replies aloud
          </label>
          <label className="mt-4 flex items-center gap-3 text-[13px] text-ink-dim">
            Voice language
            <select
              value={voiceLang}
              onChange={(e) => setVoiceLang(e.target.value as typeof voiceLang)}
              className="border border-line bg-black px-2 py-1 font-mono text-[12px] text-ink"
              data-testid="voice-lang-select"
            >
              <option value="uz-UZ">O&apos;zbekcha</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <p className="mt-1 text-[12px] text-ink-faint">Voice input works best in Google Chrome.</p>
          <button
            onClick={() => void testVoice()}
            className="mt-3 border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-ink-dim hover:border-accent/60 hover:text-accent"
          >
            Test voice
          </button>
        </section>

        <ApiKeySection
          title="Gemini API key (natural voice)"
          endpoint="/api/settings/gemini-key"
          placeholder="AIza..."
          testId="gemini-key-section"
          help={
            <>
              JARVIS haqiqiy o&apos;zbekcha ovozda gapirishi uchun: aistudio.google.com saytiga kiring, <b>Get API key</b> → <b>Create API key</b> ni bosing,
              kalitni shu yerga joylang va <b>Saqlash</b> ni bosing. Claude kaliti bo&apos;lmasa, Gemini javob ham beradi.
            </>
          }
        />
        <ApiKeySection
          title="Claude API key"
          endpoint="/api/settings/claude-key"
          placeholder="sk-ant-..."
          testId="claude-key-section"
          help={<>Kalitni console.anthropic.com → API Keys dan nusxalab, shu yerga joylang va <b>Saqlash</b> ni bosing.</>}
        />
        <TelegramSection />
      </div>
    </PageFrame>
  );
}
