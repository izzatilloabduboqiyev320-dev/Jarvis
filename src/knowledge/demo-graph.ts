import type { KGData, KGEdge, KGNode, NodeCategory, RelationType } from "@/types/graph";

/**
 * Demo knowledge graph shown on first run (and whenever no database exists).
 * Everything here is meaningful sample data about Izzatillo's world so the
 * graph looks alive and every query in the README has something to find.
 */

type N = [
  id: string,
  label: string,
  category: NodeCategory,
  importance: number,
  description: string,
  tags: string[],
  extra?: Partial<KGNode>,
];

const daysAgo = (d: number, h = 10) => {
  const base = Date.UTC(2026, 9, 3, h, 0, 0);
  return new Date(base - d * 86_400_000).toISOString();
};

const NODES: N[] = [
  // ── Person / centre ────────────────────────────────────────────────
  ["izzatillo", "Izzatillo", "person", 1, "Owner of this JARVIS. Creator, trader and builder working across content, trading and AI tooling.", ["me", "owner", "creator", "trader", "builder"], { source: "profile" }],
  ["ict-huddleston", "Michael J. Huddleston", "person", 0.45, "Creator of the ICT (Inner Circle Trader) methodology.", ["ict", "mentor", "trading"]],
  ["mark-douglas", "Mark Douglas", "person", 0.3, "Author of Trading in the Zone; trading psychology.", ["psychology", "author"]],
  ["alex-hormozi", "Alex Hormozi", "person", 0.3, "Entrepreneur and author of $100M Offers.", ["business", "author", "offers"]],
  ["tiago-forte", "Tiago Forte", "person", 0.25, "Author of Building a Second Brain; personal knowledge management.", ["pkm", "author", "second brain"]],

  // ── Routers (system hubs) ─────────────────────────────────────────
  ["jarvis-core", "JARVIS Core", "router", 0.95, "Central router. Every request passes through here before memory, graph and tools are consulted.", ["jarvis", "orchestrator", "router"], { source: "system" }],
  ["knowledge-router", "Knowledge Router", "router", 0.7, "Routes questions to the right wiki, notes, files and memories.", ["retrieval", "search", "router"], { source: "system" }],
  ["action-router", "Action Router", "router", 0.65, "Routes actions to tools and agents, enforcing the permission system.", ["tools", "permissions", "router"], { source: "system" }],
  ["local-projects", "Local Projects", "router", 0.7, "Index of project folders on this machine.", ["projects", "code", "folders"], { source: "filesystem" }],

  // ── Worlds (life domains) ─────────────────────────────────────────
  ["world-trading", "Trading", "world", 0.9, "Everything about markets: ICT, MSNR, journaling, risk and psychology.", ["trading", "markets", "forex", "ict", "msnr"]],
  ["world-creator", "Content Creation", "world", 0.88, "The creator world: YouTube, scripts, editing and audience growth.", ["content", "youtube", "creator", "video"]],
  ["world-builder", "AI & Automation", "world", 0.88, "Building with AI: JARVIS, Claude, agents and automations.", ["ai", "automation", "claude", "building"]],
  ["world-business", "Business", "world", 0.75, "Turning skills into income: offers, brand and products.", ["business", "money", "offers", "brand"]],

  // ── Wiki ──────────────────────────────────────────────────────────
  ["wiki-trading", "Trading Knowledge", "wiki", 0.8, "Personal trading wiki: concepts, setups and lessons learned.", ["trading", "wiki", "ict", "msnr"]],
  ["wiki-ai", "AI Workshop", "wiki", 0.78, "Personal AI wiki: prompting, agents, MCP, RAG experiments.", ["ai", "wiki", "claude", "agents"]],
  ["wiki-creator", "Creator Playbook", "wiki", 0.6, "What works on YouTube: hooks, retention, thumbnails, SEO.", ["youtube", "wiki", "content"]],

  // ── Suites ────────────────────────────────────────────────────────
  ["suite-content", "Content Suite", "suite", 0.6, "Bundle of skills, tools and agents for producing videos end-to-end.", ["content", "youtube", "suite"]],
  ["suite-trading", "Trading Suite", "suite", 0.6, "Bundle for research, journaling and backtesting. Read-only — no live trades.", ["trading", "suite", "read-only"]],
  ["suite-dev", "Dev Suite", "suite", 0.55, "Bundle of coding tools used to build JARVIS and other projects.", ["code", "dev", "suite"]],

  // ── Projects ──────────────────────────────────────────────────────
  ["p-jarvis", "JARVIS", "project", 0.98, "Personal AI operating system: knowledge graph, Claude brain, memory, voice, agents.", ["jarvis", "ai", "nextjs", "claude", "knowledge graph"], { metadata: { status: "active", priority: "high", phase: "1 — Foundation" } }],
  ["p-youtube", "YouTube Channel", "project", 0.92, "Faceless + personal channel about AI tools, trading psychology and productivity.", ["youtube", "content", "channel", "video"], { metadata: { status: "active", subscribers: "growing" } }],
  ["p-trading-journal", "Trading Journal", "project", 0.8, "Structured journal of every trade with screenshots, setups and emotions.", ["trading", "journal", "ict", "msnr"], { metadata: { status: "active" } }],
  ["p-telegram-bot", "Telegram Bot", "project", 0.65, "Bot that pushes market briefs and JARVIS notifications to Telegram.", ["telegram", "bot", "automation"], { metadata: { status: "planned" } }],
  ["p-ai-tools-course", "AI Tools Course", "project", 0.62, "Mini-course teaching creators to use Claude and automation tools.", ["course", "ai", "business", "claude"], { metadata: { status: "idea" } }],
  ["p-personal-site", "Personal Website", "project", 0.45, "Portfolio and newsletter landing page.", ["website", "brand", "nextjs"], { metadata: { status: "paused" } }],
  ["p-shorts", "Shorts Pipeline", "project", 0.55, "Repurposing long videos into vertical shorts automatically.", ["shorts", "video editing", "automation", "youtube"], { metadata: { status: "active" } }],

  // ── Concepts ──────────────────────────────────────────────────────
  ["c-ict", "ICT", "concept", 0.88, "Inner Circle Trader methodology: liquidity, order blocks, fair value gaps, kill zones.", ["ict", "trading", "smart money", "liquidity"]],
  ["c-msnr", "MSNR", "concept", 0.8, "Malaysian Support & Resistance: storyline, fresh levels, QM and compression.", ["msnr", "trading", "support", "resistance"]],
  ["c-order-blocks", "Order Blocks", "concept", 0.55, "Last opposing candle before an impulsive move; institutional footprint.", ["ict", "trading", "order block"]],
  ["c-fvg", "Fair Value Gap", "concept", 0.55, "Three-candle imbalance price tends to rebalance into.", ["ict", "fvg", "imbalance"]],
  ["c-liquidity", "Liquidity Sweeps", "concept", 0.6, "Runs on buy-side / sell-side liquidity before reversals.", ["ict", "liquidity", "stop hunt"]],
  ["c-kill-zones", "Kill Zones", "concept", 0.5, "London and New York session windows with the highest probability moves.", ["ict", "sessions", "london", "new york"]],
  ["c-market-structure", "Market Structure", "concept", 0.62, "Highs, lows, breaks of structure and changes of character.", ["trading", "structure", "bos", "choch"]],
  ["c-qm", "Quasimodo (QM)", "concept", 0.45, "MSNR reversal pattern formed by a failed higher high / lower low.", ["msnr", "pattern", "reversal"]],
  ["c-risk", "Risk Management", "concept", 0.7, "Fixed % risk, R-multiples, max daily loss and position sizing.", ["trading", "risk", "money management"]],
  ["c-psychology", "Trading Psychology", "concept", 0.55, "Discipline, probabilistic thinking and emotional control.", ["trading", "psychology", "mindset"]],
  ["c-knowledge-graph", "Knowledge Graph", "concept", 0.7, "Representing knowledge as nodes and typed relationships.", ["graph", "ai", "jarvis", "memory"]],
  ["c-rag", "Retrieval-Augmented Generation", "concept", 0.55, "Grounding model answers in retrieved documents.", ["rag", "ai", "search", "embeddings"]],
  ["c-mcp", "Model Context Protocol", "concept", 0.55, "Open protocol for connecting AI models to tools and data.", ["mcp", "ai", "tools", "claude"]],
  ["c-agents", "AI Agents", "concept", 0.65, "Models that plan, call tools and act over multiple steps.", ["agents", "ai", "orchestration"]],
  ["c-prompting", "Prompt Engineering", "concept", 0.55, "Writing instructions and context that get reliable model output.", ["prompting", "ai", "claude"]],
  ["c-retention", "Audience Retention", "concept", 0.55, "Hooks, pacing and pattern interrupts that keep viewers watching.", ["youtube", "retention", "hooks"]],
  ["c-seo", "YouTube SEO", "concept", 0.45, "Titles, descriptions and tags that help videos get discovered.", ["youtube", "seo", "titles"]],
  ["c-storytelling", "Storytelling", "concept", 0.5, "Narrative structure for scripts and presentations.", ["content", "story", "scripts"]],
  ["c-personal-brand", "Personal Brand", "concept", 0.5, "Consistent identity and trust across platforms.", ["brand", "business", "content"]],
  ["c-second-brain", "Second Brain", "concept", 0.5, "Capture, organise, distil, express — external memory for ideas.", ["pkm", "notes", "memory"]],
  ["c-offers", "Irresistible Offers", "concept", 0.45, "Value equation: dream outcome × likelihood ÷ time × effort.", ["business", "offers", "hormozi"]],

  // ── Skills ────────────────────────────────────────────────────────
  ["s-content", "Content Creation", "skill", 0.75, "Planning, scripting, filming and publishing content.", ["content", "youtube", "skill"]],
  ["s-video-editing", "Video Editing", "skill", 0.7, "Cutting, pacing, captions, sound design and colour.", ["video editing", "davinci", "capcut", "skill"]],
  ["s-scriptwriting", "Scriptwriting", "skill", 0.6, "Writing hooks and scripts for YouTube videos.", ["scripts", "writing", "youtube", "skill"]],
  ["s-thumbnails", "Thumbnail Design", "skill", 0.45, "Designing high-CTR thumbnails.", ["thumbnails", "design", "youtube", "skill"]],
  ["s-trading-analysis", "Trading Analysis", "skill", 0.7, "Reading charts with ICT and MSNR, marking levels and planning trades.", ["trading", "analysis", "charts", "skill"]],
  ["s-programming", "Programming", "skill", 0.65, "TypeScript, Next.js and Python for building tools.", ["code", "typescript", "nextjs", "skill"]],
  ["s-automation", "Automation Design", "skill", 0.55, "Designing reliable workflows with n8n, scripts and agents.", ["automation", "n8n", "workflows", "skill"]],
  ["s-business", "Business Strategy", "skill", 0.5, "Positioning, offers and monetisation.", ["business", "strategy", "skill"]],

  // ── Tools ─────────────────────────────────────────────────────────
  ["t-claude", "Claude", "tool", 0.95, "Anthropic's model — the reasoning engine (brain) of JARVIS.", ["claude", "ai", "llm", "anthropic"], { source: "anthropic.com" }],
  ["t-claude-code", "Claude Code", "tool", 0.8, "Agentic coding tool used to build JARVIS and automations.", ["claude", "code", "agent", "anthropic"]],
  ["t-davinci", "DaVinci Resolve", "tool", 0.5, "Main long-form video editor.", ["video editing", "editor"]],
  ["t-capcut", "CapCut", "tool", 0.45, "Fast editor for shorts and captions.", ["video editing", "shorts", "captions"]],
  ["t-tradingview", "TradingView", "tool", 0.6, "Charting platform for analysis and backtesting.", ["trading", "charts", "backtesting"]],
  ["t-mt5", "MetaTrader 5", "tool", 0.4, "Broker platform. JARVIS never places live trades.", ["trading", "broker", "read-only"]],
  ["t-notion", "Notion", "tool", 0.45, "Content calendar and planning boards.", ["notes", "planning", "calendar"]],
  ["t-obsidian", "Obsidian", "tool", 0.45, "Local markdown vault — source for many notes.", ["notes", "markdown", "pkm"]],
  ["t-vscode", "VS Code", "tool", 0.45, "Code editor.", ["code", "editor"]],
  ["t-nextjs", "Next.js", "tool", 0.5, "React framework JARVIS is built on.", ["code", "react", "web"]],
  ["t-telegram", "Telegram", "tool", 0.55, "Messaging — notifications and bot channel.", ["telegram", "messaging", "notifications"]],
  ["t-elevenlabs", "ElevenLabs", "tool", 0.45, "High-quality text-to-speech for JARVIS's voice and voice-overs.", ["voice", "tts", "audio"]],
  ["t-n8n", "n8n", "tool", 0.5, "Workflow automation engine.", ["automation", "workflows"]],
  ["t-sigma", "Sigma.js", "tool", 0.35, "WebGL graph renderer used for this knowledge graph.", ["graph", "webgl", "visualisation"]],

  // ── Agents ────────────────────────────────────────────────────────
  ["a-research", "Research Agent", "agent", 0.6, "Searches the web and knowledge base, then writes briefs.", ["agent", "research", "web"]],
  ["a-content", "Content Agent", "agent", 0.6, "Generates video ideas, scripts, titles and descriptions.", ["agent", "content", "youtube"]],
  ["a-file", "File Agent", "agent", 0.5, "Reads, chunks and summarises imported files.", ["agent", "files", "ingestion"]],
  ["a-trading", "Trading Knowledge Agent", "agent", 0.55, "Answers questions from the trading wiki. Read-only; never trades.", ["agent", "trading", "ict", "msnr"]],
  ["a-automation", "Automation Agent", "agent", 0.45, "Builds and monitors automations. Sensitive steps need approval.", ["agent", "automation"]],
  ["a-calendar", "Calendar Agent", "agent", 0.35, "Plans the week and schedules recording sessions.", ["agent", "calendar", "planning"]],
  ["a-email", "Email Agent", "agent", 0.35, "Drafts and triages email. Sending always requires approval.", ["agent", "email", "approval"]],

  // ── Automations ───────────────────────────────────────────────────
  ["au-market-brief", "Daily Market Brief", "automation", 0.5, "Every morning: summarise overnight price action and key levels.", ["trading", "telegram", "daily"]],
  ["au-upload", "Upload Pipeline", "automation", 0.5, "Render → captions → thumbnail → schedule upload (approval before publish).", ["youtube", "publishing", "approval"]],
  ["au-telegram-alerts", "Telegram Alerts", "automation", 0.4, "Pushes JARVIS notifications to Telegram.", ["telegram", "notifications"]],
  ["au-weekly-review", "Weekly Review", "automation", 0.45, "Every Sunday: compile what was done, decided and learned.", ["review", "weekly", "memory"]],
  ["au-shorts-cutter", "Shorts Auto-Cutter", "automation", 0.4, "Finds highlight moments in long videos and drafts shorts.", ["shorts", "video editing", "ai"]],

  // ── Notes ─────────────────────────────────────────────────────────
  ["n-killzones", "ICT Kill Zone Notes", "note", 0.5, "Personal notes on London / NY kill zone timing.", ["ict", "kill zones", "trading"], { content: "London open 07:00–10:00 UTC. NY AM 12:30–15:00 UTC. Best setups after a liquidity sweep into an FVG during the kill zone. Avoid trading the Asian range expansion.", source: "Obsidian vault" }],
  ["n-msnr-checklist", "MSNR Setup Checklist", "note", 0.5, "Pre-trade checklist for MSNR entries.", ["msnr", "checklist", "trading"], { content: "1) Storyline on HTF. 2) Fresh, unmitigated level. 3) QM or compression into the level. 4) Risk ≤ 1%. 5) Screenshot before entry.", source: "Obsidian vault" }],
  ["n-video-ideas", "Video Ideas Backlog", "note", 0.55, "Running list of video ideas.", ["youtube", "ideas", "content"], { content: "• I built my own JARVIS with Claude\n• ICT vs MSNR — which one actually works?\n• 5 AI tools that save me 10 hours a week\n• How I journal every trade", source: "Notion" }],
  ["n-jarvis-arch", "JARVIS Architecture Notes", "note", 0.6, "Design decisions for JARVIS.", ["jarvis", "architecture", "decisions"], { content: "Graph-centred UI. Claude as brain via provider abstraction. SQLite first, Postgres + pgvector later. Every external or destructive action needs explicit approval.", source: "JARVIS" }],
  ["n-weekly-review", "Weekly Review — Sep 27", "note", 0.45, "Last weekly review.", ["review", "weekly"], { content: "Shipped: 2 videos, 11 journaled trades (+3.4R). Decided: build JARVIS as the main project this month. Next: finish edit of the JARVIS video, backtest MSNR QM setups.", source: "Weekly Review automation" }],
  ["n-channel-strategy", "Channel Strategy", "note", 0.5, "Positioning and content pillars for the channel.", ["youtube", "strategy", "pillars"], { content: "Pillars: AI tools for creators, building in public (JARVIS), trading psychology. 1 long video + 3 shorts per week.", source: "Notion" }],
  ["n-business-ideas", "Business Ideas", "note", 0.4, "Possible offers built on existing skills.", ["business", "ideas"], { content: "AI tools course for creators; done-for-you automation setups; trading journal template.", source: "Obsidian vault" }],

  // ── Files ─────────────────────────────────────────────────────────
  ["f-ict-pdf", "ict_strategy.pdf", "file", 0.55, "Compiled ICT strategy notes (42 pages).", ["ict", "pdf", "trading"], { source: "~/Documents/Trading", metadata: { size: "3.1 MB", pages: 42, format: "PDF" } }],
  ["f-msnr-pdf", "msnr_playbook.pdf", "file", 0.5, "MSNR playbook with annotated chart examples.", ["msnr", "pdf", "trading"], { source: "~/Documents/Trading", metadata: { size: "5.8 MB", pages: 67, format: "PDF" } }],
  ["f-scripts", "youtube_scripts.docx", "file", 0.45, "Drafts of the last ten video scripts.", ["youtube", "scripts", "docx"], { source: "~/Documents/YouTube", metadata: { size: "220 KB", format: "DOCX" } }],
  ["f-jarvis-spec", "jarvis_spec.md", "file", 0.55, "The full JARVIS build specification.", ["jarvis", "spec", "markdown"], { source: "~/Projects/jarvis", metadata: { size: "18 KB", format: "Markdown" } }],
  ["f-trade-log", "trade_log_2026.csv", "file", 0.4, "Raw export of every trade this year.", ["trading", "journal", "csv"], { source: "~/Documents/Trading", metadata: { size: "96 KB", rows: 214, format: "CSV" } }],
  ["f-brand", "brand_guidelines.pdf", "file", 0.35, "Colours, fonts and tone of voice.", ["brand", "design", "pdf"], { source: "~/Documents/Brand", metadata: { size: "1.2 MB", format: "PDF" } }],

  // ── Books ─────────────────────────────────────────────────────────
  ["b-zone", "Trading in the Zone", "book", 0.5, "Mark Douglas on probabilistic thinking and discipline.", ["book", "trading", "psychology"]],
  ["b-second-brain", "Building a Second Brain", "book", 0.45, "Tiago Forte's method for personal knowledge management.", ["book", "pkm", "notes"]],
  ["b-offers", "$100M Offers", "book", 0.45, "Alex Hormozi on creating offers people can't refuse.", ["book", "business", "offers"]],

  // ── Videos ────────────────────────────────────────────────────────
  ["v-ict-mentorship", "ICT 2022 Mentorship", "video", 0.55, "Free ICT mentorship series — core model.", ["ict", "video", "trading"], { source: "youtube.com" }],
  ["v-jarvis-video", "I Built My Own JARVIS (draft)", "video", 0.6, "Upcoming video documenting the JARVIS build.", ["youtube", "jarvis", "draft"], { metadata: { status: "editing" } }],
  ["v-ai-tools", "5 AI Tools That Save Me 10 Hours", "video", 0.45, "Published video — best performer this quarter.", ["youtube", "ai", "tools"], { metadata: { status: "published" } }],

  // ── Web sources ───────────────────────────────────────────────────
  ["w-anthropic-docs", "Anthropic Docs", "web", 0.45, "Claude API and tool-use documentation.", ["claude", "docs", "api"], { source: "docs.anthropic.com", url: "https://docs.anthropic.com" }],
  ["w-yt-studio", "YouTube Studio Analytics", "web", 0.45, "Channel analytics: CTR, retention, traffic sources.", ["youtube", "analytics"], { source: "studio.youtube.com", url: "https://studio.youtube.com" }],
  ["w-forex-factory", "Forex Factory", "web", 0.35, "Economic calendar for news events.", ["trading", "news", "calendar"], { source: "forexfactory.com", url: "https://www.forexfactory.com/calendar" }],
  ["w-mcp-spec", "MCP Specification", "web", 0.35, "Model Context Protocol spec and server list.", ["mcp", "spec"], { source: "modelcontextprotocol.io", url: "https://modelcontextprotocol.io" }],

  // ── Companies ─────────────────────────────────────────────────────
  ["co-anthropic", "Anthropic", "company", 0.55, "AI safety company that builds Claude.", ["claude", "ai", "company"]],
  ["co-youtube", "YouTube", "company", 0.6, "Video platform where the channel lives.", ["youtube", "platform"]],

  // ── Tasks ─────────────────────────────────────────────────────────
  ["tk-jarvis-p1", "Finish JARVIS Phase 1", "task", 0.7, "Foundation UI: graph, inspector, filters, HUD, command palette.", ["jarvis", "task", "open"], { metadata: { status: "in progress", due: "2026-10-05" } }],
  ["tk-edit-video", "Edit JARVIS video", "task", 0.55, "Finish the edit of the JARVIS build video.", ["youtube", "editing", "task", "open"], { metadata: { status: "open", due: "2026-10-08" } }],
  ["tk-backtest", "Backtest MSNR QM setups", "task", 0.5, "Backtest 50 QM setups on EURUSD and GBPUSD.", ["msnr", "backtest", "task", "open"], { metadata: { status: "open" } }],
  ["tk-telegram", "Set up Telegram bot token", "task", 0.35, "Create bot with BotFather and add token to .env.", ["telegram", "task", "open"], { metadata: { status: "open" } }],
  ["tk-weekly", "Write weekly review", "task", 0.3, "Sunday weekly review.", ["review", "task"], { metadata: { status: "done" } }],

  // ── Goals ─────────────────────────────────────────────────────────
  ["g-ai-os", "Build personal AI OS", "goal", 0.8, "A JARVIS that knows my work and acts with my permission.", ["jarvis", "goal", "ai"]],
  ["g-channel", "Grow channel to 100K", "goal", 0.7, "Reach 100K subscribers with consistent weekly uploads.", ["youtube", "goal", "growth"]],
  ["g-trading", "Consistent profitable trading", "goal", 0.7, "Positive expectancy with disciplined risk.", ["trading", "goal"]],
  ["g-business", "Launch AI business", "goal", 0.55, "First paid offer built on AI skills.", ["business", "goal", "ai"]],

  // ── Memories ──────────────────────────────────────────────────────
  ["m-concise", "Prefers concise answers", "memory", 0.5, "Preference: short, direct answers; details only on request.", ["preference", "communication"], { source: "preference memory" }],
  ["m-sessions", "Trades London & NY sessions", "memory", 0.45, "Fact: active during London and New York kill zones only.", ["trading", "habit", "kill zones"], { source: "long-term memory" }],
  ["m-sigma", "Decided: Sigma.js for the graph", "memory", 0.45, "Decision: WebGL rendering via Sigma.js + Graphology to scale to 5,000+ nodes.", ["jarvis", "decision", "graph"], { source: "episodic memory" }],
  ["m-no-live-trades", "Rule: no live trades", "memory", 0.55, "JARVIS may analyse trading knowledge but must never execute trades.", ["trading", "rule", "permissions"], { source: "long-term memory" }],
];

