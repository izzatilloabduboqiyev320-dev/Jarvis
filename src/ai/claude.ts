import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAIConfig } from "@/ai/config";
import type { ChatRequest } from "@/ai/chat-types";
import { runTool, TOOL_SPECS, type ChatEvent } from "@/ai/tools";

/** Tool rounds per message before JARVIS must answer. */
export const MAX_ROUNDS = 6;

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
Your knowledge comes from Izzatillo's personal knowledge graph (projects, notes, files, tools, people, tasks, goals, memories). Treat it as the truth about Izzatillo's world and say so when something is not in it. Today is ${new Date().toISOString().slice(0, 10)}.

You have tools: search_graph, get_item, find_connection and list_tasks read the graph; show_on_graph highlights items on his screen; save_memory, create_task, add_note and complete_task change it; check_bots checks his connected Telegram bots (read-only). Use them whenever the question is about his projects, knowledge, tasks or plans: look things up instead of guessing, and highlight what your answer is about. When he asks you to remember something, add a task or a note, do it with the tool, then confirm briefly. Do not save things he did not ask for unless they are clearly important facts about him.

Items that already matched his message:
${knowledge}
${selected ? `\nThe item currently selected on screen: ${selected}` : ""}
${localAction ? `\nAlready done by the system for this message: ${localAction}` : ""}

How to answer:
- ${req.lang === "uz" ? "The user is writing in Uzbek. Answer in natural Uzbek (Latin script)." : "Answer in the language the user writes in."}
- Be concise and direct, like a capable assistant speaking: usually 1–4 sentences, plain text, no markdown headings or tables. Your reply may be read aloud.
- You can talk, explain, plan and brainstorm on any topic. You cannot browse the web, read his files, send messages (including through his Telegram bots), run code or trade yet; if asked, say this arrives in a later phase.
- Never claim to have done something the system did not do. Sensitive actions always need the user's explicit approval.`;
}

/** Runs Claude with JARVIS's tools until it answers; streams text and tool effects through `emit`. */
export async function runClaudeAgent(req: ChatRequest, signal: AbortSignal, emit: (e: ChatEvent) => void): Promise<void> {
  const { model } = getAIConfig();
  const tools = TOOL_SPECS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  const messages: Anthropic.MessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
  const system = systemPrompt(req);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = getClient().messages.stream(
      // The last round gets no tools, so Claude must answer in words.
      { model, max_tokens: 1024, system, messages, ...(round < MAX_ROUNDS - 1 ? { tools } : {}) },
      { signal },
    );
    let wrote = false;
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        emit({ t: "text", v: event.delta.text });
        wrote = true;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason !== "tool_use") return;
    if (wrote) emit({ t: "text", v: "\n\n" });
    messages.push({ role: "assistant", content: final.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== "tool_use") continue;
      try {
        const out = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>, emit);
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out).slice(0, 20_000) });
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${(err as Error).message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
}
