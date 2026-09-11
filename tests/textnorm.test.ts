/** Metin normalizasyonu ve kapsam ölçümü testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answersMatch,
  arabicStemCandidates,
  coverage,
  matchProduction,
  normalizeArabic,
  normalizeLatin,
  normalizePersian,
  normalizeTranslit,
  persianStemCandidates,
  russianStemCandidates,
  stemCandidates,
} from "../src/textnorm.ts";

test("normalizeArabic harekeleri siler", () => {
  assert.equal(normalizeArabic("مَرْحَبًا"), "مرحبا");
});

test("normalizeArabic hamza/elif varyantlarını tekler", () => {
  assert.equal(normalizeArabic("أهلاً"), "اهلا");
  assert.equal(normalizeArabic("إنسان"), "انسان");
  assert.equal(normalizeArabic("آسف"), "اسف");
});

test("normalizeArabic ta marbuta ve elif maksurayı eşler", () => {
  assert.equal(normalizeArabic("مدرسة"), normalizeArabic("مدرسه"));
  assert.equal(normalizeArabic("على"), normalizeArabic("علي"));
});

test("normalizeArabic noktalama ve tatweel temizler", () => {
  assert.equal(normalizeArabic("شو أخبارك؟"), "شو اخبارك");
  assert.equal(normalizeArabic("مـــرحبا"), "مرحبا");
});

test("normalizeLatin aksan ve büyük harf soyar", () => {
  assert.equal(normalizeLatin("¿Qué TAL?"), "que tal");
  assert.equal(normalizeLatin("I'm  fine."), "i m fine");
});

test("answersMatch: hareke farkı doğru cevabı bozmaz", () => {
  assert.ok(answersMatch("مَرْحَبًا", "مرحبا", "arabic"));
  assert.ok(answersMatch("شو أخبارك؟", "شو اخبارك", "arabic"));
  assert.ok(!answersMatch("مرحبا", "شكرا", "arabic"));
});

test("answersMatch: Latin dillerde aksan/büyük harf esner", () => {
  assert.ok(answersMatch("¿Cómo estás?", "como estas", "latin"));
  assert.ok(!answersMatch("good morning", "good night", "latin"));
});

test("answersMatch: boş beklenen asla eşleşmez", () => {
  assert.ok(!answersMatch("", "", "arabic"));
});

test("arabicStemCandidates ال ve و öneklerini soyar", () => {
  const c = arabicStemCandidates("والسوق");
  assert.ok(c.includes("سوق"));
  assert.ok(c.includes("السوق"));
});

test("arabicStemCandidates Şami عال kaynaşmasını çözer", () => {
  assert.ok(arabicStemCandidates("عالسوق").includes("سوق"));
});

test("arabicStemCandidates iyelik sonekini soyar", () => {
  assert.ok(arabicStemCandidates("بيتي").includes("بيت"));
  assert.ok(arabicStemCandidates("كتابها").includes("كتاب"));
});

test("arabicStemCandidates aşırı soymaz (2 harf tabanı)", () => {
  assert.ok(!arabicStemCandidates("ولد").includes("لد"));
});

test("coverage: klitikli kelimeler bilinen sayılır", () => {
  const known = ["سوق", "راح", "اشترى", "خضرة"];
  const r = coverage("رحت عالسوق واشتريت خضرة", known, "arabic");
  // رحت/اشتريت çekimleri gövdeyle eşleşmez (kabul edilen sınır) ama
  // عالسوق ve خضرة eşleşir; oran hesaplanabilir olmalı.
  assert.equal(r.totalTokens, 4);
  assert.ok(r.knownTokens >= 2);
  assert.ok(r.unknown.length <= 2);
});

test("coverage: çok kelimeli defter kalıbı kelimelerine açılır", () => {
  const r = coverage("صباح الخير يا استاذ", ["صباح الخير"], "arabic");
  assert.ok(r.knownTokens >= 2);
});

test("coverage: Latin dilde birebir token eşleşmesi", () => {
  const r = coverage("I went to the market", ["go", "market", "the"], "latin");
  assert.equal(r.totalTokens, 5);
  assert.equal(r.knownTokens, 2); // the + market ("went" ≠ "go", "i"/"to" bilinmiyor)
});

test("coverage: boş metin 1.0 döner", () => {
  assert.equal(coverage("", ["x"], "arabic").ratio, 1);
});

test("normalizeTranslit: Türkçe gösterim, İngiliz tarzı ve chat alfabesi eşleşir", () => {
  assert.equal(normalizeTranslit("şu ahbārak?"), normalizeTranslit("shu akhbarak"));
  assert.equal(normalizeTranslit("mar7aba"), normalizeTranslit("marhaba"));
  assert.equal(normalizeTranslit("ma'a"), normalizeTranslit("maa"));
  assert.equal(normalizeTranslit("kapı"), "kapi");
});

test("matchProduction: hedef yazım > translit > none", () => {
  assert.equal(matchProduction("مرحبا", "merhaba", "مَرْحَبًا", "arabic"), "target");
  assert.equal(matchProduction("مرحبا", "merhaba", "merhaba", "arabic"), "translit");
  assert.equal(matchProduction("مرحبا", "merhaba", "şükran", "arabic"), "none");
  assert.equal(matchProduction("مرحبا", "merhaba", "  ", "arabic"), "none");
});

test("matchProduction: Latin dilde translit yolu kapalı, hedef eşleşmesi esnek", () => {
  assert.equal(matchProduction("good morning", "gud morning", "gud morning", "latin"), "none");
  assert.equal(matchProduction("¿Cómo estás?", "", "como estas", "latin"), "target");
});


// ---------------------------------------------------------------------------
// Farsça: Arap alfabesi ama farklı harf kodları ve klitikler
// ---------------------------------------------------------------------------

test("Farsça: aynı harfin iki kodu teklenir (ی/ي, ک/ك)", () => {
  // Farsça klavye ی (U+06CC) ve ک (U+06A9) yazar, Arapça klavye ي ve ك.
  // Teklenmezseler kelime defteri ile metin asla eşleşmez.
  assert.ok(answersMatch("کتاب", "كتاب", "persian"));
  assert.ok(answersMatch("می‌روم", "ميروم", "persian"));
  assert.ok(!answersMatch("کتاب", "کتب", "persian"));
});

test("Farsça: bitişiksiz boşluk (ZWNJ) yok sayılır", () => {
  assert.equal(normalizePersian("کتاب‌ها"), normalizePersian("کتابها"));
});

test("Farsça gövdeleme: می/نمی ön eki ve ها/تر son eki soyulur", () => {
  const stems = persianStemCandidates(normalizePersian("کتاب‌ها"));
  assert.ok(stems.includes(normalizePersian("کتاب")));
  const verb = persianStemCandidates(normalizePersian("می‌روم"));
  assert.ok(verb.includes(normalizePersian("روم")));
});

test("Farsça gövdeleme: aşırı soyma yok — kısa gövde üretilmez", () => {
  // "مي" soyulsaydı geriye 2 harf kalırdı; tek harfli/kısa gövdeler her
  // kelimeyi "bilinen" yapar ve kapsam ölçümü yalan söylerdi.
  assert.deepEqual(persianStemCandidates("ميز"), ["ميز"]);
});

// ---------------------------------------------------------------------------
// Kiril (Rusça): vurgu işareti ve büküm
// ---------------------------------------------------------------------------

test("Rusça: vurgu işareti karşılaştırmada yok sayılır", () => {
  // Sözlükte ve bizim ürettiğimiz kelime listesinde vurgu işaretlidir,
  // metinde değildir; silinmezse aynı kelime iki kelime sayılırdı.
  assert.ok(answersMatch("рабо́та", "работа", "cyrillic"));
  assert.ok(answersMatch("Ещё", "еще", "cyrillic"));
});

test("Rusça: й ile и BİRLEŞTİRİLMEZ (NFD tuzağı)", () => {
  // NFD kullanılsaydı й = и + breve olur, breve silinince мой = мои olurdu.
  assert.ok(!answersMatch("мой", "мои", "cyrillic"));
});

test("Rusça gövdeleme: çekim eki ve dönüşlülük eki soyulur", () => {
  assert.ok(russianStemCandidates("работы").includes("работ"));
  assert.ok(russianStemCandidates("учиться").includes("учи"));
  assert.ok(russianStemCandidates("студентами").includes("студент"));
});

test("Rusça gövdeleme: kısa kelimede tek harfli ek soyulmaz", () => {
  // "она" → "он" soyulsaydı üç harfli her kelime birbirini eşlerdi.
  assert.deepEqual(russianStemCandidates("она"), ["она"]);
});

test("Rusça kapsam: çekimli biçim defterdeki SÖZLÜK biçimiyle eşleşir", () => {
  // Rusçada defterdeki biçim de çekimlidir ("книга"), metindeki de ("книгу").
  // İkisi de gövdelenmeseydi kapsam ölçümü Rusçada hep sıfıra yakın çıkardı.
  const r = coverage(
    "Я читаю книгу в библиотеке",
    ["я", "читать", "книга", "в", "библиотека"],
    "cyrillic"
  );
  assert.equal(r.totalTokens, 5);
  assert.equal(r.knownTokens, 5);
  assert.deepEqual(r.unknown, []);
});

test("Rusça kapsam: defterde olmayan kelime bilinmeyen kalır", () => {
  const r = coverage("Я читаю газету", ["я", "читать"], "cyrillic");
  assert.deepEqual(r.unknown, ["газету"]);
});

// ---------------------------------------------------------------------------
// Latin: Almanca ß
// ---------------------------------------------------------------------------

test("Almanca: ß ile ss aynı kelimedir", () => {
  assert.ok(answersMatch("Straße", "strasse", "latin"));
  assert.ok(answersMatch("groß", "gross", "latin"));
});

test("Latin dillerde gövdeleme YOK — yanlış pozitif üretilmez", () => {
  assert.deepEqual(stemCandidates("livres", "latin"), ["livres"]);
});
