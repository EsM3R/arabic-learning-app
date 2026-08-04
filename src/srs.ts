import { ReviewGrade, Track, VocabCard } from "./types";

/**
 * Basitleştirilmiş SM-2 aralıklı tekrar algoritması.
 * 0 = bilemedim (baştan), 1 = zor, 2 = bildim, 3 = çok kolay
 */
export function gradeCard(card: VocabCard, grade: ReviewGrade, now = new Date()): VocabCard {
  let { intervalDays, ease, reps } = card;

  if (grade === 0) {
    reps = 0;
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

  return { ...card, intervalDays, ease, reps, due: due.toISOString() };
}

export function newCard(
  arabic: string,
  transliteration: string,
  turkish: string,
  track: Track,
  note?: string,
  now = new Date()
): VocabCard {
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
    ease: 2.5,
    reps: 0,
  };
}

export function dueCards(cards: VocabCard[], now = new Date()): VocabCard[] {
  return cards
    .filter((c) => new Date(c.due).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
}
