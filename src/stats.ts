/**
 * Üretim odaklı ilerleme istatistiği — saf çekirdek (React/RN importu YOK,
 * node ile test edilir; bkz. tests/stats.test.ts).
 *
 * Ölçtüğümüz şey "kaç gün üst üste girdin" değil, "bu hafta ne ürettin":
 * oyunlaştırma bağlılığı büyütür ama yeterliliği büyütmez; üretim hacmi
 * ise doğrudan öğrenmenin kendisidir. Panel bu sayaçları gösterir.
 */

/** Sayılan olaylar. Yeni olay eklemek için sadece buraya ekle. */
export type StatEvent =
  | "produced" // öğrencinin hedef dilde ürettiği cümle/cevap (yazılı veya sözlü)
  | "reviewed" // tekrar edilen kelime kartı
  | "readSentence" // okunan+dinlenen cümle
  | "readingFinished" // baştan sona bitirilen okuma metni
  | "shadowed" // shadowing ile tamamlanan cümle
  | "discrimination" // telaffuz ayırt etme cevabı
  | "discriminationCorrect" // doğru cevaplanan ayırt etme (oran = correct/discrimination)
  | "spoken" // mikrofonla yapılan konuşma denemesi (hedef dilde)
  | "spokenCorrect" // ses tanımanın hedefi doğru duyduğu deneme (oran = correct/spoken)
  | "fluencyRound" // tamamlanan 4/3/2 akıcılık turu
  | "repairUsed" // öğrencinin yaptığı anlam onarımı ("anlamadım", "tekrar eder misin")
  | "conversationTurn" // Konuşma Odası'nda öğrencinin sesle aldığı sıra
  | "sentenceBuilt" // Cümle Kurma'da baştan sona kurulan cümle
  | "mistakeClosed"; // hocanın kapattığı hata

export type DayCounts = Partial<Record<StatEvent, number>>;

/** "YYYY-MM-DD" (cihaz yerel günü) → o günün sayaçları. */
export type StatsMap = Record<string, DayCounts>;

/** Cihazın yerel gününü anahtar yapar — öğrenci gece 23:59'da çalıştıysa o günün emeğidir. */
export function dateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function bump(map: StatsMap, key: string, event: StatEvent, n = 1): StatsMap {
  const day = { ...(map[key] ?? {}) };
  day[event] = (day[event] ?? 0) + n;
  return { ...map, [key]: day };
}

/** Eski günleri düşür — depo sınırsız büyümesin (varsayılan ~6 ay). */
export function prune(map: StatsMap, now: Date, keepDays = 180): StatsMap {
  const cutoff = new Date(now.getTime());
  cutoff.setDate(cutoff.getDate() - keepDays);
  const min = dateKey(cutoff);
  const out: StatsMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (k >= min) out[k] = v; // ISO tarih alfabetik = kronolojik
  }
  return out;
}

export interface StatsSummary {
  today: DayCounts;
  /** Bugün dahil son 7 günün toplamları. */
  week: DayCounts;
  /** Kayıtlı tüm günlerin toplamları. */
  total: DayCounts;
  /** Son 7 / 30 günde en az bir olay kaydedilen gün sayısı. */
  activeDays7: number;
  activeDays30: number;
}

function addInto(target: DayCounts, day: DayCounts): void {
  for (const [ev, n] of Object.entries(day)) {
    const key = ev as StatEvent;
    target[key] = (target[key] ?? 0) + (n ?? 0);
  }
}

function lastNDays(now: Date, n: number): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getTime());
    d.setDate(d.getDate() - i);
    keys.add(dateKey(d));
  }
  return keys;
}

export function summarize(map: StatsMap, now: Date): StatsSummary {
  const week = lastNDays(now, 7);
  const month = lastNDays(now, 30);
  const out: StatsSummary = {
    today: { ...(map[dateKey(now)] ?? {}) },
    week: {},
    total: {},
    activeDays7: 0,
    activeDays30: 0,
  };
  for (const [k, day] of Object.entries(map)) {
    const hasActivity = Object.values(day).some((n) => (n ?? 0) > 0);
    addInto(out.total, day);
    if (week.has(k)) {
      addInto(out.week, day);
      if (hasActivity) out.activeDays7 += 1;
    }
    if (month.has(k) && hasActivity) out.activeDays30 += 1;
  }
  return out;
}

/** Haftalık şerit için tek gün. */
export interface WeekDay {
  key: string;
  /** "Pt", "Sa"… */
  label: string;
  /** Ayın günü. */
  day: number;
  active: boolean;
  isToday: boolean;
  future: boolean;
  /** O gün sesle yapılan iş (mikrofon + Konuşma Odası + gölgeleme). */
  voice: number;
}

const TR_DAYS = ["Pz", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct"];

/** Sesli iş: konuşma hedefine doğrudan hizmet eden olaylar. */
export function voiceCount(day: DayCounts | undefined): number {
  if (!day) return 0;
  return (day.spoken ?? 0) + (day.conversationTurn ?? 0) + (day.shadowed ?? 0);
}

/**
 * Bu haftanın 7 günü (Pazartesi başlar). Ana ekrandaki şerit ve sesli iş
 * grafiği bundan çizilir. Seri SAYACI bilinçli olarak yok (bkz. dosya başı):
 * şerit hangi günler çalıştığını gösterir, "zinciri kırma" baskısı kurmaz.
 */
export function weekDays(map: StatsMap, now: Date): WeekDay[] {
  const todayKey = dateKey(now);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (monday.getDay() + 6) % 7; // Pazartesi = 0
  monday.setDate(monday.getDate() - dow);
  const out: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = dateKey(d);
    const day = map[key];
    out.push({
      key,
      label: TR_DAYS[d.getDay()],
      day: d.getDate(),
      active: !!day && Object.values(day).some((n) => (n ?? 0) > 0),
      isToday: key === todayKey,
      future: key > todayKey,
      voice: voiceCount(day),
    });
  }
  return out;
}
