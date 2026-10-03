"use client";

import { useEffect, useState } from "react";
import { PanelTitle } from "@/components/layout/ui";
import { refreshStatus } from "@/lib/status";

type KeyState = { configured: boolean; hint: string | null } | null;

const headers = { "Content-Type": "application/json", "x-jarvis-local": "1" };

/** Paste the Claude API key here; the server saves it to .env.local and never sends it back. */
export default function ClaudeKeySection() {
  const [state, setState] = useState<KeyState>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/claude-key", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { configured?: boolean; hint?: string | null }) =>
        setState(typeof j.configured === "boolean" ? { configured: j.configured, hint: j.hint ?? null } : { configured: false, hint: null }),
      )
      .catch(() => setState({ configured: false, hint: null }));
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/claude-key", { method: "POST", headers, body: JSON.stringify({ key: key.trim() }) });
      const j = (await res.json()) as { ok: boolean; verified?: boolean; hint?: string; message?: string };
      if (j.ok) {
        setKey("");
        setState({ configured: true, hint: j.hint ?? null });
        setMsg({
          ok: true,
          text: j.verified
            ? "Saqlandi va tekshirildi. JARVIS endi Claude bilan ishlaydi."
            : "Saqlandi, lekin internetga ulanib tekshirib bo'lmadi. Chatda sinab ko'ring.",
        });
        await refreshStatus();
      } else {
        setMsg({ ok: false, text: j.message ?? "Saqlab bo'lmadi." });
      }
    } catch {
      setMsg({ ok: false, text: "Server bilan bog'lanib bo'lmadi. JARVIS ishlab turganini tekshiring." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Claude kalitini o'chirasizmi?")) return;
    setBusy(true);
    try {
      await fetch("/api/settings/claude-key", { method: "DELETE", headers });
      setState({ configured: false, hint: null });
      setMsg({ ok: true, text: "Kalit o'chirildi. JARVIS demo rejimga qaytdi." });
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="md:col-span-2" data-testid="claude-key-section">
      <PanelTitle>Claude API key</PanelTitle>
      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        Kalitni console.anthropic.com → API Keys dan nusxalab, shu yerga joylang va <b>Saqlash</b> ni bosing. Kalit faqat shu kompyuterdagi
        <code className="mx-1 text-accent">.env.local</code>
        faylga yoziladi va brauzerga qaytib yuborilmaydi. Uni hech kimga yubormang.
      </p>
      <div className="mt-3 font-mono text-[12px]">
        <span className="text-ink-faint">STATUS </span>
        {state === null ? (
          <span className="text-ink-faint">…</span>
        ) : state.configured ? (
          <span className="text-emerald-300/90" data-testid="key-status">
            Ulangan · {state.hint}
          </span>
        ) : (
          <span className="text-amber-300/90" data-testid="key-status">
            Kalit yo&apos;q (demo mode)
          </span>
        )}
      </div>
      <form
        className="mt-3 flex max-w-2xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim() && !busy) void save();
        }}
      >
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-..."
          autoComplete="off"
          spellCheck={false}
          className="h-9 flex-1 border border-line bg-black px-3 font-mono text-[12.5px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
          data-testid="key-input"
        />
        <button
          type="submit"
          disabled={busy || !key.trim()}
          className="border border-accent/50 px-4 font-mono text-[10.5px] uppercase tracking-wider text-accent hover:border-accent disabled:opacity-40"
          data-testid="key-save"
        >
          {busy ? "…" : "Saqlash"}
        </button>
        {state?.configured && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="border border-rose-400/40 px-3 font-mono text-[10.5px] uppercase tracking-wider text-rose-300/90 hover:border-rose-400"
          >
            O&apos;chirish
          </button>
        )}
      </form>
      {msg && (
        <p className={`mt-2 text-[12.5px] ${msg.ok ? "text-emerald-300/90" : "text-rose-300"}`} data-testid="key-message">
          {msg.text}
        </p>
      )}
    </section>
  );
}
