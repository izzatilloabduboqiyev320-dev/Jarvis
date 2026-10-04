import "server-only";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAIConfig } from "@/ai/config";
import { getClient } from "@/ai/claude";
import { explainAIError } from "@/ai/provider";
import { JARVIS_HOME } from "@/server/home";
import { setHealth } from "@/server/health";
import { alertIntervalMs, getQuote, listAlerts } from "@/server/market";
import { checkAssistant } from "@/server/telegram-assistant";

/**
 * Start-up checks and the report printed in the terminal. Runs in the
 * background after the server is up; a failing check is reported, never fatal.
 * Secrets are never printed.
 */

/** Used only when no price alert exists, to check that the price sources answer. */
const PROBE_SYMBOLS = ["XAUUSD", "BTCUSDT"];

const pad = (s: string) => s.padEnd(13);
const mark = (ok: boolean | null, on = "ONLINE", off = "OFFLINE", idle = "NOT CONFIGURED") => (ok === null ? idle : ok ? on : off);

async function checkDatabase(): Promise<[boolean, string]> {
  try {
    await mkdir(JARVIS_HOME, { recursive: true, mode: 0o700 });
    const probe = path.join(JARVIS_HOME, `.write-test-${process.pid}`);
    await writeFile(probe, "ok", { mode: 0o600 });
    await rm(probe, { force: true });
    return [true, `${JARVIS_HOME} (JSON files)`];
  } catch (err) {
    return [false, `${JARVIS_HOME} is not writable: ${err instanceof Error ? err.message : err}`];
  }
}

async function checkClaude(): Promise<[boolean | null, string]> {
  const ai = getAIConfig();
  if (!ai.hasAnthropicKey) return [null, ai.hasGeminiKey ? "ANTHROPIC_API_KEY missing; Gemini answers instead" : "ANTHROPIC_API_KEY missing (demo mode)"];
  try {
    // One tiny real request: proves the key, billing and the model name.
    const res = await getClient().messages.create({ model: ai.model, max_tokens: 5, messages: [{ role: "user", content: "Reply with: OK" }] }, { timeout: 30_000, maxRetries: 1 });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return [true, `${ai.model} answered "${text.slice(0, 20)}"`];
  } catch (err) {
    return [false, explainAIError(err)];
  }
}

async function checkMarkets(): Promise<{ ok: boolean; lines: string[]; symbols: string[]; probe: boolean }> {
  const alerts = await listAlerts();
  const symbols = [...new Set(alerts.map((a) => a.symbol))];
  const probe = symbols.length === 0;
  const list = probe ? PROBE_SYMBOLS : symbols;
  const lines: string[] = [];
  let anyOk = false;
  for (const symbol of list) {
    try {
      const q = await getQuote(symbol);
      anyOk = true;
      const when = q.marketTime ? ` @ ${q.marketTime.replace("T", " ").slice(0, 16)} UTC` : "";
      const line = `${symbol} ${q.stale ? "MARKET DATA STALE (market closed?)" : "DATA OK"} ${q.price}${when} [${q.source}]`;
      lines.push(line);
      console.info(`[MARKET] ${line}`);
    } catch (err) {
      const line = `${symbol} MARKET DATA OFFLINE (${err instanceof Error ? err.message : err})`;
      lines.push(line);
      console.error(`[ERROR] MARKET ${line}`);
    }
  }
  return { ok: anyOk, lines, symbols, probe };
}

export async function runBootChecks() {
  const started = new Date();
  console.info("[BOOT] Starting JARVIS");
  const [db, dbDetail] = await checkDatabase();
  setHealth("database", db, dbDetail, "none");
  const [claudeRes, tg, market] = await Promise.all([checkClaude(), checkAssistant(), checkMarkets()]);
  const [claude, claudeDetail] = claudeRes;
  setHealth("claude", claude, claudeDetail, "none");
  console.info(`[CLAUDE] ${mark(claude)}: ${claudeDetail}`);
  setHealth("telegram", tg.configured ? tg.ok : null, tg.detail, "none");
  console.info(`[TELEGRAM] ${mark(tg.configured ? tg.ok : null)}: ${tg.detail}`);
  setHealth("market", market.ok, market.lines.join("; "), "none");
  const monitor = market.symbols.length ? `RUNNING (${market.symbols.length} symbol${market.symbols.length === 1 ? "" : "s"} with price alerts, every ${Math.round(alertIntervalMs() / 1000)} s)` : "IDLE (no price alerts set)";
  setHealth("monitor", market.symbols.length ? true : null, monitor, "none");

  const bar = "====================================";
  console.info(
    [
      "",
      bar,
      "        JARVIS TRADING BOT",
      bar,
      "",
      `${pad("Telegram")}${mark(tg.configured ? tg.ok : null)}`,
      `${pad("Claude")}${mark(claude)}`,
      `${pad("Market Data")}${mark(market.ok)}`,
      `${pad("Database")}${mark(db)}`,
      `${pad("ICT Engine")}NOT PRESENT (knowledge notes only)`,
      `${pad("MSNR Engine")}NOT PRESENT (knowledge notes only)`,
      `${pad("Monitor")}${monitor}`,
      "",
      market.probe ? "Markets (source check, no alerts set):" : "Markets (price alerts):",
      ...market.lines.map((l) => `  ${l}`),
      "",
      "Mode:",
      "  ASSISTANT + PRICE ALERTS (read-only, no trading)",
      "",
      "Started:",
      `  ${started.toISOString()}`,
      "",
      bar,
      "",
    ].join("\n"),
  );
}
