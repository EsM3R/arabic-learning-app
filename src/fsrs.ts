/**
 * FSRS-5 aralıklı tekrar matematiği — SAF modül (React/Expo/uygulama importu YOK).
 * Ağırlıklar open-spaced-repetition'ın yayınladığı FSRS-5 varsayılanları.
 * tests/fsrs.test.ts ile `npm test` (node --experimental-strip-types) altında koşar.
 *
 * Neden FSRS: 700M gerçek tekrar üzerinde eğitilmiş unutma modeli; aynı
 * hatırlama hedefi için SM-2'den ~%20-30 daha az tekrar gerektirir.
 * Neden FSRS-5 (4.5 değil): kısa-dönem formülü (w17/w18) "bilemedi → 10 dk
 * sonra tekrar" akışımızı gerçekten modelliyor; 4.5'te başarılı 10 dk tekrarı
 * modele sıfır kredi verirdi (R≈1 → büyüme≈0).
 */

/** FSRS notu: 1=Again (bilemedi), 2=Hard (zor), 3=Good (bildi), 4=Easy (çok kolay). */
export type FsrsRating = 1 | 2 | 3 | 4;

/** FSRS-5 varsayılan ağırlık vektörü w0..w18. */
export const FSRS_W: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, // w0..w3: ilk stability (Again/Hard/Good/Easy)
  7.1949, 0.5345, // w4,w5: ilk difficulty
  1.4604, 0.0046, // w6,w7: difficulty adımı + ortalamaya dönüş
  1.54575, 0.1192, 1.01925, // w8..w10: recall stability büyümesi
  1.9395, 0.11, 0.29605, 2.2698, // w11..w14: lapse stability
  0.2315, 2.9898, // w15,w16: Hard cezası / Easy bonusu
  0.51655, 0.6621, // w17,w18: aynı-gün (kısa dönem) formülü
];

export const DECAY = -0.5;
/** R(S,S)=0.9 olacak şekilde: 0.9^(1/DECAY) − 1 = 19/81. */
export const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
export const DESIRED_RETENTION = 0.9;
export const MIN_STABILITY = 0.01;
export const MAX_STABILITY = 36500;
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;
/** Tek kullanıcılı öğrenme uygulaması: 1 yıldan uzun aralık planlanmaz. */
export const MAX_INTERVAL_DAYS = 365;

const w = FSRS_W;
const clampS = (s: number) => Math.min(MAX_STABILITY, Math.max(MIN_STABILITY, s));

export function clampDifficulty(d: number): number {
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, d));
}

/** Hatırlama olasılığı: R(t,S) = (1 + FACTOR·t/S)^DECAY. R(0)=1, R(S)=0.9. */
export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(
    1 + (FACTOR * Math.max(0, elapsedDays)) / Math.max(MIN_STABILITY, stability),
    DECAY
  );
}

/** İstenen retention için ham aralık (gün): I = (S/FACTOR)·(r^{1/DECAY} − 1); r=0.9 → I=S. */
export function intervalForRetention(stability: number, retention = DESIRED_RETENTION): number {
  return (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

/** Takvim aralığı (tam gün, [1, 365]). */
export function nextIntervalDays(stability: number): number {
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(intervalForRetention(stability))));
}

/** İlk stability: S0(G) = w[G−1]. */
export function initStability(rating: FsrsRating): number {
  return clampS(w[rating - 1]);
}

/** İlk difficulty: D0(G) = w4 − e^{w5·(G−1)} + 1. */
export function initDifficulty(rating: FsrsRating): number {
  return clampDifficulty(w[4] - Math.exp(w[5] * (rating - 1)) + 1);
}

/** Difficulty güncellemesi: doğrusal sönümleme + D0(Easy)'ye ortalama dönüşü. */
export function nextDifficulty(d: number, rating: FsrsRating): number {
  const deltaD = -w[6] * (rating - 3);
  const damped = d + (deltaD * (10 - d)) / 9;
  return clampDifficulty(w[7] * initDifficulty(4) + (1 - w[7]) * damped);
}

/** Başarılı hatırlamada (G∈{2,3,4}) yeni stability. r = tekrar anındaki retrievability. */
export function stabilityAfterRecall(
  d: number,
  s: number,
  r: number,
  rating: FsrsRating
): number {
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;
  const growth =
    Math.exp(w[8]) *
    (11 - d) *
    Math.pow(Math.max(MIN_STABILITY, s), -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return clampS(s * (growth + 1));
}

/** Unutmada (Again) yeni stability — eski stability'yi asla aşamaz. */
export function stabilityAfterLapse(d: number, s: number, r: number): number {
  const sf =
    w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return clampS(Math.min(sf, s));
}

/** Kısa dönem (aynı oturumda 10 dk relearning): S' = S·e^{w17·(G−3+w18)}. */
export function stabilityShortTerm(s: number, rating: FsrsRating): number {
  return clampS(s * Math.exp(w[17] * (rating - 3 + w[18])));
}
