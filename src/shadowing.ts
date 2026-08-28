/**
 * Shadowing (gölgeleme) kuyruğu ve öz-not sayacı — saf modül (React/RN
 * importu YOK; tests/shadowing.test.ts ile node altında koşar).
 *
 * Shadowing = model konuşurken ÜSTÜNE konuşmak. Araştırma: prosodi, akıcılık
 * ve anlaşılabilirlikte dikte ve tekrar drillerinden üstün; anlamaya değil
 * taklide dayandığı için düşük seviyede bile yapılabilir. Malzeme ANLAŞILMIŞ
 * içerikten gelir: bitirilmiş okuma metinleri öncelikli, sonra diğer okuma
 * metinleri, sonra telaffuz seti kalıpları. Tamamen API'siz.
 *
 * SRS DEĞİLDİR: öz-not yalnızca "tekrar lazım" işaretiyle sıralamayı etkiler.
 */
import { normalizeTarget } from "./textnorm.ts";
import type { PronunciationSet, ReadingText } from "./types";

export interface ShadowItem {
  text: string;
  translit?: string;
  turkish?: string;
  source: "okuma" | "telaffuz";
}

/** 0 = tekrar lazım, 1 = iyi, 2 = süper */
export type ShadowNote = 0 | 1 | 2;

export interface ShadowNoteEntry {
  tries: number;
  lastNote: ShadowNote;
  lastAt: string; // ISO
}

/** Anahtar: normalizeTarget(text, arabicScript). */
export type ShadowNotesMap = Record<string, ShadowNoteEntry>;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Döngü modunda pas başına TTS hızı: yavaş başla, doğal hızda bitir. */
export const PASS_RATES = [0.85, 0.95, 1.0] as const;

/**
 * Kuyruk kurma:
 * 1. Okuma metinleri: önce BİTİRİLMİŞ olanlar (anlaşılmış malzeme), her grup
 *    kendi içinde en yeniden eskiye; cümlelerden yalnız 2-14 kelimelikler
 *    (tek kelime shadowing'e kısa, uzun paragraf çalışma belleğini boğar).
 * 2. Telaffuz seti öğelerinin tamamı (kelime de kalıp da olur).
 * 3. normalizeTarget anahtarıyla tekilleştir (ilk görülen kazanır).
 * 4. Kaynaklar dönüşümlü dizilir (okuma, telaffuz, okuma, ...).
 * 5. Öz-notu "tekrar lazım" (lastNote === 0) olanlar başa alınır (kararlı sıra).
 * 6. İlk `limit` öğe döner.
 */
export function buildShadowQueue(
  texts: ReadingText[],
  pron: PronunciationSet | null,
  notes: ShadowNotesMap,
  arabicScript: boolean,
  limit = 20
): ShadowItem[] {
  const rank = (t: ReadingText) => (t.finishedAt ? 0 : 1);
  const fromReading: ShadowItem[] = [...texts]
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .flatMap((t) =>
      t.sentences
        .filter((s) => {
          const n = wordCount(s.target);
          return n >= 2 && n <= 14;
        })
        .map((s) => ({
          text: s.target,
          translit: s.translit || undefined,
          turkish: s.tr || undefined,
          source: "okuma" as const,
        }))
    );
  const fromPron: ShadowItem[] = (pron?.items ?? []).map((i) => ({
    text: i.arabic,
    translit: i.transliteration,
    turkish: i.turkish,
    source: "telaffuz" as const,
  }));

  const seen = new Set<string>();
  const interleaved: ShadowItem[] = [];
  const max = Math.max(fromReading.length, fromPron.length);
  for (let i = 0; i < max; i++) {
    for (const item of [fromReading[i], fromPron[i]]) {
      if (!item) continue;
      const key = normalizeTarget(item.text, arabicScript);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      interleaved.push(item);
    }
  }
  const needsRepeat = (it: ShadowItem) =>
    notes[normalizeTarget(it.text, arabicScript)]?.lastNote === 0 ? 0 : 1;
  return interleaved
    .map((it, i) => ({ it, i }))
    .sort((a, b) => needsRepeat(a.it) - needsRepeat(b.it) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.it);
}

/** Öz-not kaydet (immutable). 300 girdiyi aşarsa en eski lastAt'lılar düşer. */
export function noteShadow(
  map: ShadowNotesMap,
  key: string,
  note: ShadowNote,
  now = new Date()
): ShadowNotesMap {
  const prev = map[key];
  const next: ShadowNotesMap = {
    ...map,
    [key]: { tries: (prev?.tries ?? 0) + 1, lastNote: note, lastAt: now.toISOString() },
  };
  const entries = Object.entries(next);
  if (entries.length <= 300) return next;
  entries.sort((a, b) => a[1].lastAt.localeCompare(b[1].lastAt));
  return Object.fromEntries(entries.slice(entries.length - 300));
}
