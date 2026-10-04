import "server-only";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { JARVIS_HOME } from "@/server/home";
import { noteMarketUpdate, setHealth } from "@/server/health";
import { shared } from "@/server/shared";

/**
 * Market data for TradingView-style questions: live prices (read-only, free
 * public endpoints, no keys) and price alerts that JARVIS watches.
 * There is deliberately NO trading here: JARVIS cannot place, change or
 * cancel orders on any exchange or broker.
 */

const FILE = path.join(JARVIS_HOME, "alerts.json");
const CHECK_EVERY_MS = 60_000;
const MAX_ALERTS = 30;
/** A price older than this is reported as stale (market closed or feed stuck). */
const STALE_AFTER_MS = 30 * 60_000;

const binance = () => (process.env.JARVIS_BINANCE_URL?.trim() || "https://api.binance.com").replace(/\/+$/, "");
const yahoo = () => (process.env.JARVIS_YAHOO_URL?.trim() || "https://query1.finance.yahoo.com").replace(/\/+$/, "");

export const SYMBOL = /^[A-Za-z0-9^=._:!-]{1,40}$/;

export interface Quote {
  symbol: string;
  price: number;
  changePct?: number;
  high?: number;
  low?: number;
  currency?: string;
  source: "Binance" | "Yahoo Finance";
  /** When JARVIS fetched it. */
  at: string;
  /** Time of the last trade/candle according to the exchange. */
  marketTime?: string;
  /** True when marketTime is older than 30 minutes (market closed or stale feed). */
  stale?: boolean;
}

export interface Alert {
  id: string;
  symbol: string;
  above?: number;
  below?: number;
  note?: string;
  createdAt: string;
  triggeredAt?: string;
  triggeredPrice?: number;
}

const S = shared("market", () => ({
  alerts: null as Alert[] | null,
  writing: Promise.resolve() as Promise<void>,
  running: false,
  listeners: new Set<(a: Alert) => void>(),
}));

/** "BINANCE:BTCUSDT" / "btcusdt" → BTCUSDT on Binance; anything else goes to Yahoo (AAPL, GC=F, EURUSD=X, ^GSPC, BTC-USD). */
function route(raw: string): { source: "binance" | "yahoo"; symbol: string } {
  const s = raw.trim().toUpperCase().replace(/^BINANCE:/, "");
  if (/^[A-Z0-9]{2,12}(USDT|USDC|FDUSD|BTC|ETH|BNB|EUR|TRY)$/.test(s) && !s.includes(":")) return { source: "binance", symbol: s };
  const y = s.includes(":") ? s.split(":").pop()! : s;
  const MAP: Record<string, string> = { XAUUSD: "GC=F", GOLD: "GC=F", XAGUSD: "SI=F", SILVER: "SI=F", OIL: "CL=F", USOIL: "CL=F", SPX: "^GSPC", NDX: "^NDX", DXY: "DX-Y.NYB", US30: "^DJI" };
  if (MAP[y]) return { source: "yahoo", symbol: MAP[y] };
  if (/^[A-Z]{6}$/.test(y) && !/USDT$/.test(y)) return { source: "yahoo", symbol: `${y}=X` }; // EURUSD → EURUSD=X
  return { source: "yahoo", symbol: y };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 JARVIS" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 404 || res.status === 400 ? "symbol not found" : `market data unavailable (${res.status})`);
  return (await res.json()) as T;
}

