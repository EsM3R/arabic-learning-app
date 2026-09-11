/**
 * Model fiyatlandırması — SAF modül (React/RN importu YOK; tests/pricing.test.ts).
 *
 * usage.ts'ten ayrıldı çünkü o dosya AsyncStorage'a bağlı ve node altında
 * yüklenemiyordu: uygulamanın PARA hesabı yapan tek yeri test edilemiyordu.
 * Yanlış bir fiyat kuralı sessizce yanlış fatura tahmini üretir ve kullanıcı
 * bunu ancak ay sonunda fark eder.
 */
/** Kur sabiti — yalnızca gösterim için, tahmini. */
export const USD_TRY = 48;

interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICES: { match: RegExp; price: Price }[] = [
  { match: /^claude-opus/, price: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
  { match: /^claude-sonnet/, price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } },
  { match: /^claude-haiku/, price: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 } },
  { match: /^claude-fable|^claude-mythos/, price: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 } },
  { match: /^gpt-5\.6-sol/, price: { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 4 } },
  { match: /^gpt-5\.6-terra/, price: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2 } },
  { match: /^gpt-5\.6-luna/, price: { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.2 } },
  { match: /^gemini.*pro/, price: { input: 2, output: 12, cacheRead: 2, cacheWrite: 2 } },
  { match: /^gemini.*flash/, price: { input: 0.75, output: 3.75, cacheRead: 0.75, cacheWrite: 0.75 } },
  // V4.1-Flash (model adı "deepseek-flash"). V4-Pro ve V4-Flash emekliye
  // ayrıldı ve istekleri BU modele, BU fiyatlardan yönleniyor — o yüzden tek
  // kural bütün deepseek adlarını kapsıyor. Yoğun saatte gerçek fatura 2 katı.
  { match: /^deepseek/, price: { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0.15 } },
];

/** Bilinmeyen model: sessizce sıfır saymak yerine orta bir tahmin kullan. */
const FALLBACK: Price = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };

export function priceFor(model: string): Price {
  const m = model.toLowerCase();
  return PRICES.find((p) => p.match.test(m))?.price ?? FALLBACK;
}


export interface UsageEvent {
  model: string;
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export function costOf(e: UsageEvent): number {
  const p = priceFor(e.model);
  return (
    (e.input * p.input +
      e.output * p.output +
      (e.cacheRead ?? 0) * p.cacheRead +
      (e.cacheWrite ?? 0) * p.cacheWrite) /
    1_000_000
  );
}

export function formatTry(usd: number): string {
  const tl = usd * USD_TRY;
  if (tl < 1) return `${tl.toFixed(2)} TL`;
  if (tl < 100) return `${tl.toFixed(1)} TL`;
  return `${Math.round(tl)} TL`;
}
