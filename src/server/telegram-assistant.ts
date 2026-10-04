import "server-only";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import path from "node:path";
import { explainAIError, runJarvis } from "@/ai/provider";
import { currentConversation, newConversation } from "@/server/conversations";
import { getAIConfig } from "@/ai/config";
import { transcribe } from "@/ai/gemini";
import type { ChatTurn } from "@/ai/types";
import type { ChatEvent } from "@/ai/tools";
import { detectLang } from "@/knowledge/uzbek";
import { decide } from "@/server/approvals";
import { JARVIS_HOME } from "@/server/home";
import { shared } from "@/server/shared";
import { listBots, TOKEN_PATTERN } from "@/server/telegram";
import { describeAlert, onAlert } from "@/server/market";

/**
 * Talk to JARVIS from Telegram: a dedicated bot that only its owner can use.
 *
 * - Pairing: Settings shows a 6-digit code; the first private chat that sends
 *   it becomes the owner. Every other chat is ignored.
 * - Messages and voice notes (transcribed by Gemini) go to the same AI and
 *   tools as the app; computer actions ask "Ha / Yo'q" with Telegram buttons.
 * - Long polling (getUpdates) from this computer: no public URL needed. The
 *   bot must not have a webhook, so JARVIS refuses bots that already serve
 *   another program. The token stays in ~/.jarvis (owner-only file).
 */

const FILE = path.join(JARVIS_HOME, "telegram-assistant.json");
const PAIR_TTL_MS = 15 * 60_000;
const MAX_VOICE_SECONDS = 180;
const MAX_TURNS = 20;

interface Config {
  token: string;
  botId: number;
  username: string;
  ownerChatId?: number;
  ownerName?: string;
}

const S = shared("tg-assistant", () => ({
  cfg: undefined as Config | null | undefined,
  gen: 0,
  running: false,
  offset: 0,
  pair: null as { code: string; expires: number } | null,
  busy: false,
  status: "",
  approvalMsgs: new Map<string, { messageId: number; summary: string }>(),
  alertHooked: false,
}));

// Fired price alerts go to the paired Telegram chat.
if (!S.alertHooked) {
  S.alertHooked = true;
  onAlert((a) => {
    const c = S.cfg;
    if (c?.ownerChatId) void send(c.ownerChatId, `🔔 Narx ogohlantirishi: ${describeAlert(a)}
Hozirgi narx: ${a.triggeredPrice}`).catch(() => {});
  });
}

