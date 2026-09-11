/**
 * Akıcılık alıştırması (4/3/2) — SAF mantık (React/RN importu YOK;
 * tests/fluency.test.ts).
 *
 * NEDEN VAR: Uygulamada telaffuz (doğruluk) ve gölgeleme (taklit) vardı ama
 * AKICILIK antrenmanı yoktu. "Cümle kurabilmek" ile "konuşabilmek" arasındaki
 * farkı kapatan şey tam olarak budur: aynı içeriği azalan sürede anlatmak.
 *
 * 4/3/2 (Maurice 1983; Nation'ın akıcılık geliştirme çerçevesi): öğrenci aynı
 * konuyu üç kez anlatır — önce 4, sonra 3, sonra 2 dakikada. İÇERİK AYNI
 * kaldığı için ikinci ve üçüncü turda beyin "ne söyleyeceğim"le değil "nasıl
 * söyleyeceğim"le uğraşır; süre baskısı da duraksamaları eritir. Ölçülen
 * sonuç: konuşma hızı artar, doğruluk düşmez.
 *
 * Bizim eklediğimiz: cihaz ses tanıması turları YAZIYA çevirdiği için hız
 * (kelime/dakika) GERÇEKTEN ölçülebiliyor. Öğrenci kendi ilerlemesini
 * hissetmekle kalmaz, sayıyla görür.
 */
import { normalizeTarget } from "./textnorm.ts";
import type { ScriptId } from "./scripts.ts";

/** Klasik 4/3/2 oranı: 1 · 0.75 · 0.5. Süreler seviyeye göre ölçeklenir. */
export const ROUND_RATIOS = [1, 0.75, 0.5] as const;

/**
 * Birinci turun saniyesi. Klasik teknik 4 dakikadır ama bu, B2 altı bir
 * öğrenci için imkânsızdır: A1'de kimse 4 dakika kesintisiz konuşamaz ve
 * alıştırma akıcılık değil utanç üretir. Süre seviyeyle büyür, oran sabit.
 */
export function baseSeconds(level: string): number {
  if (level === "A0" || level === "A1") return 60;
  if (level === "A2") return 90;
  if (level === "B1") return 120;
  if (level === "B2") return 180;
  return 240; // C1/C2 — klasik 4 dakika
}

/** Bir oturumun tur süreleri (saniye), uzundan kısaya. */
export function roundSeconds(level: string): number[] {
  const base = baseSeconds(level);
  return ROUND_RATIOS.map((r) => Math.round(base * r));
}

/** Hazırlık süresi: ne anlatacağını düşünmek için. İçerik hazır olmalı. */
export const PREP_SECONDS = 60;

export interface FluencyRound {
  /** Tura ayrılan süre (saniye). */
  seconds: number;
  /** Ses tanımanın duyduğu kelime sayısı (YAKLAŞIK). */
  words: number;
  /** Kelime / dakika. */
  wpm: number;
}

export interface FluencySession {
  id: string;
  at: string;
  topic: string;
  level: string;
  rounds: FluencyRound[];
}

/**
 * Metindeki kelime sayısı. Normalizasyondan geçirilir ki noktalama ve
 * hareke/vurgu işareti kelime sanılmasın.
 *
 * DÜRÜSTLÜK NOTU: bu, ses tanımanın DUYDUĞU kelime sayısıdır, öğrencinin
 * söylediği değil. Tanıma kelime yutar. Ama yanılgı üç turda da AYNI yönde
 * olduğu için turlar arası KARŞILAŞTIRMA sağlamdır — bu alıştırmanın ölçtüğü
 * de zaten mutlak hız değil, kendi kendine göre hızlanmadır.
 */
