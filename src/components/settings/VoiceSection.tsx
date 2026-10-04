"use client";

import { PanelTitle } from "@/components/layout/ui";
import { useJarvis } from "@/lib/store";
import { testVoice } from "@/services/jarvis";
import { getVoice } from "@/voice";
import { useVoiceSettings, type VoiceSettings } from "@/voice/settings";
import { unlockAudio } from "@/voice/sounds";

/** Settings → Ovoz: the voice assistant's switches. Saved in this browser. */
export default function VoiceSection() {
  const v = useVoiceSettings();
  const voiceReplies = useJarvis((s) => s.voiceReplies);
  const setVoiceReplies = useJarvis((s) => s.setVoiceReplies);
  const voiceLang = useJarvis((s) => s.voiceLang);
  const setVoiceLang = useJarvis((s) => s.setVoiceLang);

  const set = (patch: Partial<VoiceSettings>) => {
    unlockAudio();
    if (patch.enabled === false) getVoice().stop("Voice assistant off");
    v.update(patch);
    getVoice().sync();
  };

  const toggle = (label: string, help: string, checked: boolean, onChange: (on: boolean) => void, testId: string) => (
    <label className="flex cursor-pointer items-start gap-3 text-[13px] text-ink-dim">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-[var(--color-accent)]" data-testid={testId} />
      <span>
        {label}
        <span className="block text-[11.5px] text-ink-faint">{help}</span>
      </span>
    </label>
  );

  return (
    <section data-testid="voice-section">
      <PanelTitle>Ovoz (Voice)</PanelTitle>
      <div className="flex flex-col gap-3">
        {toggle("Voice assistant", "Yoniq bo'lsa, JARVIS mikrofonni ishlatadi. O'chiq bo'lsa, mikrofon faqat Talk bosilganda yoqiladi.", v.enabled, (on) => set({ enabled: on }), "voice-enabled")}
        {toggle("Wake word: “Jarvis”", "Sahifa ochiq turganda “Jarvis” deyishingizni kutadi.", v.wakeWord, (on) => set({ wakeWord: on }), "voice-wake")}
        {toggle("Follow-up mode", "Javobdan keyin “Jarvis” demasdan yana gapirish mumkin.", v.followUp, (on) => set({ followUp: on }), "voice-followup")}
        <label className="flex items-center gap-3 pl-6 text-[13px] text-ink-dim">
          Follow-up timeout
          <input
            type="number"
            min={3}
            max={30}
            value={v.followUpSeconds}
            onChange={(e) => set({ followUpSeconds: Math.min(30, Math.max(3, Number(e.target.value) || 10)) })}
            className="w-16 border border-line bg-black px-2 py-0.5 font-mono text-[12px] text-ink"
            data-testid="voice-followup-seconds"
          />
          sec
        </label>
        {toggle("Text-to-speech", "JARVIS javoblarini ovoz chiqarib aytadi.", voiceReplies, setVoiceReplies, "voice-tts")}
        <label className="flex items-center gap-3 pl-6 text-[13px] text-ink-dim">
          Speech speed
          <input
            type="range"
            min={0.7}
            max={1.4}
            step={0.05}
            value={v.rate}
            onChange={(e) => set({ rate: Number(e.target.value) })}
            className="accent-[var(--color-accent)]"
            data-testid="voice-rate"
          />
          <span className="font-mono text-[12px]">{v.rate.toFixed(2)}</span>
        </label>
        {toggle("Interface sounds", "Uyg'onganda va tinglashni boshlaganda qisqa ovozlar.", v.sounds, (on) => set({ sounds: on }), "voice-sounds")}
        <label className="flex items-center gap-3 text-[13px] text-ink-dim">
          Listening language
          <select
            value={voiceLang}
            onChange={(e) => {
              setVoiceLang(e.target.value as typeof voiceLang);
              getVoice().stop("Listening language changed");
              getVoice().sync();
            }}
            className="border border-line bg-black px-2 py-1 font-mono text-[12px] text-ink"
            data-testid="voice-lang-select"
          >
            <option value="uz-UZ">O&apos;zbekcha</option>
            <option value="en-US">English</option>
            <option value="ru-RU">Русский</option>
          </select>
        </label>
        <p className="text-[11.5px] text-ink-faint">
          Brauzer bir vaqtda bitta tilda tinglaydi; JARVIS esa siz gapirgan tilda javob beradi. Google Chrome&apos;da eng yaxshi ishlaydi. Ovoz yozib olinmaydi va
          saqlanmaydi.
        </p>
        <button
          onClick={() => void testVoice()}
          className="self-start border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-ink-dim hover:border-accent/60 hover:text-accent"
        >
          Test voice
        </button>
      </div>
    </section>
  );
}
