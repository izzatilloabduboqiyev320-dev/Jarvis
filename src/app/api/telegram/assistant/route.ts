import { isLocalRequest } from "@/ai/key-store";
import { assistantInfo, removeAssistant, setAssistant, unpairAssistant } from "@/server/telegram-assistant";

/**
 * The dedicated "JARVIS in Telegram" bot. GET → status and pairing code (never the token);
 * POST {token} sets it up; POST {unpair: true} forgets the paired chat; DELETE disconnects.
 */

function denied(request: Request, change: boolean) {
  if (!isLocalRequest(request)) return Response.json({ ok: false, message: "Faqat JARVIS ishlayotgan kompyuterdan." }, { status: 403 });
  if (change && request.headers.get("x-jarvis-local") !== "1") return Response.json({ ok: false, message: "Missing app header." }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  return denied(request, false) ?? Response.json({ ok: true, ...(await assistantInfo()) });
}

export async function POST(request: Request) {
  const d = denied(request, true);
  if (d) return d;
  const b = (await request.json().catch(() => ({}))) as { token?: unknown; unpair?: unknown };
  try {
    if (b.unpair === true) {
      await unpairAssistant();
      return Response.json({ ok: true, ...(await assistantInfo()) });
    }
    return Response.json({ ok: true, ...(await setAssistant(typeof b.token === "string" ? b.token.trim() : "")) });
  } catch (err) {
    const e = err as Error & { code?: number };
    return Response.json({ ok: false, message: e.message }, { status: e.code === 400 ? 400 : 502 });
  }
}

export async function DELETE(request: Request) {
  const d = denied(request, true);
  if (d) return d;
  await removeAssistant();
  return Response.json({ ok: true, configured: false, paired: false });
}