export function wordCount(text: string, script: ScriptId): number {
  // Kesme işareti BAĞLAR, ayırmaz: Fransızca "j'ai" ve İtalyanca "dell'arte"
  // tek kelimedir. Normalizasyon onu boşluğa çevirdiği için (karşılaştırma
  // amacıyla doğru) sayım öncesinde silinir, yoksa bu iki dilde hız sürekli
  // şişik ölçülürdü.
  const joined = (text ?? "").replace(/['’ʼ‘`]/g, "");
  const n = normalizeTarget(joined, script);
  if (!n) return 0;
  return n.split(" ").filter((w) => w.length > 0).length;
}

/** Kelime/dakika. Süre 0 ise 0 — sıfıra bölme uygulamada çökme demekti. */
export function speechRate(words: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.round((words / seconds) * 60);
}

export function makeRound(words: number, seconds: number): FluencyRound {
  return { seconds, words, wpm: speechRate(words, seconds) };
}

export interface FluencyOutcome {
  firstWpm: number;
  lastWpm: number;
  /** Son turun ilk tura göre hız değişimi (0.32 = %32 hızlanma). */
  gain: number;
  /** Ekranda gösterilecek Türkçe değerlendirme. */
  message: string;
  /** Turların hepsinde ses duyuldu mu — duyulmadıysa ölçüm güvenilmez. */
  measured: boolean;
}

/** Hızlanma bu oranın üstündeyse alıştırma işe yaramış sayılır. */
export const GOOD_GAIN = 0.15;

/**
 * Oturum sonucu. Ölçüm yapılamadıysa (tanıma hiç duymadı) UYDURMA:
 * "harika gidiyorsun" demek, öğrenciye yalan söyleyen göstergedir ve
 * bu uygulamanın en kaçındığı şeydir.
 */
export function fluencyOutcome(rounds: FluencyRound[]): FluencyOutcome {
  const done = rounds.filter((r) => r.words > 0);
  if (rounds.length < 2 || done.length < 2) {
    return {
      firstWpm: rounds[0]?.wpm ?? 0,
      lastWpm: rounds[rounds.length - 1]?.wpm ?? 0,
      gain: 0,
      measured: false,
      message:
        "Turların hepsinde ses tanınamadı, bu yüzden hız ölçülemedi. Alıştırmanın kendisi yine de işe yaradı — ama sayıya güvenme.",
    };
  }
  const first = done[0];
  const last = done[done.length - 1];
  const gain = first.wpm > 0 ? last.wpm / first.wpm - 1 : 0;
  const pct = Math.round(Math.abs(gain) * 100);
  let message: string;
  if (gain >= GOOD_GAIN) {
    message = `Aynı şeyi %${pct} daha hızlı anlattın (${first.wpm} → ${last.wpm} kelime/dk). Akıcılık tam olarak böyle gelişir.`;
  } else if (gain > 0) {
    message = `%${pct} hızlandın (${first.wpm} → ${last.wpm} kelime/dk). Küçük ama gerçek bir kazanç; aynı konuyu birkaç gün sonra tekrar anlat.`;
  } else if (gain === 0) {
    message = `Hızın aynı kaldı (${first.wpm} kelime/dk). Son turda kendini biraz zorla — duraksamadan devam etmeye çalış, hata yapmak serbest.`;
  } else {
    message = `Son turda %${pct} yavaşladın (${first.wpm} → ${last.wpm} kelime/dk). Genelde sebebi cümleyi düzeltmeye çalışmaktır; bu alıştırmada doğruluk değil AKIŞ hedef — yanlış söyleyip devam et.`;
  }
  return { firstWpm: first.wpm, lastWpm: last.wpm, gain, measured: true, message };
}

/**
 * Kayıtlı oturumlardan hız eğilimi — hocanın raporuna girer.
 * En yeni oturumun son turu ile, ondan önceki oturumların son turlarının
 * ortalaması karşılaştırılır.
 */
export interface FluencyTrend {
  sessions: number;
  latestWpm: number;
  /** Önceki oturumların ortalama bitiş hızı; ilk oturumsa null. */
  previousAvgWpm: number | null;
}

export function fluencyTrend(sessions: FluencySession[]): FluencyTrend | null {
  const withRounds = sessions.filter((s) => s.rounds.length > 0);
  if (withRounds.length === 0) return null;
  const byNewest = [...withRounds].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const lastOf = (s: FluencySession) => s.rounds[s.rounds.length - 1].wpm;
  const latest = lastOf(byNewest[0]);
  const rest = byNewest.slice(1);
  return {
    sessions: withRounds.length,
    latestWpm: latest,
    previousAvgWpm:
      rest.length > 0 ? Math.round(rest.reduce((t, s) => t + lastOf(s), 0) / rest.length) : null,
  };
}

/** Kütüphane sınırı — oturum kaydı sonsuza kadar büyümesin. */
export const KEEP_SESSIONS = 60;

export function pruneSessions(sessions: FluencySession[]): FluencySession[] {
  return [...sessions]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, KEEP_SESSIONS);
}
