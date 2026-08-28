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
  normalizeTranslit,
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
  assert.ok(answersMatch("مَرْحَبًا", "مرحبا", true));
  assert.ok(answersMatch("شو أخبارك؟", "شو اخبارك", true));
  assert.ok(!answersMatch("مرحبا", "شكرا", true));
});

test("answersMatch: Latin dillerde aksan/büyük harf esner", () => {
  assert.ok(answersMatch("¿Cómo estás?", "como estas", false));
  assert.ok(!answersMatch("good morning", "good night", false));
});

test("answersMatch: boş beklenen asla eşleşmez", () => {
  assert.ok(!answersMatch("", "", true));
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
  const r = coverage("رحت عالسوق واشتريت خضرة", known, true);
  // رحت/اشتريت çekimleri gövdeyle eşleşmez (kabul edilen sınır) ama
  // عالسوق ve خضرة eşleşir; oran hesaplanabilir olmalı.
  assert.equal(r.totalTokens, 4);
  assert.ok(r.knownTokens >= 2);
  assert.ok(r.unknown.length <= 2);
});

test("coverage: çok kelimeli defter kalıbı kelimelerine açılır", () => {
  const r = coverage("صباح الخير يا استاذ", ["صباح الخير"], true);
  assert.ok(r.knownTokens >= 2);
});

test("coverage: Latin dilde birebir token eşleşmesi", () => {
  const r = coverage("I went to the market", ["go", "market", "the"], false);
  assert.equal(r.totalTokens, 5);
  assert.equal(r.knownTokens, 2); // the + market ("went" ≠ "go", "i"/"to" bilinmiyor)
});

test("coverage: boş metin 1.0 döner", () => {
  assert.equal(coverage("", ["x"], true).ratio, 1);
});

test("normalizeTranslit: Türkçe gösterim, İngiliz tarzı ve chat alfabesi eşleşir", () => {
  assert.equal(normalizeTranslit("şu ahbārak?"), normalizeTranslit("shu akhbarak"));
  assert.equal(normalizeTranslit("mar7aba"), normalizeTranslit("marhaba"));
  assert.equal(normalizeTranslit("ma'a"), normalizeTranslit("maa"));
  assert.equal(normalizeTranslit("kapı"), "kapi");
});

test("matchProduction: hedef yazım > translit > none", () => {
  assert.equal(matchProduction("مرحبا", "merhaba", "مَرْحَبًا", true), "target");
  assert.equal(matchProduction("مرحبا", "merhaba", "merhaba", true), "translit");
  assert.equal(matchProduction("مرحبا", "merhaba", "şükran", true), "none");
  assert.equal(matchProduction("مرحبا", "merhaba", "  ", true), "none");
});

test("matchProduction: Latin dilde translit yolu kapalı, hedef eşleşmesi esnek", () => {
  assert.equal(matchProduction("good morning", "gud morning", "gud morning", false), "none");
  assert.equal(matchProduction("¿Cómo estás?", "", "como estas", false), "target");
});
