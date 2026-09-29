/**
 * DERS SONU ÖZETİ — saf çekirdek (node ile test edilir).
 *
 * Ders "tamamla" düğmesiyle bir onay kutusunda bitiyordu; öğrenci o derste
 * ne yaptığını hiç görmüyordu. Burada dersin ölçülebilir izleri toplanır:
 * kaç kez sesle konuştun, kaç cevabı hedef dilde verdin, deftere ne girdi,
 * hoca neyi düzeltti. Uydurma sayı yok — hepsi kayıtlı veriden.
 */
import type { ScriptId } from "./scripts.ts";
import { containsTargetScript } from "./scripts.ts";
import { isSpoken, stripSpokenMark } from "./speechinput.ts";
import type { ChatMessage, MistakeEntry, VocabCard } from "./types.ts";

export interface LessonSummaryData {
  /** Öğrencinin (uygulama olayları hariç) aldığı sıra. */
  studentTurns: number;
  /** Mikrofonla söylenen sıra. */
  spokenTurns: number;
  /** Hedef dilde verilen sıra (Latin dillerde ölçülemez → null). */
  targetTurns: number | null;
  /** Bu oturumda deftere giren kelimeler. */
  newWords: { target: string; tr: string }[];
  /** Bu oturumda kaydedilen düzeltmeler (en fazla 3). */
  corrections: { mistake: string; correction: string; explanation: string }[];
}

const EVENT_PREFIX = "[Uygulama";

export function summarizeLesson(
  messages: ChatMessage[],
  script: ScriptId,
  since: string,
  vocab: VocabCard[],
  mistakes: MistakeEntry[]
): LessonSummaryData {
  const student = messages.filter((m) => m.role === "user" && !m.content.trimStart().startsWith(EVENT_PREFIX));
  const spokenTurns = student.filter((m) => isSpoken(m.content)).length;
  const targetTurns =
    script === "latin" ? null : student.filter((m) => containsTargetScript(stripSpokenMark(m.content), script)).length;
  const newWords = vocab
    .filter((v) => v.addedAt >= since)
    .map((v) => ({ target: v.arabic, tr: v.turkish }));
  const corrections = mistakes
    .filter((m) => m.createdAt >= since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .map((m) => ({ mistake: m.mistake, correction: m.correction, explanation: m.explanation }));
  return { studentTurns: student.length, spokenTurns, targetTurns, newWords, corrections };
}