export async function getQuote(raw: string): Promise<Quote> {
  if (!SYMBOL.test(raw.trim())) throw new Error("Invalid symbol");
  const r = route(raw);
  const at = new Date().toISOString();
  if (r.source === "binance") {
    const j = await getJson<{ lastPrice: string; priceChangePercent: string; highPrice: string; lowPrice: string; closeTime?: number }>(
      `${binance()}/api/v3/ticker/24hr?symbol=${encodeURIComponent(r.symbol)}`,
    );
    const price = Number(j.lastPrice);
    if (!(price > 0)) throw new Error("market data unavailable (no price)");
    return { symbol: r.symbol, price, changePct: Number(j.priceChangePercent), high: Number(j.highPrice), low: Number(j.lowPrice), source: "Binance", at, ...freshness(j.closeTime) };
  }
  const j = await getJson<{ chart?: { result?: { meta: { regularMarketPrice: number; regularMarketTime?: number; chartPreviousClose?: number; currency?: string; regularMarketDayHigh?: number; regularMarketDayLow?: number } }[] } }>(
    `${yahoo()}/v8/finance/chart/${encodeURIComponent(r.symbol)}?range=1d&interval=15m`,
  );
  const meta = j.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error("symbol not found");
  const prev = meta.chartPreviousClose;
  return {
    symbol: r.symbol,
    price: meta.regularMarketPrice,
    changePct: prev ? Number((((meta.regularMarketPrice - prev) / prev) * 100).toFixed(2)) : undefined,
    high: meta.regularMarketDayHigh,
    low: meta.regularMarketDayLow,
    currency: meta.currency,
    source: "Yahoo Finance",
    at,
    ...freshness(meta.regularMarketTime ? meta.regularMarketTime * 1000 : undefined),
  };
}

function freshness(ms?: number): { marketTime?: string; stale?: boolean } {
  if (!ms || !Number.isFinite(ms)) return {};
  return { marketTime: new Date(ms).toISOString(), stale: Date.now() - ms > STALE_AFTER_MS };
}

