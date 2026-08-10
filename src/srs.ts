import { ReviewGrade, Track, VocabCard } from "./types";

/**
 * Basitleştirilmiş SM-2 aralıklı tekrar algoritması.
 * 0 = bilemedim (baştan), 1 = zor, 2 = bildim, 3 = çok kolay
 */
export function gradeCard(card: VocabCard, grade: ReviewGrade, now = new Date()): VocabCard {
  let { intervalDays, ease, reps } = card;
  let lapses = card.lapses ?? 0;

  if (grade === 0) {
    reps = 0;
    lapses += 1;
    intervalDays = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (grade === 1) {
      intervalDays = Math.max(1, intervalDays * 1.2);
      ease = Math.max(1.3, ease - 0.15);
    } else if (grade === 2) {
      intervalDays = intervalDays <= 0 ? 1 : intervalDays * ease;
    } else {
      intervalDays = intervalDays <= 0 ? 2 : intervalDays * ease * 1.3;
      ease = Math.min(3.0, ease + 0.15);
    }
  }

  const due = new Date(now.getTime());
  if (intervalDays <= 0) {
    due.setMinutes(due.getMinutes() + 10); // bilemedi → 10 dk sonra tekrar
  } else {
    due.setDate(due.getDate() + Math.round(intervalDays));
  }

  return {
    ...card,
    intervalDays,
    ease,
    reps,
    lapses,
    lastReviewedAt: now.toISOString(),
    due: due.toISOString(),
  };
}

/** Üstaz'ın kelimeyi ne kadar zor bulduğu — ilk aralığı buna göre ayarlarız. */
export type Difficulty = "kolay" | "orta" | "zor";

export function newCard(
  arabic: string,
  transliteration: string,
  turkish: string,
  track: Track,
  note?: string,
  difficulty: Difficulty = "orta",
  now = new Date()
): VocabCard {
  // Zor bulunan kelime daha düşük ease ile başlar → daha sık sorulur.
  const ease = difficulty === "zor" ? 2.1 : difficulty === "kolay" ? 2.8 : 2.5;
  return {
    id: `v${now.getTime()}${Math.floor(Math.random() * 1000)}`,
    arabic,
    transliteration,
    turkish,
    track,
    note,
    addedAt: now.toISOString(),
    due: now.toISOString(), // yeni kart hemen çalışılabilir
    intervalDays: 0,
    ease,
    reps: 0,
    lapses: 0,
  };
}

export function dueCards(cards: VocabCard[], now = new Date()): VocabCard[] {
  return cards
    .filter((c) => new Date(c.due).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
}

/** Öğrencinin en çok zorlandığı kartlar (çok unutulan / ease'i düşen). */
export function strugglingCards(cards: VocabCard[], limit = 10): VocabCard[] {
  return cards
    .filter((c) => (c.lapses ?? 0) > 0 || c.ease < 2.5)
    .sort((a, b) => {
      const byLapses = (b.lapses ?? 0) - (a.lapses ?? 0);
      return byLapses !== 0 ? byLapses : a.ease - b.ease;
    })
    .slice(0, limit);
}

export interface DeckStats {
  total: number;
  due: number;
  neverReviewed: number;
  struggling: number;
  mastered: number;
}

export function deckStats(cards: VocabCard[], now = new Date()): DeckStats {
  return {
    total: cards.length,
    due: dueCards(cards, now).length,
    neverReviewed: cards.filter((c) => c.reps === 0).length,
    struggling: strugglingCards(cards, Number.MAX_SAFE_INTEGER).length,
    mastered: cards.filter((c) => c.reps >= 3 && c.intervalDays >= 14).length,
  };
}
