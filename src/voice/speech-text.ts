/**
 * Turns a written answer into what JARVIS says aloud: no links, code or
 * markdown, and only the first few sentences (the full answer stays in chat).
 */
export function toSpeech(text: string, maxChars = 420): string {
  let t = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_~>|]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t.length <= maxChars) return t;
  // Cut at the last sentence end that fits.
  const cut = t.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  t = end > maxChars * 0.4 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
  return t;
}

/** Which language a reply is in, to pick a matching voice. */
export function speechLang(text: string): "uz" | "en" | "ru" {
  const cyr = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const lat = (text.match(/[A-Za-z]/g) ?? []).length;
  if (cyr > lat) return "ru";
  if (/(o'|g'|ʻ|\b(va|bilan|uchun|siz|sizning|bu|men|emas|qiling|haqida|bor|yo'q)\b|lar\b|ning\b)/i.test(text)) return "uz";
  return "en";
}
