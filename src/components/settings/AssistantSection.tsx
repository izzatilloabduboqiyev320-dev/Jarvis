"use client";

import { useCallback, useEffect, useState } from "react";
import { PanelTitle } from "@/components/layout/ui";

const headers = { "Content-Type": "application/json", "x-jarvis-local": "1" };

interface Info {
  ok?: boolean;
  configured: boolean;
  username?: string;
  paired: boolean;
  ownerName?: string;
  pairCode?: string;
  status?: string;
  message?: string;
}

/** "JARVIS Telegram'da": a dedicated bot so Izzatillo can talk to JARVIS from the phone. */
export default function AssistantSection() {
  const [info, setInfo] = useState<Info | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo((await fetch("/api/telegram/assistant", { cache: "no-store" }).then((r) => r.json())) as Info);
    } catch {
      setInfo({ configured: false, paired: false });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one fetch on mount
    void load();
  }, [load]);

  // While waiting for the pairing code, check every few seconds.
  useEffect(() => {
    if (!info?.configured || info.paired) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [info?.configured, info?.paired, load]);

  const call = async (init: RequestInit, done?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const j = (await fetch("/api/telegram/assistant", { ...init, headers }).then((r) => r.json())) as Info;
      if (j.ok) {
        setInfo(j);
        if (done) setMsg({ ok: true, text: done });
      } else setMsg({ ok: false, text: j.message ?? "Bo'lmadi." });
    } catch {
      setMsg({ ok: false, text: "Server bilan bog'lanib bo'lmadi." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="md:col-span-2" data-testid="assistant-section">
      <PanelTitle>JARVIS Telegram&apos;da</PanelTitle>
      {!info?.configured && (
        <>
          <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">
            Telefoningizdan JARVIS bilan yozib yoki ovozli xabar bilan gaplashing. Buning uchun JARVIS&apos;ga <b>alohida yangi bot</b> kerak
            (hozirgi botlaringizga tegmaymiz): Telegram&apos;da <b>@BotFather</b> → <b>/newbot</b> → nom bering (masalan, <i>Izzatillo JARVIS</i>) →
            username bering (oxiri <i>bot</i> bilan tugasin). BotFather bergan tokenni shu yerga qo&apos;ying. Token faqat shu kompyuterda saqlanadi.
          </p>
          <form
            className="mt-3 flex max-w-2xl gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (token.trim() && !busy) void call({ method: "POST", body: JSON.stringify({ token: token.trim() }) }).then(() => setToken(""));
            }}
          >
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAH..."
              autoComplete="off"
              spellCheck={false}
              className="h-9 flex-1 border border-line bg-black px-3 font-mono text-[12.5px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
              data-testid="assistant-token"
            />
            <button
              type="submit"
              disabled={busy || !token.trim()}
              className="border border-accent/50 px-4 font-mono text-[10.5px] uppercase tracking-wider text-accent hover:border-accent disabled:opacity-40"
              data-testid="assistant-save"
            >
              {busy ? "…" : "Ulash"}
            </button>
          </form>
        </>
      )}

      {info?.configured && !info.paired && (
        <div className="max-w-2xl border border-accent/40 bg-accent/[0.04] px-4 py-3 text-[13px] leading-relaxed text-ink-dim" data-testid="assistant-pair">
          Oxirgi qadam: Telegram&apos;da{" "}
          <a href={`https://t.me/${info.username}`} target="_blank" rel="noreferrer" className="text-accent underline">
            @{info.username}
          </a>{" "}
          ni oching, <b>Start</b> ni bosing va shu kodni yuboring:
          <div className="mt-2 font-mono text-[28px] tracking-[0.3em] text-ink" data-testid="assistant-code">
            {info.pairCode}
          </div>
          <div className="text-[11.5px] text-ink-faint">Kod 15 daqiqa amal qiladi. Ulangach, bu yerda o&apos;zi ko&apos;rinadi.</div>
        </div>
      )}

      {info?.configured && info.paired && (
        <p className="max-w-2xl text-[13px] text-emerald-300/90" data-testid="assistant-status">
          ✅ Ulangan: @{info.username}
          {info.ownerName ? ` · ${info.ownerName}` : ""}. Telegram&apos;da unga yozing yoki ovozli xabar yuboring.
        </p>
      )}

      {info?.status && <p className="mt-2 text-[12.5px] text-amber-300/90">{info.status}</p>}

      {info?.configured && (
        <div className="mt-3 flex gap-2">
          {info.paired && (
            <button
              onClick={() => void call({ method: "POST", body: JSON.stringify({ unpair: true }) })}
              disabled={busy}
              className="border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-ink-dim hover:border-accent/60 hover:text-accent"
            >
              Boshqa chatga ulash
            </button>
          )}
          <button
            onClick={() => {
              if (!confirm) return setConfirm(true);
              setConfirm(false);
              void call({ method: "DELETE" }, "JARVIS boti uzildi.");
            }}
            disabled={busy}
            className="border border-rose-400/40 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-rose-300/90 hover:border-rose-400"
            data-testid="assistant-remove"
          >
            {confirm ? "Rostdanmi?" : "Uzish"}
          </button>
        </div>
      )}
      {msg && <p className={`mt-2 text-[12.5px] ${msg.ok ? "text-emerald-300/90" : "text-rose-300"}`} data-testid="assistant-message">{msg.text}</p>}
    </section>
  );
}
