/**
 * İstatistiklerin AsyncStorage bağlantısı. Saf mantık src/stats.ts'te —
 * bu dosya yalnızca yükle/artır/kaydet yapar.
 *
 * YAZMALAR SIRAYA ALINIR. Sebebi gerçek bir hata: recordStat oku-değiştir-yaz
 * yapıyor ve ekranlar aynı anda birkaç sayaç birden artırıyor
 * (spoken + spokenCorrect + reviewed + produced tek bir doğru cevapta).
 * Sırasız hâlde hepsi aynı anlık görüntüyü okuyup birbirinin üstüne yazıyordu:
 * DÖRT OLAYDAN ÜÇÜ KAYBOLUYORDU. Ne hata çıkıyordu ne uyarı — yalnız haftalık
 * sayılar, konuşma dengesi ve hocanın raporu sessizce eksik oluyordu. Ölçüme
 * dayanan bir uygulamada bundan daha sinsi bir kusur yok.
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
 * Yazma kuyruğu: her yazma bir öncekinin BİTMESİNİ bekler.
 *
 * Kilit yerine zincir kullanılıyor çünkü tek iş parçacıklı JS'te sıralama
 * yeterli — asıl sorun eşzamanlılık değil, araya giren okuma. Zincir
 * kırılmasın diye her halka kendi hatasını yutar.
 */
let writeQueue: Promise<void> = Promise.resolve();

async function applyEvents(events: [StatEvent, number][]): Promise<void> {
  if (events.length === 0) return;
  const now = new Date();
  const key = dateKey(now);
  let map = await loadStats();
  for (const [event, n] of events) map = bump(map, key, event, n);
  await AsyncStorage.setItem(statsKey(), JSON.stringify(prune(map, now)));
}

/** Kuyruğa bir yazma ekler ve onun tamamlanmasını döndürür. */
function enqueue(events: [StatEvent, number][]): Promise<void> {
  const next = writeQueue.then(() => applyEvents(events)).catch(() => {
    // İstatistik hiçbir akışın kritik yolunda değil: hata yutulur — sayaç
    // kaybolabilir ama ders/tekrar asla istatistik yüzünden kırılmaz.
  });
  writeQueue = next;
  return next;
}

export async function recordStat(event: StatEvent, n = 1): Promise<void> {
  return enqueue([[event, n]]);
}

/**
 * Birden çok olayı TEK yazmada kaydeder.
 *
 * Aynı anda birkaç sayaç artıran yerler (doğru sesli cevap: spoken +
 * spokenCorrect + reviewed + produced) bunu kullanmalı: hem tek disk
 * yazması, hem de kuyruğa tek halka.
 */
export async function recordStats(events: StatEvent[]): Promise<void> {
  return enqueue(events.map((e) => [e, 1] as [StatEvent, number]));
}

export async function loadStatsSummary(): Promise<StatsSummary> {
  return summarize(await loadStats(), new Date());
}

/**
 * Bekleyen yazmaların bitmesini bekler. Testler ve "ekran kapanırken kaydet"
 * akışları için; normal kullanımda gerekmez.
 */
export async function flushStats(): Promise<void> {
  await writeQueue;
}
