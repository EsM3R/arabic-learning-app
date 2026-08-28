import {
  clampDifficulty,
  initDifficulty,
  initStability,
  MAX_STABILITY,
  MIN_STABILITY,
  nextDifficulty,
  nextIntervalDays,
  retrievability,
  stabilityAfterLapse,
  stabilityAfterRecall,
  stabilityShortTerm,
} from "./fsrs.ts";
import type { FsrsRating } from "./fsrs.ts";
import type { ReviewGrade, Track, VocabCard } from "./types";

/**
 * Aralıklı tekrar — FSRS-5 (eski basitleştirilmiş SM-2'nin yerine; formüller src/fsrs.ts).
 * Not eşlemesi: 0=bilemedim→Again, 1=zor→Hard, 2=bildim→Good, 3=çok kolay→Easy.
 * Eski SM-2 kartları okunurken anlık tahminle (cardMemory), ilk puanlamada kalıcı
 * olarak FSRS'e göçer; eski alanlar silinmez, ease/intervalDays ayna olarak yazılır.
 * NOT (node testi): "./fsrs.ts" uzantılı değer importu ve "./types"ın import type
 * olması bilinçli — npm test node --experimental-strip-types ile bu modülü yükler.
 */

const DAY_MS = 86_400_000;
const RELEARN_MINUTES = 10; // bilemedi → aynı oturumda 10 dk sonra tekrar (korunan davranış)
/** Eski "intervalDays >= 14" ezber eşiğinin FSRS karşılığı (0.9 hedefte aralık = stability). */
const MASTERED_STABILITY_DAYS = 14;
/** Orta kartın FSRS zorluğu = D0(Good) ≈ 5.2824. ease↔difficulty köprüsünün çapası
 *  ve struggling eşiği: eski `ease < 2.5` kümesi ⟺ `difficulty > D_MID` (birebir). */
const D_MID = initDifficulty(3);
const EASE_SLOPE = (10 - D_MID) / 1.2; // ease 1.3 (SM-2 tabanı) ↔ D 10 çapası ≈ 3.9313

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** ReviewGrade (0-3) → FSRS notu (1-4). */
function toRating(grade: ReviewGrade): FsrsRating {
  return (grade + 1) as FsrsRating;
}

/** SM-2 ease (1.3–3.0) → FSRS difficulty (1–10). ease 2.5 → D0(Good); ease 1.3 → 10. */
export function difficultyFromEase(ease: number): number {
  const e = Number.isFinite(ease) ? Math.min(3.0, Math.max(1.3, ease)) : 2.5;
  return clampDifficulty(D_MID + EASE_SLOPE * (2.5 - e));
}

/** FSRS difficulty → SM-2 ease aynası (eski APK'ya dönüş güvencesi). */
export function easeFromDifficulty(d: number): number {
  return Math.min(3.0, Math.max(1.3, 2.5 + (D_MID - d) / EASE_SLOPE));
}

/** Üstaz'ın kelimeyi ne kadar zor bulduğu — FSRS difficulty tohumunu belirler. */
export type Difficulty = "kolay" | "orta" | "zor";

/** Tohum: "hoca zor dedi" ≈ "ilk cevap Hard olacakmış gibi başla". orta = saf FSRS. */
function seedDifficulty(seed: Difficulty): number {
  return seed === "zor"
    ? initDifficulty(2)
    : seed === "kolay"
      ? initDifficulty(4)
      : initDifficulty(3);
}

export interface CardMemory {
  /** undefined = kart hiç çalışılmamış (FSRS durumu ilk puanlamada doğar). */
  stability?: number;
  difficulty: number;
}

/**
 * Kartın FSRS bellek durumunu okur. FSRS alanları yazılmışsa doğrudan onlar;
 * eski SM-2 kartında SM-2 alanlarından ANLIK tahmin üretir (kartı DEĞİŞTİRMEZ —
 * kalıcı göç ilk gradeCard'da olur). Göç dayanağı: 0.9 retention'da FSRS aralığı
 * stability'ye eşittir → S ≈ intervalDays; D, ease'in D0(Good)-çapalı ters haritası.
 */
export function cardMemory(card: VocabCard): CardMemory {
  if (card.difficulty !== undefined) {
    return { stability: card.stability, difficulty: card.difficulty };
  }
  const studied = card.reps > 0 || (card.lapses ?? 0) > 0 || !!card.lastReviewedAt;
  if (studied) {
    const iv = Number.isFinite(card.intervalDays) ? card.intervalDays : 0;
    return {
      // intervalDays<=0 → bilemedi beklemesinde yakalandı: Again ilk stability'si (w0).
      stability:
        iv <= 0 ? initStability(1) : Math.min(MAX_STABILITY, Math.max(MIN_STABILITY, iv)),
      difficulty: difficultyFromEase(card.ease),
    };
  }
  // Hiç çalışılmamış eski kart: ease tam tohum değeridir (2.1/2.5/2.8) → kanonik tohum.
  const seed: Difficulty = card.ease <= 2.2 ? "zor" : card.ease >= 2.7 ? "kolay" : "orta";
  return { difficulty: seedDifficulty(seed) };
}

/** Son tekrar zamanı; lastReviewedAt yoksa due − intervalDays'ten geriye tahmin. */
function lastReviewMs(card: VocabCard, now: Date): number {
  const t = card.lastReviewedAt ? Date.parse(card.lastReviewedAt) : NaN;
  if (Number.isFinite(t)) return t;
  const due = Date.parse(card.due);
  const base = Number.isFinite(due) ? due : now.getTime();
  return base - Math.max(0, card.intervalDays) * DAY_MS;
}

