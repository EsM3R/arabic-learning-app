import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Harcama sayacı.
 *
 * Uygulama bazı çağrıları kullanıcı istemeden yapıyor (panel açılışındaki hoca
 * notu, telaffuz seti üretimi, derste sessizlik dürtmesi). Ne kadar harcandığı
 * görünmezse fatura sürpriz oluyor. Her API yanıtındaki token sayıları burada
 * toplanıp günlük özet olarak saklanıyor.
 *
 * Fiyatlar $/milyon token. Sağlayıcılar fiyat değiştirdiğinde burası
 * güncellenmeli — rakamlar tahmini maliyet içindir, fatura sağlayıcınındır.
 */

const KEY = "usage.v1";
const KEEP_DAYS = 60;

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
  { match: /^deepseek.*pro/, price: { input: 0.66, output: 1.98, cacheRead: 0.004, cacheWrite: 0.66 } },
  { match: /^deepseek.*flash/, price: { input: 0.22, output: 0.66, cacheRead: 0.003, cacheWrite: 0.22 } },
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

export interface DayUsage {
  usd: number;
  calls: number;
  input: number;
  output: number;
}

type Store = Record<string, DayUsage>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function read(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

/**
 * Bir API yanıtının maliyetini kaydeder. Sayaç hiçbir zaman uygulamayı
 * durdurmamalı — hata olursa sessizce vazgeçilir.
 */
export async function recordUsage(e: UsageEvent): Promise<void> {
  try {
    const store = await read();
    const day = today();
    const cur = store[day] ?? { usd: 0, calls: 0, input: 0, output: 0 };
    store[day] = {
      usd: cur.usd + costOf(e),
      calls: cur.calls + 1,
      input: cur.input + e.input,
      output: cur.output + e.output,
    };
    // Eski günleri buda
    const days = Object.keys(store).sort();
    while (days.length > KEEP_DAYS) {
      const oldest = days.shift();
      if (oldest) delete store[oldest];
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // yut
  }
}

export interface UsageSummary {
  todayUsd: number;
  todayCalls: number;
  monthUsd: number;
  monthCalls: number;
}

export async function usageSummary(): Promise<UsageSummary> {
  const store = await read();
  const day = today();
  const month = day.slice(0, 7);
  let monthUsd = 0;
  let monthCalls = 0;
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith(month)) {
      monthUsd += v.usd;
      monthCalls += v.calls;
    }
  }
  const t = store[day];
  return {
    todayUsd: t?.usd ?? 0,
    todayCalls: t?.calls ?? 0,
    monthUsd,
    monthCalls,
  };
}

export function formatTry(usd: number): string {
  const tl = usd * USD_TRY;
  if (tl < 1) return `${tl.toFixed(2)} TL`;
  if (tl < 100) return `${tl.toFixed(1)} TL`;
  return `${Math.round(tl)} TL`;
}
