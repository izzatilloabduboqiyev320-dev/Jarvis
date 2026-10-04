/** Shapes shared by the chat client and the /api/chat route (no secrets here). */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ContextNode {
  /** Graph id, so the AI can highlight or open the item. Set by the server. */
  id?: string;
  label: string;
  category: string;
  description?: string;
  updated?: string;
  links?: string[];
  /** Full text of a memory or note (server retrieval only). */
  content?: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
  lang: "en" | "uz";
  /** Where the message came from; Telegram has no graph on screen. */
  channel?: "app" | "telegram";
  /** The message was spoken; the answer will be read aloud. */
  voice?: boolean;
  context: {
    /** Graph items related to the message. The client may send hints; the server adds what it finds. */
    nodes: ContextNode[];
    /** Saved memories related to the message (server retrieval only). */
    memories?: ContextNode[];
    selected?: string;
    /** What the local engine already did for this message (e.g. "saved memory X"). */
    localAction?: string;
  };
}

export const CHAT_LIMITS = {
  messages: 20,
  messageChars: 4000,
  nodes: 30,
  fieldChars: 400,
  links: 8,
} as const;
