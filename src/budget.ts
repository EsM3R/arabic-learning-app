/**
 * SERT harcama tavanı.
 *
 * Uygulamada harcamayı yalnız gösteren bir sayaç vardı (src/usage.ts). Göstermek
 * tek başına koruma değil: telefonu cebinde unutulan bir döngü, art arda
 * tekrarlanan bir "tekrar dene", ya da pahalı bir modele yanlışlıkla geçiş,
 * fark edilene kadar fatura yazar. Tek kişilik bir uygulamada faturayı ödeyen
 * de kullanan da aynı kişi; bu yüzden uyarı yetmez, DURDURMAK gerekir.
 *
 * İki dürüstlük şartı var ve ikisi de burada yazılı:
 *
 * 1. BU RAKAM TAHMİNDİR. Token sayılarından hesaplanıyor; kesin tutar
 *    sağlayıcının faturasıdır. Tahmine dayanan bir tavan, insanı yanlışlıkla
 *    kilitleyebilir — o yüzden engel mesajı ne olduğunu açıkça söyler ve
 *    tavanı yükseltme yolunu gösterir. Sessizce "bir hata oldu" demek,
 *    kullanıcıyı sebebi bilinmeyen bir arızayla baş başa bırakırdı.
 *
 * 2. TAVAN, BAŞLAMIŞ BİR İSTEĞİ KESMEZ. Yalnız YENİ isteği engeller. Bu
 *    yüzden tavan bir tık aşılabilir; "en fazla şu kadar" değil "bunu geçince
 *    dur" demektir.
 */

/** Sınır 0 ise o sınır kapalıdır (sınırsız). */
export interface BudgetLimits {
  /** Günlük tavan, TL. */
  dailyTry: number;
  /** Aylık tavan, TL. */
  monthlyTry: number;
}

/**
 * Varsayılan AÇIK gelir. Kapalı bir koruma koruma değildir: kimse ayarlara
 * girip tavan kurmayı akıl etmez, fatura geldiğinde akıl eder.
 */
export const DEFAULT_BUDGET: BudgetLimits = { dailyTry: 60, monthlyTry: 300 };

/** Bu oranı geçince uyarılır (engellenmez). */
export const WARN_RATIO = 0.8;

export type BudgetState = "ok" | "warn" | "blocked";

export interface BudgetStatus {
  state: BudgetState;
  /** Hangi sınır doldu / dolmak üzere. */
  scope: "day" | "month" | null;
  spentDayTry: number;
  spentMonthTry: number;
  limits: BudgetLimits;
  /** Dolan sınıra kalan TL (sınırsızsa null). */
  remainingTry: number | null;
  /** Kullanıcıya gösterilecek metin; state "ok" ise null. */
  message: string | null;
}

function tidy(n: number): string {
  if (n < 1) return n.toFixed(2);
  if (n < 100) return n.toFixed(1);
  return String(Math.round(n));
}

/** Depodan gelen değer bozuk olabilir; sayı olmayan her şey varsayılana düşer. */
export function normalizeLimits(raw: unknown): BudgetLimits {
  const r = (raw ?? {}) as Partial<Record<keyof BudgetLimits, unknown>>;
  /**
   * Dönüşüm ELDEN yapılır, Number() ile değil.
   *
   * Number(null) ve Number("") SIFIR döndürür; sıfır da "sınır kapalı"
   * demektir. Yani bozuk bir kayıt, tavanı sessizce kapatırdı — hiçbir hata
   * çıkmadan, tam da korumanın gerektiği anda. Bozuk kayıtta koruma
   * GÜÇLENMELİ (varsayılana dönmeli), zayıflamamalı.
   */
  const num = (v: unknown, fallback: number): number => {
    if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : fallback;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    }
    return fallback;
  };
  return {
    dailyTry: num(r.dailyTry, DEFAULT_BUDGET.dailyTry),
    monthlyTry: num(r.monthlyTry, DEFAULT_BUDGET.monthlyTry),
  };
}

export interface Spent {
  todayUsd: number;
  monthUsd: number;
}

/**
 * Tavan durumu. Gün ve ay ayrı ayrı bakılır; ikisi de doluysa ay bildirilir
 * (daha uzun süre engelleyen sınır, kullanıcının bilmesi gereken sınırdır).
 */
export function budgetStatus(
  spent: Spent,
  limits: BudgetLimits,
  usdTry: number
): BudgetStatus {
  const day = spent.todayUsd * usdTry;
  const month = spent.monthUsd * usdTry;
  const base = { spentDayTry: day, spentMonthTry: month, limits };

  const dayOn = limits.dailyTry > 0;
  const monthOn = limits.monthlyTry > 0;
  const dayBlocked = dayOn && day >= limits.dailyTry;
  const monthBlocked = monthOn && month >= limits.monthlyTry;

  if (monthBlocked || dayBlocked) {
    const scope = monthBlocked ? "month" : "day";
    const limit = monthBlocked ? limits.monthlyTry : limits.dailyTry;
    const value = monthBlocked ? month : day;
    const period = monthBlocked ? "Bu ayki" : "Bugünkü";
    const window = monthBlocked ? "Ay" : "Gün";
    return {
      ...base,
      state: "blocked",
      scope,
      remainingTry: 0,
      message:
        `${period} tahmini harcama ${tidy(value)} TL — kendi koyduğun ${tidy(limit)} TL tavanına ulaştı, ` +
        `bu yüzden yeni istek gönderilmedi.\n\n` +
        `${window} dönünce kendiliğinden açılır. Şimdi devam etmek istersen Ayarlar → Harcama tavanı'ndan yükseltebilirsin.\n\n` +
        `Bu rakam token sayılarından hesaplanan bir TAHMİNDİR; kesin tutar sağlayıcının faturasıdır.`,
    };
  }

  // Uyarı: iki sınırdan hangisi daha doluysa o bildirilir.
  const dayRatio = dayOn ? day / limits.dailyTry : 0;
  const monthRatio = monthOn ? month / limits.monthlyTry : 0;
  const useDay = dayRatio >= monthRatio;
  const ratio = Math.max(dayRatio, monthRatio);
  if (ratio >= WARN_RATIO) {
    const limit = useDay ? limits.dailyTry : limits.monthlyTry;
    const value = useDay ? day : month;
    return {
      ...base,
      state: "warn",
      scope: useDay ? "day" : "month",
      remainingTry: Math.max(limit - value, 0),
      message: `${useDay ? "Bugün" : "Bu ay"} ${tidy(value)} TL harcadın; tavan ${tidy(
        limit
      )} TL. Kalan ${tidy(Math.max(limit - value, 0))} TL.`,
    };
  }

  const remaining = monthOn
    ? Math.max(limits.monthlyTry - month, 0)
    : dayOn
      ? Math.max(limits.dailyTry - day, 0)
      : null;
  return { ...base, state: "ok", scope: null, remainingTry: remaining, message: null };
}

/**
 * Tavan aşıldığında fırlatılacak hata.
 *
 * Ayrı bir sınıf, çünkü çağıran taraf bunu "ağ hatası" gibi göstermemeli:
 * bu bir arıza değil, uygulamanın bilerek verdiği bir karar.
 */
export class BudgetExceededError extends Error {
  readonly status: BudgetStatus;
  constructor(status: BudgetStatus) {
    super(status.message ?? "Harcama tavanına ulaşıldı.");
    this.name = "BudgetExceededError";
    this.status = status;
  }
}

export function isBudgetError(e: unknown): e is BudgetExceededError {
  return e instanceof BudgetExceededError;
}