type E = [source: string, relation: RelationType, target: string, weight?: number];

const EDGES: E[] = [
  // Me
  ["izzatillo", "WORKS_ON", "p-jarvis", 1],
  ["izzatillo", "WORKS_ON", "p-youtube", 1],
  ["izzatillo", "WORKS_ON", "p-trading-journal", 0.9],
  ["izzatillo", "WORKS_ON", "p-shorts", 0.6],
  ["izzatillo", "WORKS_ON", "p-telegram-bot", 0.5],
  ["izzatillo", "WORKS_ON", "p-ai-tools-course", 0.4],
  ["izzatillo", "WORKS_ON", "p-personal-site", 0.3],
  ["izzatillo", "PART_OF", "world-trading"],
  ["izzatillo", "PART_OF", "world-creator"],
  ["izzatillo", "PART_OF", "world-builder"],
  ["izzatillo", "PART_OF", "world-business"],
  ["izzatillo", "USES", "t-claude", 0.9],
  ["izzatillo", "USES", "t-telegram", 0.5],
  ["izzatillo", "PURSUES", "g-ai-os"],
  ["izzatillo", "PURSUES", "g-channel"],
  ["izzatillo", "PURSUES", "g-trading"],
  ["izzatillo", "PURSUES", "g-business"],
  ["izzatillo", "CONNECTED_TO", "jarvis-core"],
  ["m-concise", "RELATED_TO", "izzatillo"],
  ["m-sessions", "RELATED_TO", "izzatillo"],

  // Routers
  ["jarvis-core", "CONNECTED_TO", "knowledge-router"],
  ["jarvis-core", "CONNECTED_TO", "action-router"],
  ["jarvis-core", "USES", "t-claude", 1],
  ["jarvis-core", "PART_OF", "p-jarvis"],
  ["knowledge-router", "CONNECTED_TO", "wiki-trading"],
  ["knowledge-router", "CONNECTED_TO", "wiki-ai"],
  ["knowledge-router", "CONNECTED_TO", "wiki-creator"],
  ["knowledge-router", "CONNECTED_TO", "local-projects"],
  ["knowledge-router", "USES", "c-rag"],
  ["knowledge-router", "USES", "c-knowledge-graph"],
  ["action-router", "CONNECTED_TO", "suite-content"],
  ["action-router", "CONNECTED_TO", "suite-trading"],
  ["action-router", "CONNECTED_TO", "suite-dev"],
  ["action-router", "USES", "c-mcp"],
  ["action-router", "CONNECTED_TO", "m-no-live-trades"],
  ["local-projects", "CONTAINS", "p-jarvis"],
  ["local-projects", "CONTAINS", "p-telegram-bot"],
  ["local-projects", "CONTAINS", "p-personal-site"],
  ["local-projects", "CONTAINS", "p-shorts"],
  ["local-projects", "CONTAINS", "f-jarvis-spec"],

  // Worlds
  ["world-trading", "CONTAINS", "wiki-trading"],
  ["world-trading", "CONTAINS", "p-trading-journal"],
  ["world-trading", "CONTAINS", "suite-trading"],
  ["world-trading", "CONTAINS", "g-trading"],
  ["world-creator", "CONTAINS", "p-youtube"],
  ["world-creator", "CONTAINS", "wiki-creator"],
  ["world-creator", "CONTAINS", "suite-content"],
  ["world-creator", "CONTAINS", "s-content"],
  ["world-creator", "CONTAINS", "g-channel"],
  ["world-builder", "CONTAINS", "p-jarvis"],
  ["world-builder", "CONTAINS", "wiki-ai"],
  ["world-builder", "CONTAINS", "suite-dev"],
  ["world-builder", "CONTAINS", "g-ai-os"],
  ["world-builder", "CONTAINS", "c-agents"],
  ["world-business", "CONTAINS", "p-ai-tools-course"],
  ["world-business", "CONTAINS", "s-business"],
  ["world-business", "CONTAINS", "g-business"],
  ["world-business", "CONTAINS", "c-personal-brand"],

  // Trading knowledge
  ["wiki-trading", "CONTAINS", "c-ict"],
  ["wiki-trading", "CONTAINS", "c-msnr"],
  ["wiki-trading", "CONTAINS", "c-risk"],
  ["wiki-trading", "CONTAINS", "c-psychology"],
  ["wiki-trading", "CONTAINS", "c-market-structure"],
  ["c-order-blocks", "PART_OF", "c-ict"],
  ["c-fvg", "PART_OF", "c-ict"],
  ["c-liquidity", "PART_OF", "c-ict"],
  ["c-kill-zones", "PART_OF", "c-ict"],
  ["c-market-structure", "RELATED_TO", "c-ict"],
  ["c-market-structure", "RELATED_TO", "c-msnr"],
  ["c-qm", "PART_OF", "c-msnr"],
  ["c-liquidity", "RELATED_TO", "c-qm", 0.4],
  ["c-ict", "CREATED_BY", "ict-huddleston"],
  ["v-ict-mentorship", "TEACHES", "c-ict"],
  ["v-ict-mentorship", "CREATED_BY", "ict-huddleston"],
  ["c-ict", "LEARNT_FROM", "v-ict-mentorship"],
  ["f-ict-pdf", "MENTIONS", "c-ict"],
  ["f-ict-pdf", "MENTIONS", "c-order-blocks"],
  ["f-ict-pdf", "MENTIONS", "c-fvg"],
  ["f-msnr-pdf", "MENTIONS", "c-msnr"],
  ["f-msnr-pdf", "MENTIONS", "c-qm"],
  ["n-killzones", "MENTIONS", "c-kill-zones"],
  ["n-killzones", "MENTIONS", "c-fvg"],
  ["n-killzones", "MENTIONS", "c-liquidity"],
  ["n-msnr-checklist", "MENTIONS", "c-msnr"],
  ["n-msnr-checklist", "MENTIONS", "c-risk"],
  ["n-msnr-checklist", "MENTIONS", "c-qm"],
  ["b-zone", "TEACHES", "c-psychology"],
  ["b-zone", "CREATED_BY", "mark-douglas"],
  ["b-zone", "TEACHES", "c-risk", 0.5],
  ["p-trading-journal", "USES", "t-tradingview"],
  ["p-trading-journal", "CONTAINS", "f-trade-log"],
  ["p-trading-journal", "REQUIRES", "s-trading-analysis"],
  ["p-trading-journal", "MENTIONS", "c-ict"],
  ["p-trading-journal", "MENTIONS", "c-msnr"],
  ["s-trading-analysis", "REQUIRES", "c-market-structure"],
  ["s-trading-analysis", "USES", "t-tradingview"],
  ["suite-trading", "CONTAINS", "s-trading-analysis"],
  ["suite-trading", "CONTAINS", "a-trading"],
  ["suite-trading", "CONTAINS", "t-tradingview"],
  ["suite-trading", "CONTAINS", "t-mt5"],
  ["a-trading", "USES", "wiki-trading"],
  ["a-trading", "USES", "t-claude"],
  ["a-trading", "DEPENDS_ON", "m-no-live-trades"],
  ["t-mt5", "RELATED_TO", "m-no-live-trades"],
  ["au-market-brief", "USES", "t-telegram"],
  ["au-market-brief", "USES", "w-forex-factory"],
  ["au-market-brief", "GENERATED_BY", "a-trading"],
  ["au-market-brief", "PART_OF", "p-telegram-bot"],
  ["tk-backtest", "PART_OF", "p-trading-journal"],
  ["tk-backtest", "MENTIONS", "c-qm"],
  ["tk-backtest", "USES", "t-tradingview"],
  ["g-trading", "REQUIRES", "c-risk"],
  ["g-trading", "REQUIRES", "c-psychology"],
  ["m-sessions", "RELATED_TO", "c-kill-zones"],
  ["c-risk", "RELATED_TO", "c-psychology"],

  // Creator world
  ["p-youtube", "USES", "co-youtube"],
  ["p-youtube", "USES", "t-claude", 0.7],
  ["p-youtube", "REQUIRES", "s-content"],
  ["p-youtube", "REQUIRES", "s-video-editing"],
  ["p-youtube", "REQUIRES", "s-scriptwriting"],
  ["p-youtube", "REQUIRES", "s-thumbnails"],
  ["p-youtube", "CONTAINS", "v-jarvis-video"],
  ["p-youtube", "CONTAINS", "v-ai-tools"],
  ["p-youtube", "USES", "w-yt-studio"],
  ["p-youtube", "USES", "t-notion"],
  ["p-shorts", "PART_OF", "p-youtube"],
  ["p-shorts", "USES", "t-capcut"],
  ["p-shorts", "USES", "au-shorts-cutter"],
  ["s-content", "REQUIRES", "c-storytelling"],
  ["s-content", "REQUIRES", "c-retention"],
  ["s-scriptwriting", "REQUIRES", "c-storytelling"],
  ["s-scriptwriting", "USES", "t-claude", 0.6],
  ["s-video-editing", "USES", "t-davinci"],
  ["s-video-editing", "USES", "t-capcut"],
  ["s-thumbnails", "RELATED_TO", "c-seo", 0.4],
  ["wiki-creator", "CONTAINS", "c-retention"],
  ["wiki-creator", "CONTAINS", "c-seo"],
  ["wiki-creator", "CONTAINS", "c-storytelling"],
  ["suite-content", "CONTAINS", "s-content"],
  ["suite-content", "CONTAINS", "s-video-editing"],
  ["suite-content", "CONTAINS", "s-scriptwriting"],
  ["suite-content", "CONTAINS", "a-content"],
  ["a-content", "USES", "t-claude"],
  ["a-content", "USES", "n-video-ideas"],
  ["a-content", "REQUIRES", "c-seo"],
  ["au-upload", "PART_OF", "p-youtube"],
  ["au-upload", "USES", "co-youtube"],
  ["au-shorts-cutter", "USES", "t-claude", 0.5],
  ["n-video-ideas", "PART_OF", "p-youtube"],
  ["n-channel-strategy", "PART_OF", "p-youtube"],
  ["n-channel-strategy", "MENTIONS", "c-personal-brand"],
  ["n-channel-strategy", "MENTIONS", "c-psychology", 0.3],
  ["f-scripts", "PART_OF", "p-youtube"],
  ["f-scripts", "MENTIONS", "c-storytelling"],
  ["v-jarvis-video", "MENTIONS", "p-jarvis"],
  ["v-ai-tools", "MENTIONS", "t-claude"],
  ["tk-edit-video", "PART_OF", "v-jarvis-video"],
  ["tk-edit-video", "USES", "t-davinci"],
  ["g-channel", "DEPENDS_ON", "p-youtube"],
  ["g-channel", "REQUIRES", "c-retention"],
  ["w-yt-studio", "RELATED_TO", "c-retention"],

  // Builder world
  ["p-jarvis", "USES", "t-claude", 1],
  ["p-jarvis", "USES", "t-nextjs"],
  ["p-jarvis", "USES", "t-sigma"],
  ["p-jarvis", "USES", "t-elevenlabs", 0.5],
  ["p-jarvis", "USES", "c-knowledge-graph"],
  ["p-jarvis", "USES", "c-rag"],
  ["p-jarvis", "USES", "c-mcp", 0.5],
  ["p-jarvis", "USES", "c-agents"],
  ["p-jarvis", "REQUIRES", "s-programming"],
  ["p-jarvis", "CREATED_BY", "t-claude-code"],
  ["p-jarvis", "CONTAINS", "n-jarvis-arch"],
  ["p-jarvis", "CONTAINS", "f-jarvis-spec"],
  ["p-jarvis", "CONTAINS", "m-sigma"],
  ["tk-jarvis-p1", "PART_OF", "p-jarvis"],
  ["g-ai-os", "DEPENDS_ON", "p-jarvis"],
  ["t-claude", "CREATED_BY", "co-anthropic"],
  ["t-claude-code", "CREATED_BY", "co-anthropic"],
  ["t-claude-code", "USES", "t-claude"],
  ["w-anthropic-docs", "TEACHES", "t-claude"],
  ["w-anthropic-docs", "PART_OF", "co-anthropic"],
  ["w-mcp-spec", "TEACHES", "c-mcp"],
  ["c-mcp", "CREATED_BY", "co-anthropic", 0.5],
  ["wiki-ai", "CONTAINS", "c-prompting"],
  ["wiki-ai", "CONTAINS", "c-agents"],
  ["wiki-ai", "CONTAINS", "c-mcp"],
  ["wiki-ai", "CONTAINS", "c-rag"],
  ["wiki-ai", "MENTIONS", "t-claude"],
  ["c-prompting", "RELATED_TO", "t-claude"],
  ["c-agents", "USES", "c-mcp", 0.5],
  ["c-rag", "RELATED_TO", "c-knowledge-graph"],
  ["c-knowledge-graph", "RELATED_TO", "c-second-brain"],
  ["suite-dev", "CONTAINS", "t-claude-code"],
  ["suite-dev", "CONTAINS", "t-vscode"],
  ["suite-dev", "CONTAINS", "t-nextjs"],
  ["suite-dev", "CONTAINS", "s-programming"],
  ["s-programming", "USES", "t-vscode"],
  ["s-programming", "USES", "t-claude-code"],
  ["s-automation", "USES", "t-n8n"],
  ["s-automation", "RELATED_TO", "c-agents"],
  ["a-research", "USES", "t-claude"],
  ["a-research", "USES", "w-anthropic-docs", 0.3],
  ["a-file", "USES", "t-claude"],
  ["a-file", "USES", "c-rag"],
  ["a-automation", "USES", "t-n8n"],
  ["a-automation", "REQUIRES", "s-automation"],
  ["a-calendar", "USES", "t-notion"],
  ["a-email", "DEPENDS_ON", "action-router"],
  ["jarvis-core", "CONNECTED_TO", "a-research"],
  ["jarvis-core", "CONNECTED_TO", "a-content"],
  ["jarvis-core", "CONNECTED_TO", "a-file"],
  ["jarvis-core", "CONNECTED_TO", "a-trading"],
  ["jarvis-core", "CONNECTED_TO", "a-automation"],
  ["jarvis-core", "CONNECTED_TO", "a-calendar"],
  ["jarvis-core", "CONNECTED_TO", "a-email"],
  ["m-sigma", "MENTIONS", "t-sigma"],
  ["n-jarvis-arch", "MENTIONS", "c-knowledge-graph"],
  ["n-jarvis-arch", "MENTIONS", "t-claude"],
  ["f-jarvis-spec", "MENTIONS", "c-agents"],
  ["f-jarvis-spec", "MENTIONS", "t-elevenlabs"],
  ["p-telegram-bot", "USES", "t-telegram"],
  ["p-telegram-bot", "USES", "t-n8n"],
  ["p-telegram-bot", "REQUIRES", "s-automation"],
  ["au-telegram-alerts", "PART_OF", "p-telegram-bot"],
  ["au-telegram-alerts", "USES", "t-telegram"],
  ["tk-telegram", "PART_OF", "p-telegram-bot"],
  ["au-weekly-review", "GENERATED_BY", "jarvis-core"],
  ["n-weekly-review", "GENERATED_BY", "au-weekly-review"],
  ["n-weekly-review", "MENTIONS", "p-jarvis"],
  ["n-weekly-review", "MENTIONS", "tk-backtest"],
  ["n-weekly-review", "MENTIONS", "v-jarvis-video"],
  ["tk-weekly", "RELATED_TO", "au-weekly-review"],
  ["b-second-brain", "TEACHES", "c-second-brain"],
  ["b-second-brain", "CREATED_BY", "tiago-forte"],
  ["t-obsidian", "RELATED_TO", "c-second-brain"],
  ["n-killzones", "CREATED_BY", "t-obsidian", 0.3],
  ["n-msnr-checklist", "CREATED_BY", "t-obsidian", 0.3],
  ["m-concise", "RELATED_TO", "jarvis-core", 0.4],

  // Business
  ["p-ai-tools-course", "USES", "t-claude"],
  ["p-ai-tools-course", "REQUIRES", "s-business"],
  ["p-ai-tools-course", "RELATED_TO", "v-ai-tools"],
  ["p-ai-tools-course", "USES", "c-offers"],
  ["b-offers", "TEACHES", "c-offers"],
  ["b-offers", "CREATED_BY", "alex-hormozi"],
  ["n-business-ideas", "MENTIONS", "p-ai-tools-course"],
  ["n-business-ideas", "PART_OF", "world-business"],
  ["g-business", "DEPENDS_ON", "p-ai-tools-course"],
  ["c-personal-brand", "RELATED_TO", "p-youtube"],
  ["p-personal-site", "USES", "t-nextjs"],
  ["p-personal-site", "CONTAINS", "f-brand"],
  ["f-brand", "MENTIONS", "c-personal-brand"],
  ["s-business", "REQUIRES", "c-offers"],
];

