import "server-only";
import { shared } from "@/server/shared";

/**
 * What each JARVIS service is doing right now, for the start-up report, the
 * Telegram /health command and GET /api/health. Only states and short
 * reasons are kept here, never keys or tokens.
 */

export type Service = "telegram" | "claude" | "market" | "database" | "monitor";

export interface ServiceState {
  ok: boolean | null; // null = not configured / idle
  detail: string;
  at: number;
}

const H = shared("health", () => ({
  startedAt: Date.now(),
  services: {} as Partial<Record<Service, ServiceState>>,
  lastMarket: null as { symbol: string; price: number; marketTime?: string; at: number } | null,
  lastAnalysis: null as { provider: string; ok: boolean; at: number } | null,
}));

const TAG: Record<Service, string> = { telegram: "TELEGRAM", claude: "CLAUDE", market: "MARKET", database: "DATABASE", monitor: "MONITOR" };

/**
 * Records a service state and logs when it changes (lost → [ERROR], back → [RECOVERY]).
 * `log`: "quiet" skips the plain info line (the caller logs its own), "none" logs nothing.
 */
export function setHealth(service: Service, ok: boolean | null, detail: string, log: "all" | "quiet" | "none" = "all") {
  const prev = H.services[service];
  H.services[service] = { ok, detail, at: Date.now() };
  if (log === "none" || (prev && prev.ok === ok && prev.detail === detail)) return;
  if (prev?.ok === false && ok) console.info(`[RECOVERY] ${TAG[service]} ${detail}`);
  else if (ok === false) console.error(`[ERROR] ${TAG[service]} ${detail}`);
  else if (log === "all") console.info(`[${TAG[service]}] ${detail}`);
}

export function noteMarketUpdate(symbol: string, price: number, marketTime?: string) {
  H.lastMarket = { symbol, price, marketTime, at: Date.now() };
}

export function noteAnalysis(provider: string, ok: boolean) {
  H.lastAnalysis = { provider, ok, at: Date.now() };
}

export function healthSnapshot() {
  return { startedAt: H.startedAt, uptimeMs: Date.now() - H.startedAt, services: { ...H.services }, lastMarket: H.lastMarket, lastAnalysis: H.lastAnalysis };
}

export function formatUptime(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return `${d ? `${d}d ` : ""}${h}h ${m % 60}m`;
}

const dot = (s?: ServiceState) => (!s ? "⚪" : s.ok === null ? "⚪" : s.ok ? "🟢" : "🔴");
const when = (ts?: number) => (ts ? new Date(ts).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");

/** Text for the Telegram /health command. */
export function healthText(): string {
  const h = healthSnapshot();
  const s = h.services;
  const row = (label: string, k: Service) => `${label}: ${dot(s[k])} ${s[k]?.detail ?? "tekshirilmagan"}`;
  return [
    "JARVIS STATUS",
    "",
    row("Bot (Telegram)", "telegram"),
    row("Claude", "claude"),
    row("Market Data", "market"),
    row("Database", "database"),
    row("Monitor", "monitor"),
    "ICT/MSNR Engine: ⚪ kodda yo'q (faqat bilim bazasidagi eslatmalar)",
    "",
    `Last market update: ${h.lastMarket ? `${h.lastMarket.symbol} ${h.lastMarket.price} (${when(h.lastMarket.at)})` : "—"}`,
    `Last analysis: ${h.lastAnalysis ? `${h.lastAnalysis.provider} ${h.lastAnalysis.ok ? "OK" : "xato"} (${when(h.lastAnalysis.at)})` : "—"}`,
    `Uptime: ${formatUptime(h.uptimeMs)}`,
  ].join("\n");
}
