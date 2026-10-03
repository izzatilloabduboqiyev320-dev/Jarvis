# Architecture

```
Browser (Next.js client)                         Server (Next.js route handlers)
───────────────────────────                      ────────────────────────────────
AppShell ── boot ── GET /api/graph ───────────▶  demo graph   (Phase 3: SQLite)
   │                GET /api/status ──────────▶  env check, booleans only
   ▼
graph-instance (graphology, outside React)
   │
   ├─ KnowledgeGraph (Sigma.js WebGL, reducers, no React re-renders)
   ├─ Inspector / TopHubs / FilterPanel  (subscribe to store slices)
   ├─ CommandPalette (⌘K) / GraphToolbar search
   │        │
   │        ▼
   │   services/jarvis.ts  ── knowledge/query.ts (local brain)
   │        │                    Phase 2: POST /api/chat → ClaudeProvider + tools
   │        ▼
   └─ store (zustand): focus, selection, HUD state, activity log
```

## Decisions

- **Sigma.js + Graphology** over Cytoscape/D3: WebGL rendering keeps 5,000+ nodes interactive; D3/Cytoscape draw with SVG/canvas and slow down in the low thousands. Graphology gives us path finding and layouts on the same data structure.
- **Graph outside React state.** Hover, drag and animation mutate the graphology instance and call `sigma.refresh()`; React only re-renders panels when the graph's structure changes (`graphVersion`).
- **Deterministic layouts** (seeded ForceAtlas2) so the map doesn't reshuffle on every reload.
- **Local query engine first.** `knowledge/query.ts` handles intent (topic / path / create / open), entity linking and category filters offline. In Phase 2 these functions become Claude tools (`graph_search`, `graph_path`, `create_memory`), so DEMO MODE and AI mode share one code path.
- **Keys stay on the server.** `src/ai/config.ts` is `server-only`; the browser only learns `mode: demo | ai`.
- **Storage is swappable.** `/api/graph` is the single data entry point. Phase 3 swaps the demo dataset for SQLite (Drizzle), with a schema designed to move to Postgres + pgvector.

## Roadmap

1. **Foundation** ✓ graph, inspector, hubs, filters, HUD, palette, demo data.
2. **AI** — `AIProvider` interface with `ClaudeProvider` (OpenAI/local later), `/api/chat` with streaming, JARVIS system prompt, tool-calling over the graph engine, permission levels 0–3 with an approval dialog, "JARVIS AI service unavailable" fallback.
3. **Memory** — SQLite (nodes, edges, memories, conversations, messages, tools, agents, tasks, files, settings), memory types, embeddings and hybrid search (keyword + vector + graph + recency + importance), graph persistence.
4. **Files** — drag-and-drop PDF/TXT/MD/DOCX ingestion → chunk → entity/relationship extraction → graph.
5. **Voice** — server STT, ElevenLabs TTS with browser fallback, "Jarvis" wake workflow.
6. **Agents** — agent framework with step/time/tool limits, skills, MCP service layer, full activity stream.
