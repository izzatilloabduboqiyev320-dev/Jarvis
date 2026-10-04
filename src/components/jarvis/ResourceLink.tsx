"use client";

import { useEffect, useState } from "react";
import { RESOURCE_CATEGORIES, resourceUrl, sourceName, warnMissingUrl } from "@/lib/external-link";
import { openResource, setResourceUrl } from "@/services/jarvis";
import type { KGNode } from "@/types/graph";

const btn =
  "border border-line px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider text-ink-dim transition hover:border-accent/60 hover:text-accent";

/**
 * "OPEN YOUTUBE ↗" / "OPEN RESOURCE ↗" for items with an external link, used by the
 * Inspector and the item viewer. Resources without a link say so (nothing is
 * invented) and let the user paste the real link. Render with `key={node.id}`.
 */
export default function ResourceLink({ node, large = false }: { node: KGNode; large?: boolean }) {
  const url = resourceUrl(node);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isResource = RESOURCE_CATEGORIES.includes(node.category);

  useEffect(() => {
    if (!url) warnMissingUrl(node);
  }, [node, url]);

  if (!url && !isResource) return null;
  const source = url ? sourceName(url) : "";

  const save = async () => {
    const err = await setResourceUrl(node.id, draft.trim() || null);
    if (err) setError(err);
    else {
      setEditing(false);
      setError(null);
    }
  };

  return (
    <div className={large ? "mt-4" : "mt-3"} data-testid="resource-link">
      <div className="flex flex-wrap items-center gap-1">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={url}
            data-testid="open-resource"
            className={`${btn} border-accent/50 text-accent`}
            onClick={(e) => {
              e.preventDefault();
              const r = openResource(node);
              setError(r.ok ? null : r.message);
            }}
          >
            {source === "YouTube" ? "Open YouTube ↗" : "Open resource ↗"}
          </a>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint" data-testid="resource-missing">
            External link unavailable
          </span>
        )}
        {!editing && (
          <button
            className="px-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint transition hover:text-accent"
            onClick={() => {
              setDraft(url ?? "");
              setEditing(true);
            }}
            data-testid="resource-edit"
          >
            {url ? "Edit link" : "+ Add link"}
          </button>
        )}
        {url && source && <span className="truncate font-mono text-[10px] text-ink-faint">{source}</span>}
      </div>
      {editing && (
        <form
          className="mt-1.5 flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://…"
            autoFocus
            className="min-w-0 flex-1 border border-line bg-transparent px-2 py-[3px] font-mono text-[11px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
            data-testid="resource-url-input"
          />
          <button type="submit" className={btn} data-testid="resource-save">Save</button>
          <button type="button" className={btn} onClick={() => setEditing(false)}>Cancel</button>
        </form>
      )}
      {error && <div className="mt-1 text-[11px] text-red-300/90" role="status">{error}</div>}
    </div>
  );
}
