# Architecture

```
Browser (Next.js client)                          Server (Next.js route handlers, Node)
───────────────────────────                       ─────────────────────────────────────────
AppShell ── boot ── GET /api/graph ────────────▶  store.ts: demo graph + ~/.jarvis items + bots
   │                GET /api/status ───────────▶  booleans only, never keys
   │                GET /api/conversations ────▶  conversations.ts (~/.jarvis/conversations.json)
   │                GET /api/activity ─────────▶  activity.ts (~/.jarvis/activity.json)
   ▼
graph-instance (graphology, outside React)
   ├─ KnowledgeGraph (Sigma.js WebGL)
   ├─ Inspector / TopHubs / FilterPanel / ActivityStream / ChatPanel / JarvisHud
   ▼
services/jarvis.ts ── knowledge/query.ts (local intent + graph focus; the whole brain in demo mode)
   └─ POST /api/chat (NDJSON stream) ──────────▶  ai/provider.ts  runJarvis()
                                                     1. log "received"
                                                     2. ai/context.ts: relevant memories + graph items
                                                        (knowledge/graph-search.ts, never the whole graph)
                                                     3. ai/prompts.ts system prompt (personality, intents)
                                                     4. Claude (ai/claude.ts) with tools (ai/tools.ts);
                                                        Gemini (ai/gemini.ts) if Claude fails or has no key
                                                     5. outside actions → approvals.ts (Ha / Yo'q)
                                                     6. save conversation, log every step
Telegram (telegram-assistant.ts) ──────────────▶  the same runJarvis() with channel "telegram"
```

## State at the start of Phase 2 (2026-10-04)

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, zustand.
- **Graph library:** Sigma.js 3 (WebGL) + graphology.
- **Database:** none yet. JSON files in `~/.jarvis` (atomic writes, owner-only): `jarvis-store.json` (memories, tasks, notes), `telegram.json`, `telegram-assistant.json`, `alerts.json`, `keys.env`; now also `conversations.json` and `activity.json`.
- **Claude:** Anthropic SDK with streaming and a tool loop; Gemini as backup and for Uzbek voice/transcription.
- **Mock/demo systems:** a 119-node demo graph is always merged in; the local query engine answers without a key; test mocks live outside the repo.
- **Voice:** push-to-talk with browser speech recognition, Gemini or browser TTS, hands-free conversation mode, Telegram voice messages via Gemini.
- **Problems found and fixed in Phase 2:** context was chosen by the browser (Telegram got none); conversations lived only in the browser (Telegram's only in memory); activity was client-side only; the system prompt lived inside the Claude provider; no automated tests.
- **Still open:** no SQLite or migrations yet (Phase 3); the demo graph can't be switched off (Phase 10); no memory deduplication beyond the prompt rule; no file ingestion; tools have no explicit permission levels yet (approval is per tool).

## Decisions

- **Sigma.js + Graphology:** WebGL keeps 5,000+ nodes interactive; graphology gives path finding and layouts.
- **Graph outside React state:** hover, drag and animation mutate graphology and refresh sigma; React re-renders panels only on structural changes.
- **Server decides the context:** the browser may send hints (what it highlighted), but the server retrieves the relevant memories and items itself, so the app and Telegram get the same brain.
- **Keys stay on the server:** `src/ai/config.ts` is `server-only`; the browser only learns `mode: demo | ai`.
- **Data outside the project folder:** `~/.jarvis` survives updates and reinstalls.

## Roadmap (the user's order)

1. Inspect architecture ✓
2. Backup ✓ (branch `backup-before-phase2`)
3. Claude backend connection ✓
4. Real chat ✓
5. Persistent conversations ✓
6. Memory: SQLite with migrations and backups, memory types and fields, deduplication
7. Graph persistence in SQLite
8. Memory → graph integration (entities and relations such as HAS_RULE)
9. Unified search `jarvisSearch(query)`
10. File ingestion (PDF, TXT, MD, DOCX)
11. File → graph extraction
12. Voice: STT/TTS provider interfaces, HUD states from real events
13. Tool framework: registry with permission levels 0–3
14. Approval system on top of the permission levels
