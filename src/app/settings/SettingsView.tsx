"use client";

import { useSyncExternalStore } from "react";
import { PageFrame } from "@/components/layout/SectionPage";
import ApiKeySection from "@/components/settings/ApiKeySection";
import AssistantSection from "@/components/settings/AssistantSection";
import TelegramSection from "@/components/settings/TelegramSection";
import VoiceSection from "@/components/settings/VoiceSection";
import UpdateButton from "@/components/layout/UpdateButton";
import { PanelTitle } from "@/components/layout/ui";
import { useJarvis } from "@/lib/store";
import { speechRecognitionSupported } from "@/voice/push-to-talk";

const noopSubscribe = () => () => {};

export default function SettingsView() {
  const status = useJarvis((s) => s.status);
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
            <dd className="text-ink-dim">{sttSupported ? "Browser speech (wake word + push-to-talk)" : "Not supported in this browser"}</dd>
            <dt className="text-ink-faint">STORAGE</dt>
            <dd className="text-ink-dim">Demo graph + ~/.jarvis on this computer (permanent)</dd>
          </dl>
        </section>

        <VoiceSection />

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
        <AssistantSection />
        <TelegramSection />
        <div className="md:col-span-2">
          <PanelTitle>Yangilash</PanelTitle>
          <UpdateButton />
        </div>
      </div>
    </PageFrame>
  );
}
