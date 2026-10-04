"use client";

import { useCallback, useEffect, useState } from "react";

interface Info {
  configured: boolean;
  current: string | null;
  latest?: string;
  message?: string;
  available: boolean;
  error?: string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for JARVIS to come back after the restart, then reloads the page. */
async function reloadWhenBack() {
  await wait(2500);
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (r.ok) return window.location.reload();
    } catch {
      /* still restarting */
    }
    await wait(1000);
  }
  return false;
}

/**
 * "Yangilash" — one-click update from GitHub. `banner` shows a small floating
 * notice only when an update exists; otherwise it renders the Settings block.
 */
export default function UpdateButton({ banner = false }: { banner?: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<"idle" | "checking" | "updating" | "stuck">("idle");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const check = useCallback(async () => {
    setState("checking");
    try {
      setInfo((await fetch("/api/update", { cache: "no-store" }).then((r) => r.json())) as Info);
    } catch {
      setInfo(null);
    }
    setState("idle");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one fetch on mount
    void check();
  }, [check]);

  const update = async () => {
    setState("updating");
    setMsg({ ok: true, text: "Yangilanmoqda… Sahifani yopmang." });
    try {
      const j = (await fetch("/api/update", { method: "POST", headers: { "x-jarvis-local": "1" } }).then((r) => r.json())) as {
        ok: boolean;
        message: string;
        restart?: boolean;
      };
      setMsg({ ok: j.ok, text: j.message });
      if (!j.ok || !j.restart) return setState("idle");
      if ((await reloadWhenBack()) === false) {
        setState("stuck");
        setMsg({ ok: false, text: "JARVIS qayta ishga tushmadi. Terminalda npm run dev deb yozib Enter bosing." });
      }
    } catch {
      setState("idle");
      setMsg({ ok: false, text: "Server bilan bog'lanib bo'lmadi." });
    }
  };

  const busy = state === "checking" || state === "updating";
  const button = (
    <button
      onClick={() => void update()}
      disabled={busy}
      className="border border-accent/60 bg-accent/10 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-accent hover:border-accent disabled:opacity-50"
      data-testid="update-apply"
    >
      {state === "updating" ? "Yangilanmoqda…" : "Yangilash"}
    </button>
  );

  if (banner) {
    if (!info?.available && state !== "updating") return null;
    return (
      <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 flex max-w-sm items-center gap-3 border border-accent/40 bg-black/90 px-3 py-2 text-[12px] text-ink-dim shadow-lg" data-testid="update-banner">
        <span className="flex-1">
          {msg?.text ?? (
            <>
              JARVIS&apos;ning yangi versiyasi bor{info?.message ? <span className="block truncate text-ink-faint">{info.message}</span> : null}
            </>
          )}
        </span>
        {state !== "stuck" && button}
      </div>
    );
  }

  return (
    <section className="md:col-span-2" data-testid="update-section">
      <div className="font-mono text-[12px] text-ink-dim">
        <span className="text-ink-faint">VERSIYA </span>
        {info?.current?.slice(0, 7) ?? "—"}
        {info && !info.configured && <span className="ml-2 text-ink-faint">(yangilash manzili hali sozlanmagan)</span>}
        {info?.configured && !info.available && !info.error && <span className="ml-2 text-emerald-300/90">eng yangi</span>}
        {info?.available && <span className="ml-2 text-amber-300/90">yangi versiya bor: {info.message}</span>}
        {info?.error && <span className="ml-2 text-rose-300">{info.error}</span>}
      </div>
      <div className="mt-2 flex gap-2">
        {info?.available && button}
        <button
          onClick={() => void check()}
          disabled={busy}
          className="border border-line px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-ink-dim hover:border-accent/60 hover:text-accent"
        >
          {state === "checking" ? "…" : "Tekshirish"}
        </button>
      </div>
      {msg && <p className={`mt-2 text-[12.5px] ${msg.ok ? "text-emerald-300/90" : "text-rose-300"}`}>{msg.text}</p>}
    </section>
  );
}
