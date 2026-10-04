import { isLocalRequest } from "@/ai/key-store";
import { removeItem, setItemUrl, setTaskStatus } from "@/server/store";

/** PATCH {status: "open"|"done"} marks a saved task; PATCH {url} sets an item's external link (null clears it); DELETE removes a saved item (the UI confirms first). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isLocalRequest(request)) return Response.json({ message: "Local use only" }, { status: 403 });
  const { id } = await ctx.params;
  const b = (await request.json().catch(() => ({}))) as { status?: string; url?: unknown };
  if ("url" in b) {
    if (b.url !== null && typeof b.url !== "string") return Response.json({ message: "url must be a string or null" }, { status: 400 });
    try {
      const node = await setItemUrl(id, b.url);
      return node ? Response.json({ node }) : Response.json({ message: "No such item" }, { status: 404 });
    } catch (err) {
      return Response.json({ message: (err as Error).message }, { status: 400 });
    }
  }
  if (b.status !== "open" && b.status !== "done") return Response.json({ message: "status must be open or done" }, { status: 400 });
  const node = await setTaskStatus(id, b.status);
  return node ? Response.json({ node }) : Response.json({ message: "Not a saved task" }, { status: 404 });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isLocalRequest(request)) return Response.json({ message: "Local use only" }, { status: 403 });
  const { id } = await ctx.params;
  return (await removeItem(id)) ? Response.json({ ok: true }) : Response.json({ message: "Only items you created can be deleted" }, { status: 404 });
}
