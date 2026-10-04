import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAIConfig } from "@/ai/config";
import type { ChatRequest } from "@/ai/chat-types";

/**
 * Claude provider. The only place that talks to the Anthropic API; runs on the
 * server so the key never reaches the browser.
 */

let client: Anthropic | null = null;
/** Called after the key changes in Settings. */
export function resetClaudeClient() {
  client = null;
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });
  return client;
}

export function systemPrompt(req: ChatRequest): string {
  const { nodes, selected, localAction } = req.context;
  const knowledge = nodes.length
    ? nodes
        .map((n) => {
          const parts = [`- ${n.label} [${n.category}]`];
          if (n.description) parts.push(`: ${n.description}`);
          if (n.updated) parts.push(` (updated ${n.updated})`);
          if (n.links?.length) parts.push(` — linked to: ${n.links.join(", ")}`);
          return parts.join("");
        })
        .join("\n")
    : "(no matching items found in the knowledge graph)";

  return `You are J.A.R.V.I.S., the personal AI assistant of Izzatillo, running inside their knowledge operating system.
Your knowledge comes from Izzatillo's personal knowledge graph (projects, notes, files, tools, people, tasks, goals, memories). The items most relevant to the current message are listed below; treat them as the truth about Izzatillo's world and say so when something is not in them.

Relevant knowledge-graph items:
${knowledge}
${selected ? `\nThe item currently selected on screen: ${selected}` : ""}
${localAction ? `\nAlready done by the system for this message: ${localAction}` : ""}

How to answer:
- ${req.lang === "uz" ? "The user is writing in Uzbek. Answer in natural Uzbek (Latin script)." : "Answer in the language the user writes in."}
- Be concise and direct, like a capable assistant speaking: usually 1–4 sentences, plain text, no markdown headings or tables. Your reply may be read aloud.
- You can talk, explain, plan and brainstorm. You cannot yet browse the web, read files, send messages, run code or trade; if asked, say this arrives in a later phase.
- Never claim to have done something the system did not do. Sensitive actions always need the user's explicit approval.`;
}

/** Streams Claude's reply as plain text chunks. */
export async function* streamClaude(req: ChatRequest, signal: AbortSignal): AsyncGenerator<string> {
  const { model } = getAIConfig();
  const stream = getClient().messages.stream(
    {
      model,
      max_tokens: 1024,
      system: systemPrompt(req),
      messages: req.messages,
    },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
}
