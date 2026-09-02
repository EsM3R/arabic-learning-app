/**
 * Hata defteri eşleştirmesi — SAF modül (React/RN importu YOK;
 * tests/mistakes.test.ts).
 *
 * Sorun: aynı hatanın tekrarını yakalamak konu metninin BİREBİR aynı
 * olmasına bağlıydı. Konuyu model serbestçe yazdığı için "geçmiş zaman" ile
 * "geçmiş zaman çekimi" iki ayrı kayıt açıyordu; fosilleşme sayacı (3'te
 * "bu konuyu açıkça işle" uyarısı) böylece hiç dolmuyordu — yani hata
 * defterinin en değerli özelliği pratikte çalışmıyordu.
 *
 * Çözüm: konuları anlamlı kelimelerine ayırıp örtüşmeye bakmak.
 */

/** Konu metninde ayırt edici olmayan, her hata başlığında geçebilecek kelimeler. */
const STOP_WORDS = new Set([
  "ve",
  "ile",
  "bir",
  "bu",
  "şu",
  "o",
  "de",
  "da",
  "için",
  "gibi",
  "kullanımı",
  "kullanimi",
  "hatası",
  "hatasi",
  "yanlışı",
  "yanlisi",
  "konusu",
  "sorunu",
]);

/** Türkçe küçültme (İ/I ayrımı doğru) + noktalama temizliği. */
export function normalizeTopic(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Anlamlı kökler: durak kelimeler atılır, kalanların ilk 5 harfi alınır (çekim toleransı). */
export function topicTokens(s: string): string[] {
  const out: string[] = [];
  for (const w of normalizeTopic(s).split(" ")) {
    if (w.length < 3 || STOP_WORDS.has(w)) continue;
    const stem = w.slice(0, 5);
    if (!out.includes(stem)) out.push(stem);
  }
  return out;
}

/**
 * İki konu aynı hatayı mı anlatıyor? İki şart birden aranır:
 *
 * 1. BAŞ KELİME aynı olmalı. Türkçede konu başlığı baş kelimeyle
 *    belirlenir ("geçmiş zaman", "iyelik ekleri") ve ayırt edici olan odur.
 *    Yalnız çoğunluk örtüşmesine bakmak "geçmiş zaman kipi" ile "gelecek
 *    zaman kipi"ni birleştirirdi — 3 kökün 2'si ortak ama konular ayrı.
 * 2. Kalan köklerin çoğunluğu da örtüşmeli (küçük kümenin >= yarısı).
 *
 * Böylece "geçmiş zaman" ↔ "geçmiş zaman çekimi" aynı; "geçmiş zaman" ↔
 * "şimdiki zaman" ve "geçmiş zaman kipi" ↔ "gelecek zaman kipi" ayrı kalır.
 */
export function sameTopic(a: string, b: string): boolean {
  const ta = topicTokens(a);
  const tb = topicTokens(b);
  if (ta.length === 0 || tb.length === 0) return normalizeTopic(a) === normalizeTopic(b);
  if (ta[0] !== tb[0]) return false;
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const shared = small.filter((t) => large.includes(t)).length;
  return shared * 2 >= small.length;
}

export interface TopicOwner {
  topic: string;
  resolved?: boolean;
}

/** Aynı konudaki AÇIK kayıt (varsa) — en yenisi kazanır. */
export function findOpenSameTopic<T extends TopicOwner>(entries: T[], topic: string): T | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const m = entries[i];
    if (!m.resolved && sameTopic(m.topic, topic)) return m;
  }
  return undefined;
}
