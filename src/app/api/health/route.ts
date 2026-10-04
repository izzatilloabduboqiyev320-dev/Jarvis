import { isLocalRequest } from "@/ai/key-store";
import { healthSnapshot } from "@/server/health";

/** GET /api/health — service states for scripts and monitoring (this computer only). Only states and short reasons, never keys. */
export function GET(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ error: "local only" }, { status: 403 });
  return Response.json(healthSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