const base = () => (process.env.TELEGRAM_BASE_URL?.trim() || "https://api.telegram.org").replace(/\/+$/, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class TgError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

/** Bot API call. The token is in the URL, so errors never include the URL. */
async function api<T>(method: string, body: Record<string, unknown> = {}, timeoutMs = 15_000, token = S.cfg?.token): Promise<T> {
  if (!token) throw new TgError("No bot", 0);
  let res: Response;
  try {
    res = await fetch(`${base()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new TgError("Telegram bilan bog'lanib bo'lmadi", 0);
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string; error_code?: number } | null;
  if (!json?.ok) throw new TgError(String(json?.description ?? `HTTP ${res.status}`).slice(0, 160), json?.error_code ?? res.status);
  return json.result as T;
}

async function load(): Promise<Config | null> {
  if (S.cfg !== undefined) return S.cfg;
  try {
    const c = JSON.parse(await readFile(FILE, "utf8")) as Config;
    S.cfg = TOKEN_PATTERN.test(c.token) ? c : null;
  } catch {
    S.cfg = null;
  }
  return S.cfg;
}

async function save() {
  await mkdir(JARVIS_HOME, { recursive: true, mode: 0o700 });
  if (!S.cfg) return rm(FILE, { force: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(S.cfg, null, 1), { encoding: "utf8", mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, FILE);
}

function newPairCode() {
  S.pair = { code: String(randomInt(100000, 1000000)), expires: Date.now() + PAIR_TTL_MS };
}

export interface AssistantInfo {
  configured: boolean;
  username?: string;
  paired: boolean;
  ownerName?: string;
  pairCode?: string;
  status?: string;
}

export async function assistantInfo(): Promise<AssistantInfo> {
  const c = await load();
  if (!c) return { configured: false, paired: false };
  if (!c.ownerChatId && (!S.pair || S.pair.expires < Date.now())) newPairCode();
  return { configured: true, username: c.username, paired: Boolean(c.ownerChatId), ownerName: c.ownerName, pairCode: c.ownerChatId ? undefined : S.pair!.code, status: S.status || undefined };
}

/** Verifies and saves the dedicated JARVIS bot, then starts listening. */
export async function setAssistant(token: string): Promise<AssistantInfo> {
  if (!TOKEN_PATTERN.test(token)) throw new TgError("Bu bot tokeniga o'xshamaydi (123456789:ABC… ko'rinishida bo'ladi).", 400);
  const me = await api<{ id: number; is_bot: boolean; username?: string }>("getMe", {}, 15_000, token).catch((e: TgError) => {
    throw e.code === 401 || e.code === 404 ? new TgError("Token noto'g'ri yoki bekor qilingan", 400) : e;
  });
  const hook = await api<{ url: string }>("getWebhookInfo", {}, 15_000, token);
  if (hook.url) throw new TgError("Bu bot boshqa dastur uchun ishlayapti (webhook bor). JARVIS uchun BotFather'da yangi bot oching.", 400);
  if ((await listBots()).some((b) => b.id === me.id)) throw new TgError("Bu bot kuzatiladigan botlar ro'yxatida. JARVIS uchun alohida yangi bot oching.", 400);
  S.gen++;
  S.cfg = { token, botId: me.id, username: String(me.username ?? me.id) };
  await newConversation("telegram");
  S.offset = 0;
  S.status = "";
  await save();
  newPairCode();
  console.info(`[jarvis telegram-bot] connected @${S.cfg.username}`);
  startAssistant();
  return assistantInfo();
}

export async function removeAssistant() {
  S.gen++;
  S.cfg = null;
  await newConversation("telegram");
  S.pair = null;
  await save();
  console.info("[jarvis telegram-bot] disconnected");
}

export async function unpairAssistant() {
  const c = await load();
  if (!c) return;
  delete c.ownerChatId;
  delete c.ownerName;
  await newConversation("telegram");
  await save();
  newPairCode();
}

/** Starts the polling loop once per process (called at server start and after setup). */
export function startAssistant() {
  if (S.running) return;
  S.running = true;
  const gen = S.gen;
  void (async () => {
    try {
      await poll(gen);
    } finally {
      S.running = false;
      // A newer setup may be waiting for the old loop to finish.
      if (S.gen !== gen && S.cfg) startAssistant();
    }
  })();
}

interface Update {
  update_id: number;
  message?: Message;
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { message_id: number; chat: { id: number } } };
}
interface Message {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; first_name?: string };
  text?: string;
  voice?: { file_id: string; duration: number; mime_type?: string; file_size?: number };
  audio?: { file_id: string; duration: number; mime_type?: string; file_size?: number };
}

async function poll(gen: number) {
  if (!(await load())) return;
  while (S.gen === gen && S.cfg) {
    let updates: Update[];
    try {
      updates = await api<Update[]>("getUpdates", { offset: S.offset, timeout: 25, allowed_updates: ["message", "callback_query"] }, 40_000);
      S.status = "";
    } catch (err) {
      const e = err as TgError;
      if (e.code === 401 || e.code === 404) {
        S.status = "Token bekor qilingan. Yangi token qo'ying.";
        return;
      }
      S.status = e.code === 409 ? "Bu bot boshqa joyda ham ishlatilyapti" : "Telegram bilan aloqa yo'q, qayta urinyapman";
      await sleep(e.code === 409 ? 30_000 : 5_000);
      continue;
    }
    for (const u of updates) {
      S.offset = u.update_id + 1;
      if (u.message) void onMessage(u.message).catch((err) => console.error("[jarvis telegram-bot]", err instanceof Error ? err.message : err));
      else if (u.callback_query) void onCallback(u.callback_query).catch(() => {});
    }
  }
}

const send = (chatId: number, text: string, extra: Record<string, unknown> = {}) =>
  api<{ message_id: number }>("sendMessage", { chat_id: chatId, text: text.slice(0, 4000), ...extra });

async function onMessage(m: Message) {
  const c = S.cfg;
  if (!c || m.chat.type !== "private") return;

  if (!c.ownerChatId) {
    const code = (m.text ?? "").trim();
    if (S.pair && S.pair.expires > Date.now() && code === S.pair.code) {
      c.ownerChatId = m.chat.id;
      c.ownerName = m.from?.first_name?.slice(0, 60);
      S.pair = null;
      await save();
      console.info("[jarvis telegram-bot] paired with owner");
      await send(m.chat.id, "Ulandik! ✅ Endi menga yozing yoki ovozli xabar yuboring. Men JARVIS'man.");
    } else {
      await send(m.chat.id, "Bu shaxsiy JARVIS boti. Ulash uchun JARVIS → Settings → \"JARVIS Telegram'da\" bo'limidagi 6 xonali kodni yuboring.");
    }
    return;
  }
  if (m.chat.id !== c.ownerChatId) {
    console.info("[jarvis telegram-bot] ignored a message from a stranger");
    return;
  }
  if (m.text?.trim() === "/start") {
    await send(m.chat.id, "Salom! Men JARVIS. Yozing yoki ovozli xabar yuboring: vazifa qo'shaman, eslab qolaman, kompyuteringizda ilova va saytlarni ochaman (ruxsatingiz bilan).");
    return;
  }
  if (S.busy) {
    await send(m.chat.id, "Oldingi savolingiz ustida ishlayapman, bir oz kuting…");
    return;
  }
  S.busy = true;
  try {
    await answer(m);
  } finally {
    S.busy = false;
  }
}

async function voiceText(m: Message): Promise<string> {
  const v = m.voice ?? m.audio!;
  if (v.duration > MAX_VOICE_SECONDS || (v.file_size ?? 0) > 10_000_000) throw new Error(`Ovozli xabar juda uzun (ko'pi bilan ${MAX_VOICE_SECONDS / 60} daqiqa)`);
  if (!process.env.GEMINI_API_KEY?.trim()) throw new Error("Ovozli xabarni tushunish uchun Settings'da Gemini kaliti kerak");
  const file = await api<{ file_path?: string }>("getFile", { file_id: v.file_id });
  if (!file.file_path || !/^[\w./-]+$/.test(file.file_path)) throw new Error("Faylni olib bo'lmadi");
  const res = await fetch(`${base()}/file/bot${S.cfg!.token}/${file.file_path}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error("Faylni yuklab bo'lmadi");
  const audio = Buffer.from(await res.arrayBuffer());
  return transcribe(audio, v.mime_type || "audio/ogg", AbortSignal.timeout(60_000));
}

async function answer(m: Message) {
  const chatId = m.chat.id;
  const provider = getAIConfig().chatProvider;
  if (!provider) {
    await send(chatId, "AI kaliti yo'q. JARVIS → Settings'da Gemini yoki Claude kalitini qo'shing.");
    return;
  }
  void api("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  let text = m.text?.trim() ?? "";
  if (!text && (m.voice || m.audio)) {
    try {
      text = await voiceText(m);
    } catch (err) {
      await send(chatId, (err as Error).message);
      return;
    }
    if (!text) {
      await send(chatId, "Ovozli xabarni tushunolmadim, qaytadan aytib ko'ring.");
      return;
    }
    await send(chatId, `🎙 “${text.slice(0, 500)}”`);
  }
  if (!text) return;

  // History comes from the saved Telegram conversation, so it survives restarts.
  const history: ChatTurn[] = (await currentConversation("telegram")).messages.slice(-(MAX_TURNS - 1)).map(({ role, content }) => ({ role, content }));
  history.push({ role: "user", content: text.slice(0, 4000) });
  while (history.length && history[0].role !== "user") history.shift();

  let out = "";
  const emit = (e: ChatEvent) => {
    if (e.t === "text") out += e.v;
    else if (e.t === "approval") {
      void send(chatId, `🔐 Ruxsat berasizmi?\n${e.summary}`, {
        reply_markup: { inline_keyboard: [[{ text: "✅ Ha", callback_data: `ap:${e.id}:1` }, { text: "✖️ Yo'q", callback_data: `ap:${e.id}:0` }]] },
      }).then((r) => S.approvalMsgs.set(e.id, { messageId: r.message_id, summary: e.summary }));
    } else if (e.t === "approval-done") {
      const msg = S.approvalMsgs.get(e.id);
      S.approvalMsgs.delete(e.id);
      if (msg)
        void api("editMessageText", {
          chat_id: chatId,
          message_id: msg.messageId,
          text: `${e.approved ? "✅ Ruxsat berildi" : e.reason === "timeout" ? "⌛ Javob bo'lmadi, bekor qilindi" : "✖️ Rad etildi"}: ${msg.summary}`,
        }).catch(() => {});
    } else if (e.t === "tool") console.info(`[jarvis telegram-bot] ${e.summary}`);
  };
  try {
    await runJarvis({ messages: history, lang: detectLang(text), channel: "telegram", context: { nodes: [] } }, AbortSignal.timeout(5 * 60_000), emit);
  } catch (err) {
    console.error("[jarvis telegram-bot] AI error", err instanceof Error ? err.message : err);
    if (!out.trim()) out = `Kechirasiz, javob bera olmadim. Sababi: ${explainAIError(err)}.`;
  }
  out = out.trim() || "…";
  for (let i = 0; i < out.length; i += 4000) await send(chatId, out.slice(i, i + 4000));
}

async function onCallback(q: NonNullable<Update["callback_query"]>) {
  const c = S.cfg;
  const m = /^ap:([0-9a-f-]{36}):([01])$/.exec(q.data ?? "");
  if (!c || q.from.id !== c.ownerChatId || !m) {
    await api("answerCallbackQuery", { callback_query_id: q.id, text: "Ruxsat yo'q" }).catch(() => {});
    return;
  }
  const ok = decide(m[1], m[2] === "1");
  await api("answerCallbackQuery", { callback_query_id: q.id, text: ok ? "Qabul qilindi" : "Bu so'rov eskirgan" }).catch(() => {});
}
