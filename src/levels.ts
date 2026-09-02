/**
 * CEFR seviye merdiveni ve seviye değişimi kapısı — SAF modül
 * (React/RN importu YOK; tests/levels.test.ts).
 *
 * Neden kapı gerekiyor: seviye_guncelle aracının şemasında bir enum var ama
 * şemayı yalnız bazı sağlayıcılar sunucuda zorluyor (DeepSeek json modunda
 * hiç zorlamıyor). Enum'a güvenip String() ile yazarsak model "B1-B2" ya da
 * "Orta" yazdığında bu doğrudan profile geçer ve tüm ders üretimi bozuk bir
 * seviyeye göre şekillenir. Ayrıca tek turda A1'den C1'e sıçrama, hocanın
 * gözlemine dayansa bile öğrencinin lehine değildir.
 */

export const LEVELS = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

/** Bir adımda en fazla kaç kademe yükselinebilir. */
export const MAX_LEVEL_STEP = 1;

export function isLevel(v: unknown): v is Level {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v);
}

export function levelIndex(level: string): number {
  return (LEVELS as readonly string[]).indexOf(level);
}

/** Model serbest yazımını merdivene oturtur ("a2 " → "A2"); tanınmazsa null. */
export function normalizeLevel(v: unknown): Level | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase().replace(/\s+/g, "");
  return isLevel(t) ? t : null;
}

export interface LevelChangeResult {
  /** Yazılacak seviye (reddedilirse mevcut seviye korunur). */
  value: string;
  /** Reddedildiyse modele dönecek Türkçe gerekçe. */
  error?: string;
}

/**
 * Seviye değişimini denetler. Kurallar:
 * - Tanınmayan yazım reddedilir (mevcut korunur).
 * - Bir adımda en fazla MAX_LEVEL_STEP kademe YÜKSELİŞ.
 * - Düşüş serbesttir: hoca öğrencinin gerçekte daha geride olduğunu görürse
 *   bunu söylemekten alıkonulmamalı (yanlış yüksek seviye, gereksiz kısıttan
 *   çok daha zararlı — dersler anlaşılmaz olur).
 */
export function validateLevelChange(current: string, next: unknown): LevelChangeResult {
  const wanted = normalizeLevel(next);
  if (!wanted) {
    return {
      value: current,
      error: `Geçersiz seviye "${String(next)}". Yalnız şunlardan biri olabilir: ${LEVELS.join(", ")}.`,
    };
  }
  const from = levelIndex(current);
  const to = levelIndex(wanted);
  // Mevcut seviye bilinmiyorsa (bozuk kayıt) merdivene oturtmayı kabul et.
  if (from < 0) return { value: wanted };
  if (to - from > MAX_LEVEL_STEP) {
    return {
      value: current,
      error: `Tek seferde ${current} → ${wanted} sıçraması kabul edilmiyor (en fazla ${MAX_LEVEL_STEP} kademe). Önce ${LEVELS[from + MAX_LEVEL_STEP]} yaz; öğrenci orayı da geçtiğinde bir daha yükseltirsin.`,
    };
  }
  return { value: wanted };
}