const UPDATED: Record<string, number> = {
  "p-jarvis": 0, "tk-jarvis-p1": 0, "n-jarvis-arch": 0, "m-sigma": 0, "f-jarvis-spec": 1,
  "p-youtube": 1, "v-jarvis-video": 1, "tk-edit-video": 1, "n-video-ideas": 2,
  "p-trading-journal": 1, "f-trade-log": 1, "tk-backtest": 3, "n-killzones": 4,
  "n-weekly-review": 6, "tk-weekly": 6, "au-weekly-review": 6,
};

function hashDays(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 3 + (h % 60);
}

export function buildDemoGraph(): KGData {
  const nodes: KGNode[] = NODES.map(([id, label, category, importance, description, tags, extra]) => ({
    id,
    label,
    category,
    importance,
    description,
    tags,
    source: extra?.source ?? "demo dataset",
    updatedAt: daysAgo(UPDATED[id] ?? hashDays(id), 9 + (id.length % 10)),
    ...extra,
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: KGEdge[] = [];
  for (const [source, relation, target, weight] of EDGES) {
    if (!ids.has(source) || !ids.has(target)) {
      throw new Error(`Demo graph edge references unknown node: ${source} -> ${target}`);
    }
    const id = `${source}|${relation}|${target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, source, target, relation, weight: weight ?? 0.6 });
  }
  return { nodes, edges };
}

/**
 * Synthetic nodes for performance testing (`/graph?stress=2000`). Attached to
 * real hubs so the layout stays meaningful.
 */
export function addStressNodes(data: KGData, count: number): KGData {
  const cats: NodeCategory[] = ["note", "file", "concept", "memory", "task", "web", "video"];
  const anchors = data.nodes.filter((n) => n.importance >= 0.5).map((n) => n.id);
  const nodes = [...data.nodes];
  const edges = [...data.edges];
  for (let i = 0; i < count; i++) {
    const cat = cats[i % cats.length];
    const id = `stress-${i}`;
    nodes.push({
      id,
      label: `${cat} #${i}`,
      category: cat,
      importance: 0.1 + ((i * 7919) % 30) / 100,
      description: "Synthetic node for performance testing.",
      tags: ["stress"],
      source: "stress test",
      updatedAt: daysAgo(i % 90),
    });
    const a = anchors[(i * 31) % anchors.length];
    edges.push({ id: `${id}|RELATED_TO|${a}`, source: id, target: a, relation: "RELATED_TO", weight: 0.3 });
    if (i > 10 && i % 3 === 0) {
      const b = `stress-${Math.floor(((i * 0.618034) % 1) * i)}`;
      edges.push({ id: `${id}|MENTIONS|${b}`, source: id, target: b, relation: "MENTIONS", weight: 0.2 });
    }
  }
  return { nodes, edges };
}
