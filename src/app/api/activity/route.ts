import { isLocalRequest } from "@/ai/key-store";
import { recentActivity } from "@/server/activity";

/** GET → JARVIS's recent activity log (what the server really did). Local only. */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ ok: false }, { status: 403 });
  return Response.json({ ok: true, entries: await recentActivity(100) });
}
