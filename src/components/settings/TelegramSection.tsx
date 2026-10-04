"use client";

import { useEffect, useState } from "react";
import { PanelTitle } from "@/components/layout/ui";
import { syncNodes } from "@/services/jarvis";
import type { KGEdge, KGNode } from "@/types/graph";

const headers = { "Content-Type": "application/json", "x-jarvis-local": "1" };

interface Bot {
  id: number;
  username: string;
  name: string;
  tokenHint: string;
  status: { health: "ok" | "warning" | "error" | "unknown"; summary: string; checkedAt: string } | null;
}
interface BotsResponse {
  ok: boolean;
  bots?: Bot[];
  nodes?: KGNode[];
  edges?: KGEdge[];
  message?: string;
}

const DOT = { ok: "bg-emerald-400", warning: "bg-amber-300", error: "bg-rose-400", unknown: "bg-ink-faint" } as const;

/** Connect Izzatillo's own Telegram bots: JARVIS shows them on the graph and checks they work. */
export default function TelegramSection() {
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const apply = (j: BotsResponse, before: Bot[] = bots ?? []) => {
    if (!j.bots) return;
    const keep = new Set(j.bots.map((b) => b.id));
    const gone = before.filter((b) => !keep.has(b.id)).map((b) => `tg-bot-${b.username.toLowerCase().replace(/[^a-z0-9_]/g, "")}`);
    setBots(j.bots);
    syncNodes(j.nodes ?? [], j.edges ?? [], gone);
  };

  useEffect(() => {
    fetch("/api/telegram", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: BotsResponse) => setBots(j.bots ?? []))
      .catch(() => setBots([]));
  }, []);

  const request = async (url: string, init: RequestInit, ok: (j: BotsResponse) => string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { ...init, headers });
      const j = (await res.json()) as BotsResponse;
      if (j.ok) {
        apply(j);
        setMsg({ ok: true, text: ok(j) });
      } else setMsg({ ok: false, text: j.message ?? "Bo'lmadi." });
    } catch {
      setMsg({ ok: false, text: "Server bilan bog'lanib bo'lmadi. JARVIS ishlab turganini tekshiring." });
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    request("/api/telegram", { method: "POST", body: JSON.stringify({ token: token.trim() }) }, () => {
      setToken("");
      return "Bot qo'shildi va grafda paydo bo'ldi.";
    });
  const check = () => request("/api/telegram/check", { method: "POST" }, () => "Tekshirildi.");
  const remove = (id: number) => request(`/api/telegram?id=${id}`, { method: "DELETE" }, () => "Bot JARVIS'dan uzildi (botning o'zi ishlashda davom etadi).");

  return (
    <section className="md:col-span-2" data-testid="telegram-section">
      <PanelTitle>Telegram botlar</PanelTitle>
      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        Botingiz grafda chiqadi va JARVIS uning ishlayotganini tekshiradi. Token olish: Telegram&apos;da <b>@BotFather</b> ga kiring →{" "}
        <b>/mybots</b> → botingizni tanlang → <b>API Token</b>. Tokenni nusxalab shu yerga qo&apos;ying. JARVIS bot nomidan hech narsa
        yozmaydi, faqat holatini so&apos;raydi. Token faqat shu kompyuterda (<code className="text-accent">~/.jarvis</code>) saqlanadi, uni
        chatga yoki boshqa joyga yozmang.
      </p>

      <ul className="mt-3 max-w-2xl space-y-1.5" data-testid="bot-list">
        {bots === null && <li className="font-mono text-[12px] text-ink-faint">…</li>}
        {bots?.length === 0 && <li className="font-mono text-[12px] text-ink-faint">Hali bot ulanmagan.</li>}
        {bots?.map((b) => (
          <li key={b.id} className="flex items-center gap-3 border border-line px-3 py-2 text-[12.5px]" data-testid="bot-row">
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[b.status?.health ?? "unknown"]}`} />
            <div className="min-w-0 flex-1">
              <div className="text-ink">
                @{b.username} <span className="text-ink-faint">· {b.name}</span>
              </div>
              <div className="truncate text-[11.5px] text-ink-dim" data-testid="bot-status">
                {b.status ? b.status.summary : "Hali tekshirilmagan"}
              </div>
            </div>
            <span className="hidden font-mono text-[10.5px] text-ink-faint sm:inline">{b.tokenHint}</span>
            <button
              onClick={() => {
                if (confirmId === b.id) {
                  setConfirmId(null);
                  void remove(b.id);
                } else setConfirmId(b.id);
              }}
              disabled={busy}
              className="border border-rose-400/40 px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider text-rose-300/90 hover:border-rose-400"
              data-testid="bot-remove"
            >
              {confirmId === b.id ? "Rostdanmi?" : "Uzish"}
            </button>
          </li>
        ))}
      </ul>

      <form
        className="mt-3 flex max-w-2xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim() && !busy) void add();
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
          data-testid="bot-token-input"
        />
        <button
          type="submit"
          disabled={busy || !token.trim()}
          className="border border-accent/50 px-4 font-mono text-[10.5px] uppercase tracking-wider text-accent hover:border-accent disabled:opacity-40"
          data-testid="bot-add"
        >
          {busy ? "…" : "Qo'shish"}
        </button>
        {!!bots?.length && (
          <button
            type="button"
            onClick={() => void check()}
            disabled={busy}
            className="border border-line px-3 font-mono text-[10.5px] uppercase tracking-wider text-ink-dim hover:border-accent/60 hover:text-accent"
            data-testid="bot-check"
          >
            Tekshirish
          </button>
        )}
      </form>
      {msg && (
        <p className={`mt-2 text-[12.5px] ${msg.ok ? "text-emerald-300/90" : "text-rose-300"}`} data-testid="bot-message">
          {msg.text}
        </p>
      )}
    </section>
  );
}
