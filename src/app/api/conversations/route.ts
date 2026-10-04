import { isLocalRequest } from "@/ai/key-store";
import { currentConversation, listConversations, newConversation } from "@/server/conversations";

/**
 * GET → the app's current conversation (saved in ~/.jarvis) and the list of past ones.
 * POST {action:"new"} → starts a new conversation (the old one stays in the archive). Local only.
 */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ ok: false }, { status: 403 });
  const current = await currentConversation("app");
  return Response.json({ ok: true, current, conversations: (await listConversations()).slice(0, 50) });
}

export async function POST(request: Request) {
  if (!isLocalRequest(request) || request.headers.get("x-jarvis-local") !== "1") return Response.json({ ok: false }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "new") return Response.json({ ok: false }, { status: 400 });
  return Response.json({ ok: true, current: await newConversation("app") });
}
