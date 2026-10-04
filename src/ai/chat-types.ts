/** Shapes shared by the chat client and the /api/chat route (no secrets here). */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ContextNode {
  label: string;
  category: string;
  description?: string;
  updated?: string;
  links?: string[];
}

export interface ChatRequest {
  messages: ChatTurn[];
  lang: "en" | "uz";
  /** Where the message came from; Telegram has no graph on screen. */
  channel?: "app" | "telegram";
  context: {
    nodes: ContextNode[];
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
