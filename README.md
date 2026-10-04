# J.A.R.V.I.S. — personal AI knowledge OS

A black, graph-centred command centre: your projects, knowledge, files, tools and agents as one interactive knowledge graph, with JARVIS (Claude, from Phase 2) as the brain.

![Dashboard](docs/screenshots/jarvis-dashboard.png)

## Launch

Requirements: **Node.js 20 or newer** (check with `node -v`).

```bash
cd jarvis
npm install        # first time only
npm run dev        # then open http://localhost:3000
```

No API keys are needed. Without keys JARVIS runs in **DEMO MODE** with a local brain that searches the knowledge graph.

### Talk to JARVIS by voice (natural Uzbek)

1. Get a Gemini key at https://aistudio.google.com → Get API key → Create API key.
2. In JARVIS open **Settings → Gemini API key**, paste it, press **Saqlash**.
3. On the graph page press **Ovozli suhbat** (under the HUD), allow the microphone in Chrome, and talk. JARVIS answers aloud with Gemini's voice and listens again; press the button again to stop.

With only a Gemini key, Gemini also writes the answers; with a Claude key too, Claude answers and Gemini speaks.

### Chat with Claude

1. Create a key at https://console.anthropic.com → API Keys (billing must be set up there).
2. In JARVIS open **Settings → Claude API key**, paste the key and press **Saqlash** (Save). JARVIS checks the key, saves it in `~/.jarvis/keys.env` (only your user can read it) and switches to Claude immediately, no restart needed. (Keys in `.env.local` also work.)
3. The HUD shows "online" and the chat (bottom-right of the graph, or /chat) answers with Claude, using the matching parts of your knowledge graph as context.

The key is read only on the server (`src/ai/claude.ts`, `/api/chat`) and never sent to the browser. `~/.jarvis` is outside the project folder, so updating or reinstalling JARVIS keeps your keys. Optional: `JARVIS_MODEL` picks another Claude model.

For a faster production build: `npm run build && npm start`.

## What works now (Phase 1)

| Area | Status |
|---|---|
| Knowledge graph | 119 meaningful demo nodes, 252 typed relationships, WebGL (Sigma.js) with glow, slow float, smooth animations |
| Graph interactions | hover highlights connections · click focuses + dims the rest · double-click opens the item · shift-click traces the path · drag nodes · zoom/pan · Fit · Reset · `/` to search |
| Layouts | Force (ForceAtlas2), Clusters (by category), Radial (around the selected node) |
| Inspector | name, type, description, connections (clickable), importance, last updated, source, tags, metadata, actions |
| Top Hubs | most connected nodes with counts |
| Filter | every category with coloured dot, count and toggle, instant |
| Search / Ask | natural language: "Find everything related to YouTube", "Show all projects connected to Claude", "Find files related to ICT", "How are Claude and my YouTube project connected?", "What am I working on?" |
| Command palette | `⌘K` / `Ctrl+K` or click the HUD: Ask Jarvis, Search Memory, Search Files, Add Note, Create Task, Import File, navigation, voice replies |
| Memory (permanent) | Memories, tasks and notes are saved in `~/.jarvis/jarvis-store.json` on this computer and survive reloads, restarts and updates. Saved items can be marked done or deleted from the Inspector |
| AI actions | With a Claude or Gemini key, JARVIS uses tools: searches the graph, opens items, traces connections, highlights results, lists tasks, saves memories/tasks/notes and marks tasks done ("…ni eslab qol", "vazifa qo'sh: …", "vazifalarim qanday?"). Tools run on the server, are logged, and cannot delete anything or reach outside this computer |
| JARVIS HUD | idle / listening / thinking / executing / speaking / error, each animated differently; push-to-talk (Chrome/Edge) with a mic-reactive ring; optional spoken replies (browser voice) |
| Chat | chat window on the graph page and /chat; streams Claude replies when `ANTHROPIC_API_KEY` is set, otherwise the local brain answers; history kept in the browser |
| Activity stream | every step JARVIS takes, timestamped |
| Pages | /graph (main), /chat, /memory, /files, /agents, /skills, /tasks, /settings |
| Scale | `/graph?stress=5000` loads 5,000 extra synthetic nodes for performance testing |

## Checks

```bash
npm run check   # lint + typecheck + query-engine smoke test + production build
```

## Most important files

| File | What it is |
|---|---|
| `src/components/graph/KnowledgeGraph.tsx` | the Sigma.js renderer: highlighting, focus, paths, drag, animation |
| `src/components/graph/glow-node-program.ts` | WebGL shader that draws the glowing nodes |
| `src/knowledge/demo-graph.ts` | the demo knowledge graph (edit this to change the sample data) |
| `src/knowledge/graph.ts` | graph model, path finding, hubs, layouts |
| `src/knowledge/query.ts` | the offline natural-language query engine (becomes Claude's tools in Phase 2) |
| `src/services/jarvis.ts` | the JARVIS request pipeline (intent → search → act → respond → speak) |
| `src/lib/store.ts` | app state (selection, focus, filters, HUD, activity) |
| `src/components/hud/JarvisHud.tsx` + `src/app/globals.css` | the HUD and the design system |
| `src/app/api/graph`, `src/app/api/status` | server routes (graph data; AI status, never exposes keys) |
| `src/ai/tools.ts` | the tools the AI can use, and the events they send to the screen |
| `src/server/store.ts` | permanent storage for memories, tasks and notes (`~/.jarvis`, set `JARVIS_HOME` to move it) |

See `docs/ARCHITECTURE.md` for how it fits together and the roadmap.
