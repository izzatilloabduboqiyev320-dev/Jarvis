import "server-only";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { JARVIS_HOME } from "@/server/home";
import type { KGEdge, KGNode } from "@/types/graph";

/**
 * Izzatillo's own Telegram bots, connected so JARVIS can show them on the graph
 * and check that they work.
 *
 * Read-only by design: JARVIS only calls getMe (is the token alive?) and
 * getWebhookInfo (is the bot receiving messages?). It never calls getUpdates,
 * which would steal messages from the bot's own program, and never sends
 * anything. Tokens stay in ~/.jarvis/telegram.json (owner-only) and never
 * reach the browser, the graph or the logs.
 */

const FILE = path.join(JARVIS_HOME, "telegram.json");
export const TOKEN_PATTERN = /^\d{5,12}:[A-Za-z0-9_-]{30,60}$/;
const MAX_BOTS = 20;

interface StoredBot {
  id: number;
  token: string;
  username: string;
  name: string;
  addedAt: string;
}

export type BotHealth = "ok" | "warning" | "error" | "unknown";

export interface BotStatus {
  health: BotHealth;
  /** Short Uzbek explanation shown in Settings and given to the AI. */
  summary: string;
  mode?: "webhook" | "polling";
  webhookHost?: string;
  pending?: number;
  lastError?: string;
  lastErrorAt?: string;
  checkedAt: string;
}

export interface PublicBot {
  id: number;
  username: string;
  name: string;
  tokenHint: string;
  addedAt: string;
  status: BotStatus | null;
}

let cache: StoredBot[] | null = null;
const statuses = new Map<number, BotStatus>();
let writing: Promise<void> = Promise.resolve();

const base = () => (process.env.TELEGRAM_BASE_URL?.trim() || "https://api.telegram.org").replace(/\/+$/, "");

async function load(): Promise<StoredBot[]> {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as { bots?: StoredBot[] };
    cache = Array.isArray(parsed.bots) ? parsed.bots.filter((b) => b && TOKEN_PATTERN.test(b.token)) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(): Promise<void> {
  writing = writing.then(async () => {
    await mkdir(JARVIS_HOME, { recursive: true, mode: 0o700 });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ bots: cache ?? [] }, null, 1), { encoding: "utf8", mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, FILE);
  });
  return writing;
}

const hint = (token: string) => `${token.split(":")[0]}:…${token.slice(-4)}`;

class TelegramError extends Error {
  constructor(
    message: string,
    readonly kind: "invalid" | "network",
  ) {
    super(message);
  }
}

/** Calls a read-only Bot API method. The token is in the URL, so errors never include the URL. */
async function call<T>(token: string, method: "getMe" | "getWebhookInfo"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}/bot${token}/${method}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    throw new TelegramError("Telegram bilan bog'lanib bo'lmadi (internet?)", "network");
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (res.status === 401 || res.status === 404) throw new TelegramError("Token noto'g'ri yoki bot o'chirilgan", "invalid");
  if (!json?.ok || json.result === undefined) throw new TelegramError(`Telegram xatosi: ${String(json?.description ?? res.status).slice(0, 120)}`, "network");
  return json.result;
}

function publicBot(b: StoredBot): PublicBot {
  return { id: b.id, username: b.username, name: b.name, tokenHint: hint(b.token), addedAt: b.addedAt, status: statuses.get(b.id) ?? null };
}

export async function listBots(): Promise<PublicBot[]> {
  return (await load()).map(publicBot);
}

/** Verifies a token with getMe and saves the bot. */
export async function addBot(token: string): Promise<PublicBot> {
  if (!TOKEN_PATTERN.test(token)) throw new TelegramError("Bu bot tokeniga o'xshamaydi. U 123456789:ABC… ko'rinishida bo'ladi (BotFather beradi).", "invalid");
  const me = await call<{ id: number; is_bot: boolean; username?: string; first_name?: string }>(token, "getMe");
  if (!me.is_bot) throw new TelegramError("Bu token botga tegishli emas", "invalid");
  const bots = await load();
  const bot: StoredBot = {
    id: me.id,
    token,
    username: String(me.username ?? me.id).slice(0, 64),
    name: String(me.first_name ?? me.username ?? "Bot").slice(0, 80),
    addedAt: new Date().toISOString(),
  };
  const i = bots.findIndex((b) => b.id === me.id);
  if (i >= 0) bots[i] = { ...bot, addedAt: bots[i].addedAt };
  else if (bots.length >= MAX_BOTS) throw new TelegramError(`Ko'pi bilan ${MAX_BOTS} ta bot qo'shish mumkin`, "invalid");
  else bots.push(bot);
  await save();
  await checkBot(bot);
  return publicBot(bot);
}

