/**
 * Uzbek support for the local brain.
 *
 * Uzbek questions are rewritten into the English forms the query engine
 * already understands ("ICT bilan bog'liq hamma narsani ko'rsat" →
 * "show everything related to ict"), and answers are produced in Uzbek.
 * Claude (Phase 2) will understand Uzbek natively; this keeps DEMO MODE useful.
 */

export type Lang = "en" | "uz";

/** Normalise the many apostrophe variants speech/keyboards produce (o‘, oʻ, o`). */
export function normalizeApostrophes(s: string): string {
  return s.replace(/[’‘ʻʼ`´]/g, "'");
}

const UZ_MARKERS =
  /(^|\s)(nima|nimalar|qanday|qanaqa|ko'rsat\w*|bilan|haqida|hamma|hammasi\w*|barcha|eslab|yodda|qani|menga|mening|loyiha\w*|qil\w*|bog'l\w*|va|uchun|kecha|bugun|salom|assalomu|top\w*|och\w*|vazifa\w*|eslatma\w*|fayl\w*|xotira\w*|qaror\w*|ustida|ishla\w*|narsa\w*|qidir\w*|izla\w*|internet\w*|kerak|emas|yo'q|ha|yaxshi|rahmat)(?=\s|$)/;

export function detectLang(raw: string): Lang {
  const t = normalizeApostrophes(raw.toLowerCase());
  return UZ_MARKERS.test(t) || /\b\w+'(ga|ni|da|dan|ning)\b/.test(t) || /\w(larni|larga|lardan|dagi|ning)\b/.test(t) ? "uz" : "en";
}

/** Uzbek category words (with common suffixes stripped) → English alias. */
const CATEGORY_UZ: [RegExp, string][] = [
  [/\bloyiha\w*/g, "projects"],
  [/\b(fayl|hujjat)\w*/g, "files"],
  [/\b(eslatma|qayd)\w*/g, "notes"],
  [/\b(vazifa|topshiriq)\w*/g, "tasks"],
  [/\bmaqsad\w*/g, "goals"],
  [/\bko'nikma\w*/g, "skills"],
  [/\b(vosita|dastur|asbob)\w*/g, "tools"],
  [/\bagent\w*/g, "agents"],
  [/\bkitob\w*/g, "books"],
  [/\bvideo(lar|larni|ni|ga)\b/g, "videos"],
  [/\b(odam|inson|shaxs)\w*/g, "people"],
  [/\bxotira\w*/g, "memories"],
  [/\b(tushuncha|konsepsiya|strategiya)\w*/g, "concepts"],
  [/\bavtomat\w*/g, "automations"],
  [/\bkompaniya\w*/g, "companies"],
  [/\b(sayt|veb-sayt)\w*/g, "websites"],
];

const FILLER =
  /\b(hamma|hammasi\w*|barcha|narsa\w*|ko'rsat\w*|top\w*|qidir\w*|bog'liq\w*|bog'langan\w*|bilan|haqida|mening|menga|meni|men|iltimos|qani|bu|shu|u|ular|uchun|ham|bor|bormi|nima|nimalar|qaysi|ber|bering|degan|oid|tegishli|dagi|ichida)\b/g;

function rest(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

/** Rewrite an Uzbek request into the engine's English phrasing. */
function mapCategories(s: string): string {
  for (const [re, en] of CATEGORY_UZ) s = s.replace(re, ` ${en} `);
  return rest(s);
}

export function uzToEn(text: string): string {
  const full = normalizeApostrophes(text.toLowerCase()).replace(/[?!.]+$/g, "").trim();
  // "Jarvis, …" is addressing JARVIS. Without a comma, "Jarvis …" may be the subject
  // of a memory ("JARVIS muhim loyiha ekanini eslab qol"), so keep it there.
  const addressed = /^(hey\s+)?jarvis\s*[,.:!-]/.test(full);
  let t = full.replace(/^\s*(hey\s+)?jarvis[\s,.:!-]*/i, "").trim();
  const memoryEnd = /(eslab\s+qol\w*|yodda\s+tut\w*|xotiraga\s+(yoz|saqla)\w*|(vazifa|topshiriq|eslatma|qayd)\w*\s+(yarat|qo'sh|qo'y|yoz)\w*)$/;
  if (!addressed && memoryEnd.test(full) && !/^(eslab|yodda|xotiraga|vazifa|topshiriq|eslatma|qayd)/.test(t)) t = full;

  if (/^(salom|assalomu|assalom|hey|xayrli)/.test(t)) return "hello";

  // What am I working on (yesterday)?
  if (/(nima|nimalar)\s+(ustida|bilan)\s+ishla|nima\s+qil(yapman|ayapman|ayotgan|dim|gan)|nimalar\s+qildim|hozir\s+nima/.test(t)) {
    return /kecha/.test(t) ? "what was i working on yesterday" : "what am i working on";
  }

  // Create: memory / task / note — command first or last ("… eslab qol").
  const mem = t.match(/^(eslab\s+qol\w*|yodda\s+tut\w*|yodingda\s+tut\w*|xotiraga\s+(yoz|saqla)\w*)(\s+ki)?[\s:,]*(.*)$/);
  if (mem) return `remember that ${rest(mem[4])}`;
  const memEnd = t.match(/^(.*?)[\s,]*(ni\s+)?(eslab\s+qol\w*|yodda\s+tut\w*|xotiraga\s+(yoz|saqla)\w*)$/);
  if (memEnd && memEnd[1]) return `remember that ${rest(memEnd[1].replace(/(ekanini|ekanligini|ligini|ini)$/, ""))}`;
  const task = t.match(/^(yangi\s+)?(vazifa|topshiriq)\w*\s+(yarat|qo'sh|qo'y|yoz)\w*[\s:,]*(.*)$/);
  if (task) return `create task ${rest(task[4])}`;
  const taskEnd = t.match(/^(.*?)[\s,]*(degan\s+)?(vazifa|topshiriq)\w*\s+(yarat|qo'sh|qo'y|yoz)\w*$/);
  if (taskEnd && taskEnd[1]) return `create task ${rest(taskEnd[1])}`;
  const note = t.match(/^(eslatma|qayd)\w*\s+(qo'sh|yoz|yarat)\w*[\s:,]*(.*)$/);
  if (note) return `add note ${rest(note[3])}`;
  const noteEnd = t.match(/^(.*?)[\s,]*(degan\s+)?(eslatma|qayd)\w*\s+(qo'sh|yoz|yarat)\w*$/);
  if (noteEnd && noteEnd[1]) return `add note ${rest(noteEnd[1])}`;

  // How are X and Y connected?
  const path =
    t.match(/^(.+?)\s+(?:va|bilan)\s+(.+?)\s+(?:qanday|qanaqa|qay\s+tarzda|nima\s+orqali)\s+(?:bog'l|aloqa|ulan)\w*/) ??
    t.match(/^(.+?)\s+(?:va|bilan)\s+(.+?)\s+(?:o'rtasidagi|orasidagi)\s+(?:bog'l|aloqa|yo'l)\w*/);
  if (path) return `how is ${mapCategories(path[1])} connected to ${mapCategories(path[2])}`;

  // Open X
  const open = t.match(/^(.+?)(?:'?ni)?\s+och\w*$/) ?? t.match(/^och\w*\s+(.+)$/);
  if (open) return `open ${open[1].replace(/'?ni$/, "")}`;

  // Web search
  if (/internet\w*|veb\w*|google/.test(t) && /qidir|top|izla/.test(t)) return "search the web";

  // Summarise
  if (/xulosa|qisqacha|mazmun/.test(t)) return `summarize ${t.replace(/\b(xulosa|qisqacha|mazmun)\w*|\b(qil|ber|yoz)\w*/g, "")}`;

  // Decisions
  if (/qaror/.test(t)) return `what did we decide about ${rest(t.replace(/\b(qaror\w*|qabul|qildik|qilgan\w*|nima|qanday|biz)\b/g, " "))}`;

  // Topic search: map category words, drop filler words.
  t = mapCategories(t).replace(FILLER, " ");
  return `show everything related to ${rest(t)}`;
}

// ── Answer templates ──────────────────────────────────────────────────

const REL_UZ: Record<string, string> = {
  USES: "'dan foydalanadi",
  CREATED_BY: " tomonidan yaratilgan",
  RELATED_TO: " bilan bog'liq",
  PART_OF: "'ning bir qismi",
  REQUIRES: "'ni talab qiladi",
  LEARNT_FROM: "'dan o'rganilgan",
  WORKS_ON: " ustida ishlaydi",
  DEPENDS_ON: "'ga bog'liq",
  MENTIONS: "'ni eslatadi",
  CONTAINS: "'ni o'z ichiga oladi",
  CONNECTED_TO: "'ga ulangan",
  GENERATED_BY: " tomonidan yaratilgan",
  TEACHES: "'ni o'rgatadi",
  OWNS: "'ga egalik qiladi",
  PURSUES: "'ga intiladi",
};

/** "YouTube Channel USES Claude" → "YouTube Channel Claude'dan foydalanadi" */
export function relationUz(source: string, relation: string, target: string): string {
  return `${source} ${target}${REL_UZ[relation] ?? " bilan bog'liq"}`;
}

export function relativeDayUz(days: number): string {
  if (days <= 0) return "bugun";
  if (days === 1) return "kecha";
  return `${days} kun oldin`;
}

export const CATEGORY_NAMES_UZ: Record<string, string> = {
  person: "odam",
  project: "loyiha",
  world: "soha",
  router: "router",
  wiki: "viki",
  suite: "to'plam",
  concept: "tushuncha",
  skill: "ko'nikma",
  tool: "vosita",
  agent: "agent",
  automation: "avtomatlashtirish",
  note: "eslatma",
  file: "fayl",
  book: "kitob",
  video: "video",
  web: "veb-manba",
  company: "kompaniya",
  task: "vazifa",
  goal: "maqsad",
  memory: "xotira",
};
