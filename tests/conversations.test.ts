import { restart } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendTurns, currentConversation, listConversations, newConversation } from "@/server/conversations";
import { logActivity, recentActivity } from "@/server/activity";

test("conversations are saved and survive a restart", async () => {
  await appendTurns("app", [
    { role: "user", content: "Salom JARVIS" },
    { role: "assistant", content: "Salom!" },
  ]);
  await appendTurns("telegram", [{ role: "user", content: "Telegramdan salom" }]);
  restart();
  const app = await currentConversation("app");
  assert.deepEqual(
    app.messages.map((m) => [m.role, m.content]),
    [
      ["user", "Salom JARVIS"],
      ["assistant", "Salom!"],
    ],
  );
  assert.equal(app.title, "Salom JARVIS");
  assert.equal((await currentConversation("telegram")).messages.length, 1, "channels are kept apart");
});

test("a new conversation starts empty and the old one stays in the archive", async () => {
  const before = (await currentConversation("app")).id;
  await newConversation("app");
  assert.equal((await currentConversation("app")).messages.length, 0);
  assert.ok((await listConversations()).some((c) => c.id === before));
});

test("activity log is saved and survives a restart", async () => {
  await logActivity("search", "Searching memory", "app");
  await logActivity("tool", "Saved memory", "telegram");
  restart();
  const recent = await recentActivity(10);
  assert.deepEqual(
    recent.slice(-2).map((e) => [e.kind, e.text, e.channel]),
    [
      ["search", "Searching memory", "app"],
      ["tool", "Saved memory", "telegram"],
    ],
  );
});
