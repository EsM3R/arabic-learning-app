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
import { isArabicFamily, needsTranslit } from "./scripts.ts";
import type { ScriptId } from "./scripts.ts";

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
    // Almanca ß ile ss aynı kelimedir (Straße/Strasse) — ayrı sayılmamalı.
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿¡.!,;:?'"()\-…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Farsça normalizasyonu: Arap alfabesini kullanır ama AYNI harfin iki kodu
 * vardır (ک/\u0643, \u06cc/\u064a) ve bitişiksiz boşluk (ZWNJ) kelime ortasında
 * geçer. Bunlar teklenmezse "\u06a9\u062a\u0627\u0628" ile "\u0643\u062a\u0627\u0628" farklı kelime sanılır ve
 * kapsam ölçümü sessizce çöker.
 */
export function normalizePersian(s: string): string {
  return s
    .replace(ARABIC_DIACRITICS, "")
    .replace(/\u200c/g, "") // ZWNJ: \u0645\u06cc\u200c\u0631\u0648\u0645 = \u0645\u06cc\u0631\u0648\u0645
    .replace(/\u06a9/g, "\u0643") // Farsça kef \u2192 Arapça kef
    .replace(/[\u06cc\u0649]/g, "\u064a") // Farsça ye / elif maksura \u2192 Arapça ye
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .replace(/[\u060c\u061b\u061f.!,;?'"()\u00ab\u00bb\-\u2026]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kiril (Rusça) normalizasyonu: küçük harf, vurgu işaretini sil, \u0451\u2192\u0435.
 * Vurgu işareti (\u0440\u0430\u0431\u043e\u0301\u0442\u0430) sözlükte ve bizim ürettiğimiz kelime
 * listelerinde vardır ama metinde yoktur \u2014 silinmezse aynı kelime iki
 * ayrı kelime sayılırdı. NFD kullanılmıyor: NFD \u0439'u \u0438 + breve'ye ayırır ve
 * breve silinince \u0439 ile \u0438 birleşirdi (\u043c\u043e\u0439 = \u043c\u043e\u0438 olurdu).
 */
export function normalizeCyrillic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u0300\u0301]/g, "") // yalnız vurgu işaretleri
    .replace(/\u0451/g, "\u0435")
    .replace(/[.!,;:?'"()\u00ab\u00bb\-\u2013\u2014\u2026]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dil paketinin yazı sistemine göre doğru normalizasyonu seçer. */
export function normalizeTarget(s: string, script: ScriptId): string {
  if (script === "arabic") return normalizeArabic(s);
  if (script === "persian") return normalizePersian(s);
  if (script === "cyrillic") return normalizeCyrillic(s);
  return normalizeLatin(s);
}

/**
 * İki cevabın "aynı" sayılıp sayılmayacağı (üretici sınav).
 * Çok kelimeli kalıplarda kelime sırası aynen aranır.
 */
export function answersMatch(expected: string, given: string, script: ScriptId): boolean {
  const e = normalizeTarget(expected, script);
  const g = normalizeTarget(given, script);
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
 * Üretici sınav eşleşmesi: önce hedef yazım, sonra (yalnız Latin DIŞI
 * alfabeli dilde) transliterasyon. Arap/Kiril klavyesi olmayan öğrenci
 * okunuşla yazarak da üretim yapmış olur — amaç yazım sınavı değil, sözcüğü
 * geri ÇAĞIRMAK. Latin dillerde translit yolu kapalıdır (hedef zaten Latin).
 */
export function matchProduction(
  expectedTarget: string,
  expectedTranslit: string,
  given: string,
  script: ScriptId
): ProductionMatch {
  if (answersMatch(expectedTarget, given, script)) return "target";
  if (needsTranslit(script)) {
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
function cliticCandidates(
  token: string,
  prefixes: string[],
  suffixes: string[],
  minRest: (clitic: string) => number
): string[] {
  const out = new Set<string>([token]);
  const bases = [token];
  for (const p of prefixes) {
    if (token.startsWith(p) && token.length - p.length >= minRest(p)) {
      const stripped = token.slice(p.length);
      out.add(stripped);
      bases.push(stripped);
    }
  }
  for (const base of bases) {
    for (const s of suffixes) {
      if (base.endsWith(s) && base.length - s.length >= minRest(s)) {
        out.add(base.slice(0, base.length - s.length));
      }
    }
  }
  return Array.from(out);
}

// Tek harfli klitik soyarken kalan gövde ≥3 harf olmalı: و+لد gibi sahte
// bölmeler her kelimeyi "bilinen"e çevirirdi. Çok harfli klitiklerde
// (ال، عال...) yanlış bölme olasılığı düşük, ≥2 yeter.
const shortCliticRest = (clitic: string) => (clitic.length === 1 ? 3 : 2);

export function arabicStemCandidates(token: string): string[] {
  return cliticCandidates(token, AR_PREFIXES, AR_SUFFIXES, shortCliticRest);
}

/** Farsça ön klitikler: süreklilik/olumsuzluk می/نمی ve بی- ("-siz"). */
const FA_PREFIXES = ["نمي", "مي", "بي"];

/**
 * Farsça son ekler: çoğul ها, üstünlük تر/ترين, iyelik zamirleri ve izafe /
 * belirsizlik ي'si. Normalizasyondan SONRA çalışır — bu yüzden hepsi Arapça
 * ye/kef ile yazılıdır (ی → ي, ک → ك).
 */
const FA_SUFFIXES = [
  "هايشان",
  "هايمان",
  "هايتان",
  "ترين",
  "هايي",
  "هاي",
  "مان",
  "تان",
  "شان",
  "ها",
  "تر",
  "ام",
  "ات",
  "اش",
  "ي",
];

export function persianStemCandidates(token: string): string[] {
  return cliticCandidates(token, FA_PREFIXES, FA_SUFFIXES, shortCliticRest);
}

/** Rusça dönüşlülük eki — çekim ekinden SONRA gelir, önce o soyulur. */
const RU_REFLEXIVE = ["ся", "сь"];

/**
 * Rusça çekim ekleri (ad, sıfat, fiil). Rusça klitikle değil BÜKÜMLE çalışır;
 * bu liste kapsam ROZETİ için yaklaşık bir gövdeleyicidir, dilbilgisel bir
 * çözümleyici değil — yanlış pozitif kabul edilebilir (bkz. dosya başı).
 */
const RU_ENDINGS = [
  "иями", "ями", "ами", "ешь", "ишь", "ете", "ите",
  "ого", "его", "ому", "ему", "ыми", "ими",
  "ых", "их", "ую", "юю", "ая", "яя", "ое", "ее", "ые", "ие",
  "ый", "ий", "ой", "ей", "ам", "ям", "ах", "ях", "ом", "ем",
  "ов", "ев", "ут", "ют", "ат", "ят", "ет", "ит", "им",
  "ла", "ло", "ли", "ть",
  "а", "я", "о", "е", "у", "ю", "ы", "и", "ь", "й", "л",
];

export function russianStemCandidates(token: string): string[] {
  const out = new Set<string>([token]);
  const bases = [token];
  for (const r of RU_REFLEXIVE) {
    if (token.endsWith(r) && token.length - r.length >= 3) {
      const base = token.slice(0, token.length - r.length);
      out.add(base);
      bases.push(base);
    }
  }
  for (const base of bases) {
    for (const e of RU_ENDINGS) {
      const rest = base.length - e.length;
      // Tek harfli ek soyarken gövde ≥4 kalsin: Rusçada neredeyse her kelime bir
      // ünlüyle biter, gevşek eşik her şeyi "bilinen" yapardı.
      if (base.endsWith(e) && rest >= (e.length === 1 ? 4 : 3)) out.add(base.slice(0, rest));
    }
  }
  return Array.from(out);
}

/**
 * Yazı sistemine göre gövde adayları. Latin dillerde gövdeleme YOK: Fransızca/
 * Almanca/İtalyanca bükümlü dillerdir ama naif ek soymanin yanlış pozitifi
 * kazancından fazla; kapsam rozeti bir miktar düşük çıkar, bu dürüst tarafta
 * kalmaktır.
 */
export function stemCandidates(token: string, script: ScriptId): string[] {
  if (script === "arabic") return arabicStemCandidates(token);
  if (script === "persian") return persianStemCandidates(token);
  if (script === "cyrillic") return russianStemCandidates(token);
  return [token];
}

/**
 * Bilinen kelime kümesi: kelimenin kendisi, çok kelimeli kalıpların parçaları
 * ve HER İKİSİNİN gövde adayları.
 *
 * Defterdeki kelimeyi de gövdelemek şart: Arapçada klitik metindeki tokena
 * yapışır ve defterdeki yalın biçim zaten gövdedir, ama Rusçada SÖZLÜK BİÇİMİ
 * de çekimlidir ("книга"). Yalnız token gövdelenseydi "книгу" → "книг" ile
 * defterdeki "книга" asla eşleşmez, Rusçada kapsam ölçümü sıfıra yakın
 * çıkardı.
 */
function knownSet(words: string[], script: ScriptId): Set<string> {
  const set = new Set<string>();
  for (const w of words) {
    const n = normalizeTarget(w, script);
    if (!n) continue;
    set.add(n);
    for (const stem of stemCandidates(n, script)) set.add(stem);
    for (const part of n.split(" ")) {
      if (part.length < 2) continue;
      set.add(part);
      for (const stem of stemCandidates(part, script)) set.add(stem);
    }
  }
  return set;
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
  script: ScriptId
): CoverageResult {
  const known = knownSet(knownWords, script);

  const tokens = normalizeTarget(text, script).split(" ").filter((t) => t.length > 0);
  let knownCount = 0;
  const unknown = new Set<string>();
  for (const tok of tokens) {
    const candidates = stemCandidates(tok, script);
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
  script: ScriptId
): ReadingCoverage {
  const known = knownSet(knownWords, script);
  const planned = knownSet(plannedNewWords, script);

  const tokens = normalizeTarget(text, script)
    .split(" ")
    .filter((t) => t.length > 0);
  let knownCount = 0;
  let plannedCount = 0;
  const unplanned = new Set<string>();
  for (const tok of tokens) {
    const cands = stemCandidates(tok, script);
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