/**
 * FSRS-5 tekrar puanlama. 0 = bilemedim, 1 = zor, 2 = bildim, 3 = çok kolay.
 * Bilemedi → intervalDays=0, due=now+10dk; ReviewScreen kartı oturum kuyruğunun
 * sonuna koyar, agent "10 dakika sonra tekrar sorulacak" der (ikisi de değişmeden çalışır).
 */
export function gradeCard(card: VocabCard, grade: ReviewGrade, now = new Date()): VocabCard {
  const rating = toRating(grade);
  const mem = cardMemory(card);
  const elapsedDays = Math.max(0, (now.getTime() - lastReviewMs(card, now)) / DAY_MS);

  let stability: number;
  let difficulty: number;

  if (mem.stability === undefined) {
    // İLK TEKRAR: S0/D0 + hocanın tohum OFSETİ (orta tohum saf FSRS'i hiç bozmaz).
    const seedOffset = mem.difficulty - D_MID;
    stability = initStability(rating);
    difficulty = clampDifficulty(initDifficulty(rating) + seedOffset);
  } else if (card.intervalDays <= 0 && elapsedDays < 1) {
    // YENİDEN ÖĞRENME (bilemedi → 10 dk döngüsü): FSRS-5 kısa-dönem formülü.
    // Yalnız bu durumda: review kartının aynı-gün tekrar puanlanması aşağıdaki
    // normal dala düşer ve R≈1 olduğundan doğal no-op olur (takvim şişmez).
    stability = stabilityShortTerm(mem.stability, rating);
    difficulty = nextDifficulty(mem.difficulty, rating);
  } else {
    // NORMAL TEKRAR: R eski S'ten; yeni S ve D eski değerlerden (resmi sıra).
    const r = retrievability(elapsedDays, mem.stability);
    difficulty = nextDifficulty(mem.difficulty, rating);
    stability =
      rating === 1
        ? stabilityAfterLapse(mem.difficulty, mem.stability, r)
        : stabilityAfterRecall(mem.difficulty, mem.stability, r, rating);
  }

  // Takvim + miras alanlar. reps artık lapse'ta SIFIRLANMAZ: FSRS'te reps
  // "başarılı tekrar sayısı"dır; unutulan kart "hiç çalışılmamış" sayılmaz.
  let { reps } = card;
  let lapses = card.lapses ?? 0;
  let intervalDays: number;
  const due = new Date(now.getTime());

  if (grade === 0) {
    lapses += 1;
    intervalDays = 0; // yeniden öğrenme adımı — günlük takvimde değil
    due.setMinutes(due.getMinutes() + RELEARN_MINUTES);
  } else {
    reps += 1;
    intervalDays = nextIntervalDays(stability);
    due.setDate(due.getDate() + intervalDays);
  }

  return {
    ...card,
    intervalDays,
    ease: easeFromDifficulty(difficulty), // ayna alan: eski APK'ya dönüş güvencesi
    reps,
    lapses,
    stability: round4(stability),
    difficulty: round4(difficulty),
    lastReviewedAt: now.toISOString(),
    due: due.toISOString(),
  };
}

export function newCard(
  arabic: string,
  transliteration: string,
  turkish: string,
  track: Track,
  note?: string,
  difficulty: Difficulty = "orta",
  now = new Date()
): VocabCard {
  // Zor bulunan kelime daha yüksek FSRS difficulty tohumla başlar → aralıklar yavaş büyür.
  const seeded = seedDifficulty(difficulty);
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
    ease: easeFromDifficulty(seeded), // ayna: zor≈2.19, orta=2.5, kolay=3.0
    reps: 0,
    lapses: 0,
    difficulty: round4(seeded), // stability YOK: kart hiç çalışılmadı
  };
}

export function dueCards(cards: VocabCard[], now = new Date()): VocabCard[] {
  // Bozuk/parse edilemeyen due → hemen tekrar (göç güvenliği: kart asla kaybolmaz;
  // eski kod NaN karşılaştırmasıyla böyle kartları sonsuza dek gizliyordu).
  const ts = (c: VocabCard) => {
    const t = Date.parse(c.due);
    return Number.isFinite(t) ? t : 0;
  };
  return cards.filter((c) => ts(c) <= now.getTime()).sort((a, b) => ts(a) - ts(b));
}

/** Öğrencinin en çok zorlandığı kartlar (unutulan / FSRS zorluğu ortalamanın üstünde). */
export function strugglingCards(cards: VocabCard[], limit = 10): VocabCard[] {
  return cards
    .filter((c) => (c.lapses ?? 0) > 0 || cardMemory(c).difficulty > D_MID)
    .sort((a, b) => {
      const byLapses = (b.lapses ?? 0) - (a.lapses ?? 0);
      return byLapses !== 0 ? byLapses : cardMemory(b).difficulty - cardMemory(a).difficulty;
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
    // "Hiç çalışılmamış": ne başarı ne unutma görmüş (eski reps===0 tanımı, unutulan
    // kartı da hiç çalışılmamış sayıyordu — düzeltildi).
    neverReviewed: cards.filter((c) => c.reps === 0 && (c.lapses ?? 0) === 0).length,
    struggling: strugglingCards(cards, Number.MAX_SAFE_INTEGER).length,
    // "Ezberlenmiş": ≥3 başarılı tekrar, hafıza gücü ≥14 gün (eski intervalDays≥14'ün
    // 0.9-retention karşılığı) ve şu an bilemedi beklemesinde değil.
    mastered: cards.filter((c) => {
      const mem = cardMemory(c);
      return (
        c.reps >= 3 && c.intervalDays > 0 && (mem.stability ?? 0) >= MASTERED_STABILITY_DAYS
      );
    }).length,
  };
}
