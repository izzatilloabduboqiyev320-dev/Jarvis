import Anthropic from "@anthropic-ai/sdk";
import { resetClaudeClient } from "@/ai/claude";
import { keyRoute } from "@/ai/key-route";

const route = keyRoute({
  name: "ANTHROPIC_API_KEY",
  pattern: /^sk-ant-[A-Za-z0-9_-]{20,300}$/,
  formatMessage: "This doesn't look like a Claude API key (it starts with sk-ant-).",
  invalidMessage: "Claude rejected this key. Copy it again from console.anthropic.com.",
  // Listing models is free, so checking the key costs nothing.
  async verify(key) {
    try {
      await new Anthropic({ apiKey: key }).models.list({ limit: 1 });
      return "ok";
    } catch (err) {
      return err instanceof Anthropic.APIError && err.status === 401 ? "invalid" : "unverified";
    }
  },
  onChange: resetClaudeClient,
});

export const { GET, POST, DELETE } = route;
