/**
 * İstatistiklerin AsyncStorage bağlantısı. Saf mantık src/stats.ts'te —
 * bu dosya yalnızca yükle/artır/kaydet yapar.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getActiveLanguageId } from "./languages";
import { bump, dateKey, prune, StatEvent, StatsMap, StatsSummary, summarize } from "./stats";

/** storage.ts'teki langKey ile aynı kural: Arapça eksiz (ilk dil), diğerleri ekli. */
function statsKey(): string {
  const lang = getActiveLanguageId();
  return lang === "ar" ? "stats.v1" : `stats.v1.${lang}`;
}

export async function loadStats(): Promise<StatsMap> {
  try {
    const raw = await AsyncStorage.getItem(statsKey());
    return raw ? (JSON.parse(raw) as StatsMap) : {};
  } catch {
    return {};
  }
}

/**
 * Olay kaydet. İstatistik hiçbir akışın kritik yolunda değildir: hata
 * yutulur — sayaç kaybolabilir ama ders/tekrar asla istatistik yüzünden
 * kırılmaz.
 */
export async function recordStat(event: StatEvent, n = 1): Promise<void> {
  try {
    const now = new Date();
    const map = await loadStats();
    const next = prune(bump(map, dateKey(now), event, n), now);
    await AsyncStorage.setItem(statsKey(), JSON.stringify(next));
  } catch {
    // bilinçli sessiz — yukarıya bkz.
  }
}

export async function loadStatsSummary(): Promise<StatsSummary> {
  return summarize(await loadStats(), new Date());
}
