import "./setup";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { addItem } from "@/server/store";
import { currentConversation } from "@/server/conversations";

/**
 * /api/chat end to end against a fake Claude API: the request must carry only
 * the relevant context, the reply streams back, and the conversation and
 * activity are saved.
 */

let server: http.Server;
let lastBody: { system: string; messages: { role: string; content: unknown }[]; tools?: unknown[] } | null = null;

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

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastBody = JSON.parse(body);
      if (req.headers["x-api-key"] === "BAD") {
        res.writeHead(401, { "content-type": "application/json" });
        return res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
      }
      sse(res, "Botingiz hech qachon avtomatik savdo qilmasligi kerak.");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});
after(() => server.close());

const chat = async (body: unknown, host = "localhost:3000") => {
  const { POST } = await import("@/app/api/chat/route");
  return POST(new Request("http://localhost:3000/api/chat", { method: "POST", headers: { host, "content-type": "application/json" }, body: JSON.stringify(body) }));
};

test("chat streams Claude's answer with only the relevant context, then saves it", async () => {
  await addItem({ category: "memory", label: "Trading bot rule", content: "The trading bot must never execute trades automatically", links: [] });
  const res = await chat({ messages: [{ role: "user", content: "What did I say about my trading bot?" }], lang: "en", context: { nodes: [] } });
  assert.equal(res.status, 200);
  const events = (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const text = events.filter((e) => e.t === "text").map((e) => e.v).join("");
  assert.equal(text, "Botingiz hech qachon avtomatik savdo qilmasligi kerak.");
  const activity = events.filter((e) => e.t === "activity").map((e) => e.text);
  assert.ok(activity.some((a) => a.startsWith("Searching memory")));
  assert.ok(activity.some((a) => /Found \d+ relevant memor/.test(a)), activity.join(" | "));
  assert.ok(activity.some((a) => /Claude reasoning complete/.test(a)));

  // Claude got the memory, the intent rules and tools, but not the whole graph.
  assert.ok(lastBody);
  assert.match(lastBody.system, /never execute trades automatically/);
  assert.match(lastBody.system, /Decide the intent first/);
  assert.ok((lastBody.tools ?? []).length > 5);
  assert.ok(lastBody.system.length < 12_000, `system prompt is ${lastBody.system.length} chars`);

  const conv = await currentConversation("app");
  assert.deepEqual(conv.messages.slice(-2).map((m) => m.role), ["user", "assistant"]);
  assert.equal(conv.messages.at(-1)?.content, text);
});

test("chat refuses requests that are not from this computer", async () => {
  const res = await chat({ messages: [{ role: "user", content: "hi" }], lang: "en", context: { nodes: [] } }, "evil.example.com");
  assert.equal(res.status, 403);
});

test("chat rejects malformed requests", async () => {
  const res = await chat({ messages: "nope" });
  assert.equal(res.status, 400);
});

test("a bad Claude key gives a clear 401", async () => {
  process.env.ANTHROPIC_API_KEY = "BAD";
  const { resetClaudeClient } = await import("@/ai/claude");
  resetClaudeClient();
  const res = await chat({ messages: [{ role: "user", content: "salom" }], lang: "uz", context: { nodes: [] } });
  assert.equal(res.status, 401);
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  resetClaudeClient();
});
