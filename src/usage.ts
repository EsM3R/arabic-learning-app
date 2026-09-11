import AsyncStorage from "@react-native-async-storage/async-storage";
import { costOf, formatTry, priceFor, USD_TRY } from "./pricing";
import type { UsageEvent } from "./pricing";

// Fiyat mantığı src/pricing.ts'te (saf ve test edilebilir); eski çağıranlar
// bozulmasın diye buradan yeniden dışa aktarılıyor.
export { costOf, formatTry, priceFor, USD_TRY };
export type { UsageEvent };

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