/** TradingView chart link for a symbol ("BINANCE:BTCUSDT", "OANDA:XAUUSD", "AAPL"). */
export function chartUrl(symbol: string, interval?: string): string {
  if (!SYMBOL.test(symbol.trim())) throw new Error("Invalid symbol");
  const iv = interval && /^(1|3|5|15|30|60|120|240|D|W|M)$/i.test(interval) ? `&interval=${interval.toUpperCase()}` : "";
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol.trim().toUpperCase())}${iv}`;
}

// ── Alerts ────────────────────────────────────────────────────────────

async function load(): Promise<Alert[]> {
  if (S.alerts) return S.alerts;
  try {
    const text = await readFile(FILE, "utf8").catch(() => null);
    const j = text === null ? {} : (JSON.parse(text) as { alerts?: Alert[] });
    S.alerts = Array.isArray(j.alerts) ? j.alerts : [];
  } catch {
    // Unreadable file: keep a copy instead of overwriting the user's alerts on the next save.
    await rename(FILE, `${FILE}.corrupt-${Date.now()}`).catch(() => {});
    console.error("[ERROR] MARKET alerts.json was unreadable; kept a copy next to it and started with no alerts");
    S.alerts = [];
  }
  return S.alerts;
}

function save(): Promise<void> {
  const run = S.writing.then(async () => {
    await mkdir(JARVIS_HOME, { recursive: true, mode: 0o700 });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ alerts: S.alerts ?? [] }, null, 1), { encoding: "utf8", mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, FILE);
  });
  // A failed write must not block every later write; the caller still sees the error.
  S.writing = run.catch((err) => console.error("[ERROR] MARKET could not save alerts:", err instanceof Error ? err.message : err));
  return run;
}

export async function listAlerts(includeTriggered = false): Promise<Alert[]> {
  return (await load()).filter((a) => includeTriggered || !a.triggeredAt);
}

export async function createAlert(input: { symbol: string; above?: number; below?: number; note?: string }): Promise<{ alert: Alert; quote: Quote }> {
  const above = input.above !== undefined ? Number(input.above) : undefined;
  const below = input.below !== undefined ? Number(input.below) : undefined;
  if ((above === undefined || !(above > 0)) && (below === undefined || !(below > 0))) throw new Error("Give a price level: above or below");
  const quote = await getQuote(input.symbol); // also validates the symbol
  const alerts = await load();
  if (alerts.filter((a) => !a.triggeredAt).length >= MAX_ALERTS) throw new Error(`At most ${MAX_ALERTS} active alerts`);
  const alert: Alert = {
    id: randomUUID().slice(0, 8),
    symbol: input.symbol.trim().toUpperCase(),
    ...(above && above > 0 ? { above } : {}),
    ...(below && below > 0 ? { below } : {}),
    note: input.note?.slice(0, 200),
    createdAt: new Date().toISOString(),
  };
  alerts.push(alert);
  await save();
  startAlertWatcher();
  return { alert, quote };
}

export async function cancelAlert(id: string): Promise<boolean> {
  const alerts = await load();
  const before = alerts.length;
  S.alerts = alerts.filter((a) => a.id !== id);
  if (S.alerts.length === before) return false;
  await save();
  return true;
}

/** Called when an alert fires (the Telegram assistant and the app subscribe). */
export function onAlert(fn: (a: Alert) => void) {
  S.listeners.add(fn);
}

async function checkAlerts() {
  const active = (await load()).filter((a) => !a.triggeredAt);
  const bySymbol = new Map<string, Alert[]>();
  for (const a of active) bySymbol.set(a.symbol, [...(bySymbol.get(a.symbol) ?? []), a]);
  let changed = false;
  for (const [symbol, list] of bySymbol) {
    let q: Quote;
    try {
      q = await getQuote(symbol);
      noteMarketUpdate(q.symbol, q.price, q.marketTime);
      setHealth("market", true, q.stale ? `${symbol} narxi eski (${q.marketTime}), bozor yopiq bo'lishi mumkin` : `${symbol} yangilandi`, "quiet");
      console.info(`[MARKET] ${symbol} ${q.price}${q.stale ? " (MARKET DATA STALE)" : ""}`);
    } catch (err) {
      setHealth("market", false, `${symbol}: MARKET DATA OFFLINE (${err instanceof Error ? err.message : err})`);
      continue;
    }
    for (const a of list) {
      if ((a.above !== undefined && q.price >= a.above) || (a.below !== undefined && q.price <= a.below)) {
        a.triggeredAt = new Date().toISOString();
        a.triggeredPrice = q.price;
        changed = true;
        console.info(`[jarvis alert] ${a.symbol} ${a.above ? `≥ ${a.above}` : `≤ ${a.below}`} at ${q.price}`);
        for (const fn of S.listeners) {
          try {
            fn(a);
          } catch {
            /* a listener failing must not stop the others */
          }
        }
      }
    }
  }
  if (changed) {
    // Keep only the 50 most recent fired alerts.
    const all = S.alerts ?? [];
    const fired = all.filter((a) => a.triggeredAt).slice(-50);
    S.alerts = [...all.filter((a) => !a.triggeredAt), ...fired];
    await save();
  }
}

/** Checks active alerts every minute while any exist. */
export const alertIntervalMs = () => Number(process.env.JARVIS_ALERT_INTERVAL_MS) || CHECK_EVERY_MS;

export function startAlertWatcher() {
  if (S.running) return;
  S.running = true;
  void (async () => {
    try {
      let n: number;
      while ((n = (await listAlerts()).length)) {
        setHealth("monitor", true, `ishlayapti, ${n} ta faol ogohlantirish`);
        await checkAlerts().catch((err) => console.error("[ERROR] MONITOR", err instanceof Error ? err.message : err));
        await new Promise((r) => setTimeout(r, alertIntervalMs()));
      }
      setHealth("monitor", null, "faol ogohlantirish yo'q (kutish rejimi)");
    } catch (err) {
      console.error("[ERROR] MONITOR stopped:", err instanceof Error ? err.message : err);
      console.info("[RECOVERY] MONITOR restarting in 60 s");
      setTimeout(startAlertWatcher, 60_000).unref?.();
    } finally {
      S.running = false;
    }
  })();
}

export function describeAlert(a: Alert): string {
  return `${a.symbol} ${a.above !== undefined ? `≥ ${a.above}` : ""}${a.above !== undefined && a.below !== undefined ? " yoki " : ""}${a.below !== undefined ? `≤ ${a.below}` : ""}${a.note ? ` (${a.note})` : ""}`;
}
