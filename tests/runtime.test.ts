import "./setup";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

/**
 * The running bot end to end against fake Telegram, Claude and market APIs:
 * TELEGRAM_BOT_TOKEN from .env is picked up, pairing works, /health and a
 * normal question are answered, prices carry their real market time, and the
 * start-up report runs without crashing.
 */

const TOKEN = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OWNER = 4242;
let server: http.Server;
const updates: object[] = [];
const sent: { chat_id: number; text: string }[] = [];
let nextId = 1;
let quoteTime = Math.floor(Date.now() / 1000);

function sse(res: http.ServerResponse, text: string) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  const ev = (t: string, d: object) => res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`);
  ev("message_start", { message: { id: "m1", type: "message", role: "assistant", model: "x", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } });
  ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  ev("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  ev("content_block_stop", { index: 0 });
  ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } });
  ev("message_stop", {});
  res.end();
}

const json = (res: http.ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

before(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = req.url ?? "";
      const body = raw ? JSON.parse(raw) : {};
      if (url === "/v1/messages") {
        if (body.stream) return sse(res, "Kuzatyapman.");
        return json(res, { id: "m0", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: "OK" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
      }
      if (url.startsWith("/v8/finance/chart/")) return json(res, { chart: { result: [{ meta: { regularMarketPrice: 2650.5, regularMarketTime: quoteTime, chartPreviousClose: 2600, currency: "USD" } }] } });
      if (url.startsWith("/api/v3/ticker/24hr")) return json(res, { lastPrice: "65000", priceChangePercent: "1.2", highPrice: "66000", lowPrice: "64000", closeTime: Date.now() });
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(url);
      if (!m || m[1] !== TOKEN) return json(res, { ok: false, error_code: 401, description: "Unauthorized" }, 401);
      switch (m[2]) {
        case "getMe":
          return json(res, { ok: true, result: { id: 123456789, is_bot: true, username: "jarvis_test_bot" } });
        case "getWebhookInfo":
          return json(res, { ok: true, result: { url: "" } });
        case "getUpdates": {
          const batch = updates.splice(0);
          return setTimeout(() => json(res, { ok: true, result: batch }), batch.length ? 0 : 100);
        }
        case "sendMessage":
          sent.push({ chat_id: body.chat_id, text: body.text });
          return json(res, { ok: true, result: { message_id: nextId++ } });
        default:
          return json(res, { ok: true, result: true });
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, { TELEGRAM_BASE_URL: base, ANTHROPIC_BASE_URL: base, JARVIS_YAHOO_URL: base, JARVIS_BINANCE_URL: base, ANTHROPIC_API_KEY: "sk-ant-test", TELEGRAM_BOT_TOKEN: TOKEN });
});
after(() => server.close());

const msg = (text: string, chat = OWNER) => ({ update_id: nextId++, message: { message_id: nextId++, chat: { id: chat, type: "private" }, from: { id: chat, first_name: "Owner" }, text } });

async function waitFor<T>(fn: () => T | undefined, ms = 5_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

test("quotes carry the exchange's own time and are flagged stale when old", async () => {
  const { getQuote } = await import("@/server/market");
  const fresh = await getQuote("XAUUSD");
  assert.equal(fresh.price, 2650.5);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.marketTime, new Date(quoteTime * 1000).toISOString());
  quoteTime -= 2 * 24 * 3600; // weekend: last candle two days ago
  assert.equal((await getQuote("XAUUSD")).stale, true);
  quoteTime = Math.floor(Date.now() / 1000);
});

test("a second JARVIS process on this computer does not poll the same bot", async () => {
  const lock = path.join(process.env.JARVIS_HOME!, "telegram-poller.lock");
  writeFileSync(lock, String(process.ppid)); // a live process that is not this one
  const tg = await import("@/server/telegram-assistant");
  const { healthSnapshot } = await import("@/server/health");
  tg.startAssistant();
  const state = await waitFor(() => (healthSnapshot().services.telegram?.ok === false ? healthSnapshot().services.telegram : undefined));
  assert.match(state!.detail, /another JARVIS process/);
  rmSync(lock);
  await waitFor(() => (healthSnapshot().services.telegram?.ok === false ? true : undefined));
});

test("TELEGRAM_BOT_TOKEN is used, the owner pairs, /health and questions are answered", async () => {
  const tg = await import("@/server/telegram-assistant");
  tg.startAssistant();
  tg.startAssistant(); // a second call must not start a second poller
  const status = await tg.checkAssistant();
  assert.equal(status.configured, true);
  assert.equal(status.ok, true);
  const { pairCode } = await tg.assistantInfo();
  assert.match(String(pairCode), /^\d{6}$/);

  updates.push(msg(String(pairCode)));
  await waitFor(() => sent.find((s) => s.text.startsWith("Ulandik")));

  updates.push(msg("/health"));
  const health = await waitFor(() => sent.find((s) => s.text.startsWith("JARVIS STATUS")));
  assert.match(health.text, /Bot \(Telegram\): 🟢/);
  assert.match(health.text, /Uptime:/);

  updates.push(msg("salom", 999)); // a stranger is ignored
  updates.push(msg("XAUUSD qanday?"));
  const reply = await waitFor(() => sent.find((s) => s.text === "Kuzatyapman."));
  assert.equal(reply.chat_id, OWNER);
  assert.ok(!sent.some((s) => s.chat_id === 999));
  assert.ok(!JSON.stringify(sent).includes(TOKEN), "the token is never sent in a message");
  await tg.removeAssistant(); // stops the poller
});

test("start-up report runs and never prints secrets", async () => {
  const lines: string[] = [];
  const orig = { info: console.info, error: console.error };
  console.info = console.error = (...a: unknown[]) => void lines.push(a.join(" "));
  try {
    const { runBootChecks } = await import("@/server/boot");
    await runBootChecks();
  } finally {
    Object.assign(console, orig);
  }
  const out = lines.join("\n");
  assert.match(out, /JARVIS TRADING BOT/);
  assert.match(out, /Claude {7}ONLINE/);
  assert.match(out, /Market Data {2}ONLINE/);
  assert.match(out, /Database {5}ONLINE/);
  assert.match(out, /XAUUSD DATA OK 2650.5/);
  assert.ok(!out.includes(TOKEN) && !out.includes("sk-ant-test"));
});

test("an unreadable data file is kept as a copy, not overwritten", async () => {
  const file = path.join(process.env.JARVIS_HOME!, "corrupt-test.json");
  writeFileSync(file, "{ not json");
  const { jsonFile } = await import("@/server/json-file");
  const store = jsonFile<{ n: number }>("corrupt-test.json", () => ({ n: 0 }), (raw) => raw as { n: number });
  (await store.load()).n = 1;
  await store.save();
  assert.ok(readdirSync(process.env.JARVIS_HOME!).some((f) => f.startsWith("corrupt-test.json.corrupt-")));
  assert.ok(existsSync(file));
});
