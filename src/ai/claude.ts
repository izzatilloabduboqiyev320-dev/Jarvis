import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAIConfig } from "@/ai/config";
import type { ChatRequest } from "@/ai/types";
import { systemPrompt } from "@/ai/prompts";
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
        const out = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>, emit, signal);
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out).slice(0, 20_000) });
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${(err as Error).message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
}
