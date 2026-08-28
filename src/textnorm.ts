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

/**
 * Transliterasyon karşılaştırması için kayıplı katlama (yalnız Arapça yönünde
 * kullanılır). Öğrencinin kartlarda gördüğü Türkçe-okunuş gösterimiyle,
 * İngiliz-tarzı veya Arap chat alfabesiyle yazdığı cevabı aynı uzaya indirir.
 * Ekranda asla gösterilmez.
 */
export function normalizeTranslit(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, "i")
    // İngiliz-tarzı digraflar → Türkçe gösterimin katlanmış haline
    .replace(/kh/g, "h")
    .replace(/sh/g, "s")
    .replace(/gh/g, "g")
    .replace(/th/g, "t")
    // Arap chat alfabesi rakamları
    .replace(/3/g, "") // ع
    .replace(/2/g, "") // ء
    .replace(/7/g, "h") // ح
    .replace(/5/g, "h") // خ
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // makron/aksan/sedil: ā→a, ş→s, ç→c
    .replace(/[ʿʾʻʼ'’`]/g, "") // ayn/hamza işaretleri
    .replace(/[¿¡.!,;:?"()\-…،؛؟]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ProductionMatch = "target" | "translit" | "none";

/**
 * Üretici sınav eşleşmesi: önce hedef yazım, sonra (yalnız Arapça alfabeli
 * dilde) transliterasyon. Arap klavyesi olmayan öğrenci okunuşla yazarak da
 * üretim yapmış olur — amaç yazım sınavı değil, sözcüğü geri ÇAĞIRMAK.
 * Latin dillerde translit yolu kapalıdır (hedef zaten Latin).
 */
export function matchProduction(
  expectedTarget: string,
  expectedTranslit: string,
  given: string,
  arabicScript: boolean
): ProductionMatch {
  if (answersMatch(expectedTarget, given, arabicScript)) return "target";
  if (arabicScript) {
    const e = normalizeTranslit(expectedTranslit);
    if (e.length > 0 && e === normalizeTranslit(given)) return "translit";
  }
  return "none";
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

export interface ReadingCoverage {
  /** bilinen / toplam — yaklaşık GERÇEK kapsam (planlı yeni kelimeler de bilinmeyen sayılır). */
  knownRatio: number;
  /** (bilinen + PLANLI yeni) / toplam — kural uyumu: bildirilmemiş sürpriz oranını ölçer. */
  complianceRatio: number;
  totalTokens: number;
  knownTokens: number;
  plannedNewTokens: number;
  /** newWords'te BİLDİRİLMEDEN geçen bilinmeyenler (normalize halleriyle, tekil). */
  unplannedUnknown: string[];
}

/**
 * Okuma metni kapsam ölçümü. knownRatio pedagojik kapsamın yaklaşığıdır;
 * complianceRatio ise kural İHLALİNİ ölçer: model her yeni kelimeyi newWords'e
 * yazmak zorundadır, oraya yazılmış kelimeler "planlı"dır ve uyumu düşürmez.
 * Yaklaşık ölçümdür (kırık çoğul, çekim kalıpları yakalanmaz) — rozet/uyarı
 * içindir, hakem değildir; otomatik hiçbir aksiyon buna bağlanmaz.
 */
export function readingCoverage(
  text: string,
  knownWords: string[],
  plannedNewWords: string[],
  arabicScript: boolean
): ReadingCoverage {
  const buildSet = (words: string[]) => {
    const set = new Set<string>();
    for (const w of words) {
      const n = normalizeTarget(w, arabicScript);
      if (!n) continue;
      set.add(n);
      for (const part of n.split(" ")) if (part.length >= 2) set.add(part);
    }
    return set;
  };
  const known = buildSet(knownWords);
  const planned = buildSet(plannedNewWords);

  const tokens = normalizeTarget(text, arabicScript)
    .split(" ")
    .filter((t) => t.length > 0);
  let knownCount = 0;
  let plannedCount = 0;
  const unplanned = new Set<string>();
  for (const tok of tokens) {
    const cands = arabicScript ? arabicStemCandidates(tok) : [tok];
    if (cands.some((c) => known.has(c))) knownCount += 1;
    else if (cands.some((c) => planned.has(c))) plannedCount += 1;
    else unplanned.add(tok);
  }
  const total = tokens.length;
  return {
    knownRatio: total === 0 ? 1 : knownCount / total,
    complianceRatio: total === 0 ? 1 : (knownCount + plannedCount) / total,
    totalTokens: total,
    knownTokens: knownCount,
    plannedNewTokens: plannedCount,
    unplannedUnknown: Array.from(unplanned),
  };
}
