/**
 * HVPT (yüksek değişkenlikli sesbilgisel eğitim) ayırt etme turu saf mantığı
 * (React/RN importu YOK; tests/hvpt.test.ts ile node altında koşar).
 *
 * Araştırma gereği iki şart: (1) algı üretimden ÖNCE eğitilir — ayırt etme
 * turu kayıt turundan önce gelir; (2) uyaran ÇEŞİTLİ sunulur — cihazdaki
 * farklı TTS sesleri döndürülür, tek ses varsa hız varyasyonu yapılır.
 *
 * Model çıktısı güvenilmez alanlar içerebilir: aynı kelime iki tarafta,
 * boş alan, hep aynı playIndex. Burada temizlenir — UI temiz veri varsayar.
 */
import { normalizeTarget } from "./textnorm.ts";
import type { MinimalPairItem } from "./types";

export function sanitizeMinimalPairs(
  pairs: MinimalPairItem[],
  arabicScript: boolean
): MinimalPairItem[] {
  const cleaned = pairs.filter((p) => {
    const a = normalizeTarget(p.a?.word ?? "", arabicScript);
    const b = normalizeTarget(p.b?.word ?? "", arabicScript);
    return a.length > 0 && b.length > 0 && a !== b && !!p.focus && !!p.tip;
  });
  // playIndex dengesi: model hepsini aynı yazdıysa cevap her zaman aynı
  // düğme olur ve alıştırma çöker → deterministik dönüşümle dengele.
  const zeros = cleaned.filter((p) => p.playIndex === 0).length;
  if (cleaned.length >= 2 && (zeros === 0 || zeros === cleaned.length)) {
    return cleaned.map((p, i) => ({ ...p, playIndex: (i % 2) as 0 | 1 }));
  }
  return cleaned.map((p) => ({ ...p, playIndex: p.playIndex === 1 ? 1 : 0 }));
}

/**
 * Turu tekrar oynayan öğrenci cevapları ezberlemesin: her tekrar turunda
 * çalınan taraf çevrilir. round 0 tabanlıdır (ilk tur = üretimdeki plan).
 */
export function effectivePlayIndex(playIndex: 0 | 1, round: number): 0 | 1 {
  return ((playIndex + round) % 2) as 0 | 1;
}

export interface VoiceVariant {
  voiceId?: string;
  rate: number;
}

/**
 * Soru başına ses çeşitliliği: 2+ ses varsa sesler dönüşümlü (normal hız),
 * tek ses / hiç ses yoksa hız varyasyonu (0.8 / 0.95 / 1.1).
 */
export function pickVoiceVariant(voiceIds: string[], questionIndex: number): VoiceVariant {
  if (voiceIds.length >= 2) {
    return { voiceId: voiceIds[questionIndex % voiceIds.length], rate: 0.95 };
  }
  const rates = [0.8, 0.95, 1.1];
  return { voiceId: voiceIds[0], rate: rates[questionIndex % rates.length] };
}
