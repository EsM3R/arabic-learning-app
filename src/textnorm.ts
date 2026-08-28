/**
 * Hedef dil metin normalizasyonu — saf modül (React/RN importu YOK).
 *
 * İki tüketicisi var:
 * 1. Üretici kelime sınavı: öğrencinin yazdığı cevap ile kartın doğrusu
 *    karşılaştırılır. Hareke/hamza/aksan farkı "yanlış" sayılmamalı.
 * 2. Okuma metni kapsam ölçümü: üretilen metnin ne kadarının defterdeki
 *    kelimelerden kurulduğunu YAKLAŞIK ölçer. Arapça morfolojisi (ال، و، ب
 *    klitikleri) yüzünden naif eşleşme yanılır; klitik soyarak aday üretiriz.
 *    Bu bir rozet ölçümüdür, hakem değil — yanlış pozitif kabul edilebilir.
 */

/** Arapça hareke ve uzatma işaretleri (U+064B–U+065F, U+0670, tatweel U+0640). */
const ARABIC_DIACRITICS = /[ً-ٰٟـ]/g;

/**
 * Arapça normalizasyon: hareke sil, elif/hamza varyantlarını tekle,
 * ta marbuta → ha, elif maksura → ya. Karşılaştırma İÇİN kayıplı bir
 * gösterimdir; ekranda asla gösterilmez.
 */
export function normalizeArabic(s: string): string {
  return s
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[،؛؟.!,;?'"()\-…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Latin diller: küçük harf + aksan soyma + noktalama temizliği. */
export function normalizeLatin(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿¡.!,;:?'"()\-…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dil paketinin scriptExtract bayrağına göre doğru normalizasyonu seçer. */
export function normalizeTarget(s: string, arabicScript: boolean): string {
  return arabicScript ? normalizeArabic(s) : normalizeLatin(s);
}

/**
 * İki cevabın "aynı" sayılıp sayılmayacağı (üretici sınav).
 * Çok kelimeli kalıplarda kelime sırası aynen aranır.
 */
export function answersMatch(expected: string, given: string, arabicScript: boolean): boolean {
  const e = normalizeTarget(expected, arabicScript);
  const g = normalizeTarget(given, arabicScript);
  return e.length > 0 && e === g;
}

// ---------------------------------------------------------------------------
// Kapsam ölçümü (okuma metinleri)
// ---------------------------------------------------------------------------

/**
 * Yaygın Arapça ön klitikler (uzundan kısaya — önce uzun soyulur).
 * "عال" Şami kaynaşmasıdır (على + ال): رحت عالسوق.
 */
const AR_PREFIXES = ["وبال", "فبال", "وال", "فال", "بال", "كال", "لل", "عال", "ال", "و", "ف", "ب", "ل", "ك", "ع"];

/** Yaygın son klitikler (iyelik/nesne zamirleri). */
const AR_SUFFIXES = ["كما", "هما", "ها", "هم", "هن", "كم", "كن", "نا", "ه", "ك", "ي"];

/**
 * Bir Arapça tokenın "bilinen" sayılabilmesi için denenecek adaylar:
 * kendisi + klitik soyulmuş halleri. Soyma sonrası 2 harften kısa gövdeler
 * üretilmez (aşırı soyma her şeyi eşleştirir).
 */
export function arabicStemCandidates(token: string): string[] {
  // Tek harfli klitik soyarken kalan gövde ≥3 harf olmalı: و+لد gibi sahte
  // bölmeler her kelimeyi "bilinen"e çevirirdi. Çok harfli klitiklerde
  // (ال، عال...) yanlış bölme olasılığı düşük, ≥2 yeter.
  const minRest = (clitic: string) => (clitic.length === 1 ? 3 : 2);
  const out = new Set<string>([token]);
  const bases = [token];
  for (const p of AR_PREFIXES) {
    if (token.startsWith(p) && token.length - p.length >= minRest(p)) {
      const stripped = token.slice(p.length);
      out.add(stripped);
      bases.push(stripped);
    }
  }
  for (const base of bases) {
    for (const s of AR_SUFFIXES) {
      if (base.endsWith(s) && base.length - s.length >= minRest(s)) {
        out.add(base.slice(0, base.length - s.length));
      }
    }
  }
  return Array.from(out);
}

export interface CoverageResult {
  /** Bilinen sayılan token oranı (0..1). Metin boşsa 1. */
  ratio: number;
  totalTokens: number;
  knownTokens: number;
  /** Bilinmeyen sayılan tokenlar (görüldüğü halleriyle, tekilleştirilmiş). */
  unknown: string[];
}

/**
 * Metnin, bilinen kelime listesine göre yaklaşık kapsamı.
 * knownWords: kartlardaki hedef dil yazımları (ör. VocabCard.arabic).
 * Çok kelimeli kalıplar tek tek kelimelerine de açılır — "صباح الخير"
 * defterdeyse metindeki "صباح" bilinen sayılır.
 */
export function coverage(
  text: string,
  knownWords: string[],
  arabicScript: boolean
): CoverageResult {
  const known = new Set<string>();
  for (const w of knownWords) {
    const n = normalizeTarget(w, arabicScript);
    if (!n) continue;
    known.add(n);
    for (const part of n.split(" ")) if (part.length >= 2) known.add(part);
  }

  const tokens = normalizeTarget(text, arabicScript).split(" ").filter((t) => t.length > 0);
  let knownCount = 0;
  const unknown = new Set<string>();
  for (const tok of tokens) {
    const candidates = arabicScript ? arabicStemCandidates(tok) : [tok];
    if (candidates.some((c) => known.has(c))) knownCount += 1;
    else unknown.add(tok);
  }
  return {
    ratio: tokens.length === 0 ? 1 : knownCount / tokens.length,
    totalTokens: tokens.length,
    knownTokens: knownCount,
    unknown: Array.from(unknown),
  };
}
