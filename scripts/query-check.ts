/**
 * Smoke test for the local query engine: `npx tsx scripts/query-check.ts`
 */
import { buildDemoGraph } from "../src/knowledge/demo-graph";
import { createGraph } from "../src/knowledge/graph";
import { runQuery } from "../src/knowledge/query";

const graph = createGraph(buildDemoGraph());
console.log(`graph: ${graph.order} nodes, ${graph.size} edges`);
const queries = [
  "Find everything related to YouTube",
  "Show my trading knowledge",
  "Show all projects connected to Claude",
  "Find files related to ICT",
  "How is Claude connected to my YouTube project?",
  "Jarvis, how are Claude and my YouTube project connected?",
  "How is the JARVIS project connected to concept Fair Value Gap?",
  "Jarvis, what am I working on?",
  "What was I working on yesterday?",
  "Jarvis, show everything related to ICT.",
  "Jarvis, remember that this project is high priority",
  "Jarvis, what did we decide about the graph?",
  "Jarvis, create a task to backtest ICT kill zones",
  "Jarvis, search the web for competitors",
  "that trading book I uploaded",
  "my notes about ICT",
  "what did I say about Claude?",
  "open TradingView",
  "xyzzy",
];
let failed = 0;
for (const q of queries) {
  const r = runQuery(graph, q, { selected: "p-jarvis" });
  if (r.intent !== "needs-ai" && !r.answer) failed++;
  console.log(`\n> ${q}\n  [${r.intent}] ${r.nodes.length} nodes — ${r.answer}`);
}
process.exit(failed ? 1 : 0);
