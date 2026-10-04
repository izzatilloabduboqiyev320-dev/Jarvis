import { verifyGeminiKey } from "@/ai/gemini";
import { keyRoute } from "@/ai/key-route";

const route = keyRoute({
  name: "GEMINI_API_KEY",
  pattern: /^[A-Za-z0-9_-]{30,200}$/,
  formatMessage: "This doesn't look like a Gemini API key (copy it from aistudio.google.com → Get API key).",
  invalidMessage: "Google rejected this key. Copy it again from aistudio.google.com.",
  verify: verifyGeminiKey,
});

export const { GET, POST, DELETE } = route;
