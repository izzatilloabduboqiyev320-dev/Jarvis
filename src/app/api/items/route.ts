import { isLocalRequest } from "@/ai/key-store";
import { ITEM_CATEGORIES, type ItemCategory } from "@/knowledge/items";
import { addItem } from "@/server/store";
import { safeExternalUrl } from "@/lib/external-link";

/** POST /api/items {category, label, content, links, url?} → saves a memory, task or note permanently. */
export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ message: "Local use only" }, { status: 403 });
  let b: Record<string, unknown> = {};
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    /* invalid JSON */
  }
  const category = b.category as ItemCategory;
  if (!ITEM_CATEGORIES.includes(category)) return Response.json({ message: "category must be memory, task or note" }, { status: 400 });
  const label = typeof b.label === "string" ? b.label : "";
  const content = typeof b.content === "string" ? b.content : "";
  if (!label.trim() && !content.trim()) return Response.json({ message: "Empty item" }, { status: 400 });
  const links = Array.isArray(b.links) ? b.links.filter((l): l is string => typeof l === "string") : [];
  const url = typeof b.url === "string" && b.url.trim() ? b.url : undefined;
  if (url && !safeExternalUrl(url)) return Response.json({ message: "url must be an http(s) web address" }, { status: 400 });
  return Response.json(await addItem({ category, label, content, links, url }));
}
