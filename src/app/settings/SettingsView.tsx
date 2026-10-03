"use client";

import { useSyncExternalStore } from "react";
import { PageFrame } from "@/components/layout/SectionPage";
import { PanelTitle } from "@/components/layout/ui";
import { clearLocal } from "@/lib/graph-instance";
import { useJarvis } from "@/lib/store";
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
            <dd className="text-ink-dim">{status.voiceOutput === "elevenlabs" ? "ElevenLabs (Phase 5)" : "Browser voice"}</dd>
            <dt className="text-ink-faint">SPEECH INPUT</dt>
            <dd className="text-ink-dim">{sttSupported ? "Browser push-to-talk" : "Not supported in this browser"}</dd>
            <dt className="text-ink-faint">STORAGE</dt>
            <dd className="text-ink-dim">Demo graph + browser storage (SQLite in Phase 3)</dd>
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
            onClick={() => {
              if (confirm("Delete the notes, tasks and memories you created in this browser? This cannot be undone.")) {
                clearLocal();
                window.location.reload();
              }
            }}
            className="mt-5 border border-rose-400/40 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-rose-300/90 hover:border-rose-400"
          >
            Clear items I created
          </button>
        </section>

        <section className="md:col-span-2">
          <PanelTitle>API keys</PanelTitle>
          <p className="text-[13px] leading-relaxed text-ink-dim">
            Keys live only on the server, in a file called <code className="text-accent">.env.local</code> in the project folder (copy{" "}
            <code className="text-accent">.env.example</code>). They are never sent to the browser. Restart <code className="text-accent">npm run dev</code>{" "}
            after editing it.
          </p>
          <pre className="mt-3 border border-line bg-black/40 p-4 font-mono text-[12px] text-ink-dim">
{`ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=
TELEGRAM_BOT_TOKEN=`}
          </pre>
        </section>
      </div>
    </PageFrame>
  );
}