export async function removeBot(id: number): Promise<boolean> {
  const bots = await load();
  if (!bots.some((b) => b.id === id)) return false;
  cache = bots.filter((b) => b.id !== id);
  statuses.delete(id);
  await save();
  return true;
}

interface WebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
}

async function checkBot(b: StoredBot): Promise<BotStatus> {
  const checkedAt = new Date().toISOString();
  let status: BotStatus;
  try {
    await call(b.token, "getMe");
    const w = await call<WebhookInfo>(b.token, "getWebhookInfo");
    const pending = w.pending_update_count ?? 0;
    const errAt = w.last_error_date ? new Date(w.last_error_date * 1000) : null;
    const recentError = errAt && Date.now() - errAt.getTime() < 6 * 3600_000;
    if (w.url) {
      let host = "";
      try {
        host = new URL(w.url).host;
      } catch {
        /* keep empty */
      }
      status = recentError
        ? { health: "error", summary: `Server xato bermoqda: ${String(w.last_error_message ?? "").slice(0, 120)}`, mode: "webhook", webhookHost: host, pending, lastError: w.last_error_message?.slice(0, 200), lastErrorAt: errAt!.toISOString(), checkedAt }
        : pending > 20
          ? { health: "warning", summary: `${pending} ta xabar navbatda kutyapti`, mode: "webhook", webhookHost: host, pending, checkedAt }
          : { health: "ok", summary: "Ishlayapti", mode: "webhook", webhookHost: host, pending, checkedAt };
    } else {
      // Polling bots: Telegram only shows how many messages wait to be picked up.
      status =
        pending > 0
          ? { health: "warning", summary: `${pending} ta xabar javobsiz turibdi. Bot dasturi to'xtagan bo'lishi mumkin`, mode: "polling", pending, checkedAt }
          : { health: "ok", summary: "Token ishlayapti, javobsiz xabar yo'q", mode: "polling", pending, checkedAt };
    }
  } catch (err) {
    const e = err as TelegramError;
    status = { health: e.kind === "invalid" ? "error" : "unknown", summary: e.message, checkedAt };
  }
  statuses.set(b.id, status);
  return status;
}

export async function checkBots(): Promise<PublicBot[]> {
  const bots = await load();
  await Promise.all(bots.map(checkBot));
  return bots.map(publicBot);
}

// ── Graph ─────────────────────────────────────────────────────────────

const HEALTH_LABEL: Record<BotHealth, string> = { ok: "ishlayapti", warning: "e'tibor kerak", error: "xato", unknown: "tekshirilmagan" };

export const botNodeId = (b: { username: string }) => `tg-bot-${b.username.toLowerCase().replace(/[^a-z0-9_]/g, "")}`;

/** Each bot as a graph item linked to Izzatillo and Telegram (only to nodes that exist). */
export function botGraph(bots: PublicBot[], exists: (id: string) => boolean): { nodes: KGNode[]; edges: KGEdge[] } {
  const nodes: KGNode[] = [];
  const edges: KGEdge[] = [];
  for (const b of bots) {
    const id = botNodeId(b);
    const s = b.status;
    nodes.push({
      id,
      label: `@${b.username}`,
      category: "automation",
      description: `Telegram bot “${b.name}”. Holati: ${s ? `${HEALTH_LABEL[s.health]} — ${s.summary}` : "hali tekshirilmagan"}.`,
      tags: ["telegram", "bot", s?.health ?? "unknown"],
      importance: 0.6,
      updatedAt: s?.checkedAt ?? b.addedAt,
      source: "Telegram",
      metadata: {
        status: s ? HEALTH_LABEL[s.health] : HEALTH_LABEL.unknown,
        ...(s?.mode ? { mode: s.mode } : {}),
        ...(s?.pending !== undefined ? { pending: s.pending } : {}),
        ...(s ? { checked: s.checkedAt.slice(0, 16).replace("T", " ") } : {}),
      },
    });
    if (exists("izzatillo")) edges.push({ id: `${id}-owner`, source: "izzatillo", target: id, relation: "OWNS", weight: 0.6 });
    if (exists("t-telegram")) edges.push({ id: `${id}-tg`, source: id, target: "t-telegram", relation: "USES", weight: 0.5 });
    if (exists("p-telegram-bot")) edges.push({ id: `${id}-proj`, source: id, target: "p-telegram-bot", relation: "PART_OF", weight: 0.4 });
  }
  return { nodes, edges };
}
