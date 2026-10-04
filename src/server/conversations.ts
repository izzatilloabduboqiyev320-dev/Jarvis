import "server-only";
import { randomUUID } from "node:crypto";
import type { ChatTurn } from "@/ai/types";
import { jsonFile } from "@/server/json-file";

/**
 * Conversations with JARVIS, kept in ~/.jarvis/conversations.json so they
 * survive refreshes, restarts and updates. Each channel (the app, Telegram)
 * has one current conversation; "clear chat" starts a new one and keeps the
 * old one in the archive (the latest 50 conversations).
 */

export type Channel = "app" | "telegram";

export interface StoredTurn extends ChatTurn {
  ts: number;
}

export interface Conversation {
  id: string;
  channel: Channel;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredTurn[];
}

const KEEP_CONVERSATIONS = 50;
const KEEP_MESSAGES = 200;

const store = jsonFile<{ conversations: Conversation[] }>(
  "conversations.json",
  () => ({ conversations: [] }),
  (raw) => {
    const c = (raw as { conversations?: unknown })?.conversations;
    return Array.isArray(c) ? { conversations: c.filter((x) => x && typeof x.id === "string" && Array.isArray(x.messages)) } : null;
  },
);

/** The channel's current conversation (the newest one), created when missing. */
export async function currentConversation(channel: Channel): Promise<Conversation> {
  const data = await store.load();
  const found = data.conversations.findLast((c) => c.channel === channel);
  return found ?? newConversation(channel);
}

export async function newConversation(channel: Channel): Promise<Conversation> {
  const data = await store.load();
  const now = Date.now();
  const c: Conversation = { id: randomUUID(), channel, title: "", createdAt: now, updatedAt: now, messages: [] };
  data.conversations.push(c);
  if (data.conversations.length > KEEP_CONVERSATIONS) data.conversations.splice(0, data.conversations.length - KEEP_CONVERSATIONS);
  await store.save();
  return c;
}

/** Adds turns to the channel's current conversation. */
export async function appendTurns(channel: Channel, turns: ChatTurn[]): Promise<Conversation> {
  const c = await currentConversation(channel);
  const now = Date.now();
  for (const t of turns) {
    const content = t.content.trim().slice(0, 8000);
    if (content) c.messages.push({ role: t.role, content, ts: now });
  }
  if (c.messages.length > KEEP_MESSAGES) c.messages.splice(0, c.messages.length - KEEP_MESSAGES);
  if (!c.title) c.title = c.messages.find((m) => m.role === "user")?.content.slice(0, 80) ?? "";
  c.updatedAt = now;
  await store.save();
  return c;
}

export async function listConversations(): Promise<Omit<Conversation, "messages">[]> {
  return (await store.load()).conversations
    .filter((c) => c.messages.length)
    .map((c) => ({ id: c.id, channel: c.channel, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt }))
    .reverse();
}
