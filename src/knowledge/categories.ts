import type { NodeCategory } from "@/types/graph";

export interface CategoryStyle {
  label: string;
  /** Plural label for filters / queries */
  plural: string;
  color: string;
  /** Words in natural-language queries that refer to this category. */
  aliases: string[];
}

/**
 * Design system for node categories. Colors are deliberately desaturated so the
 * graph reads as one calm system; the glow shader adds the "light".
 */
export const CATEGORIES: Record<NodeCategory, CategoryStyle> = {
  person: { label: "Person", plural: "People", color: "#f0a35e", aliases: ["person", "people", "who"] },
  project: { label: "Project", plural: "Projects", color: "#5fd18b", aliases: ["project", "projects"] },
  world: { label: "World", plural: "Worlds", color: "#7fb7c9", aliases: ["world", "worlds", "area", "areas", "domain"] },
  router: { label: "Router", plural: "Router", color: "#e8eef2", aliases: ["router", "routers", "hub"] },
  wiki: { label: "Wiki", plural: "Wiki", color: "#9aa8ff", aliases: ["wiki", "wikis"] },
  suite: { label: "Suite", plural: "Suites", color: "#56b6c2", aliases: ["suite", "suites"] },
  concept: { label: "Concept", plural: "Concepts", color: "#e3c96b", aliases: ["concept", "concepts", "idea", "ideas", "strategy", "strategies"] },
  skill: { label: "Skill", plural: "Skills", color: "#5b9cf0", aliases: ["skill", "skills"] },
  tool: { label: "Tool", plural: "Tools", color: "#e07fb0", aliases: ["tool", "tools", "app", "apps", "software"] },
  agent: { label: "Agent", plural: "Agents", color: "#a98bf0", aliases: ["agent", "agents"] },
  automation: { label: "Automation", plural: "Automations", color: "#ec7a55", aliases: ["automation", "automations", "workflow", "workflows"] },
  note: { label: "Note", plural: "Notes", color: "#4fd1c5", aliases: ["note", "notes"] },
  file: { label: "File", plural: "Files", color: "#7d8fa8", aliases: ["file", "files", "document", "documents", "doc", "docs", "pdf"] },
  book: { label: "Book", plural: "Books", color: "#c8a27a", aliases: ["book", "books"] },
  video: { label: "Video", plural: "Videos", color: "#e86a6a", aliases: ["video", "videos"] },
  web: { label: "Web Source", plural: "Web Sources", color: "#6ec1e4", aliases: ["website", "websites", "web", "site", "sites", "source", "sources", "link", "links"] },
  company: { label: "Company", plural: "Companies", color: "#b7c46a", aliases: ["company", "companies", "platform", "platforms"] },
  task: { label: "Task", plural: "Tasks", color: "#d6d6a8", aliases: ["task", "tasks", "todo", "todos"] },
  goal: { label: "Goal", plural: "Goals", color: "#8fe0b0", aliases: ["goal", "goals"] },
  memory: { label: "Memory", plural: "Memories", color: "#c18fd6", aliases: ["memory", "memories", "decision", "decisions", "preference", "preferences"] },
};

export function categoryColor(category: NodeCategory): string {
  return CATEGORIES[category]?.color ?? "#8899aa";
}
