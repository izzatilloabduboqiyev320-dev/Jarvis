/**
 * Wake word and cancel phrase detection on recognised text. Pure functions,
 * so they are easy to test and reuse with any speech-to-text provider.
 */

// "Jarvis" as speech recognisers write it in English, Uzbek and Russian. Whole words only,
// so "Travis", "jarvisga" or "service" never wake JARVIS.
const WAKE = /(^|[^\p{L}\p{N}'])(jarvis|jarviss|jarvys|jervis|jarves|jarviz|djarvis|dzharvis|jarwis|джарвис|жарвис|джервис|джарвиз)(?=$|[^\p{L}\p{N}'])/iu;

export interface WakeMatch {
  /** The wake word was heard. */
  heard: boolean;
  /** What was said after it in the same breath ("Jarvis, show ICT" → "show ICT"). */
  command: string;
}

export function detectWake(text: string): WakeMatch {
  const t = text.normalize("NFC");
  const m = WAKE.exec(t);
  if (!m) return { heard: false, command: "" };
  const after = t.slice(m.index + m[0].length);
  return { heard: true, command: after.replace(/^[\s,.:;!?-]+/u, "").trim() };
}

/** Removes a leading "Jarvis," (or "hey Jarvis") from a command. */
export function stripWake(text: string): string {
  const t = text.trim();
  const w = detectWake(t);
  if (!w.heard) return t;
  const before = t.slice(0, t.length - w.command.length).replace(WAKE, "").replace(/[\s,.:;!?-]+/gu, " ").trim().toLowerCase();
  return before === "" || /^(hey|hi|ok|okay|эй|hoy|salom)$/.test(before) ? w.command : t;
}

const CANCEL =
  /^(cancel|stop|never ?mind|forget it|nothing|bekor qil(ing)?|bekor|to'?xta(ng)?|kerak emas|hech narsa|qo'?y|отмена|отмени|стоп|хватит|не надо|ничего)[\s.!]*$/iu;

/** "Cancel", "Jarvis, stop", "never mind", "bekor qil", "отмена"… */
export function isCancel(text: string): boolean {
  const t = stripWake(text)
    .toLowerCase()
    .replace(/[’‘ʻʼ`]/g, "'")
    .trim();
  return CANCEL.test(t);
}
