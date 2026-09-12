/** Anlam müzakeresi: onarım tespiti, kapsam ve kasıtlı anlamama politikası. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATEGORY_LABEL,
  detectRepair,
  feignPolicy,
  kitBrief,
  REPAIR_CATEGORIES,
  REPAIR_GOAL,
  repairCoverage,
} from "../src/negotiation.ts";
import type { NegotiationKit } from "../src/negotiation.ts";

const fr: NegotiationKit = {
  phrases: [
    { category: "anlamadim", target: "Je n'ai pas compris", translit: "", tr: "anlamadım", register: "notr" },
    { category: "tekrar", target: "Tu peux répéter", translit: "", tr: "tekrar eder misin", register: "samimi" },
    { category: "yavas", target: "Moins vite", translit: "", tr: "daha yavaş", register: "samimi" },
    { category: "kelime_sor", target: "Comment on dit", translit: "", tr: "nasıl denir", register: "samimi" },
  ],
  fillers: [{ target: "euh", translit: "", tr: "şey" }],
  circumlocution: [{ target: "c'est le truc qui", translit: "", tr: "şu şey işte" }],
  teacherCue: "Pardon ? Je n'ai pas bien entendu.",
  turkishTrap: "Türkçedeki 'efendim?' birebir çevrilmez.",
};

const ar: NegotiationKit = {
  phrases: [
    { category: "anlamadim", target: "لم أفهم", translit: "lem efhem", tr: "anlamadım", register: "notr" },
    { category: "tekrar", target: "هل يمكنك الإعادة", translit: "hel yumkinuke'l-iade", tr: "tekrar eder misin", register: "notr" },
  ],
  fillers: [{ target: "يعني", translit: "yani", tr: "yani" }],
  circumlocution: [{ target: "الشيء الذي", translit: "eş-şey'ullezi", tr: "şu şey ki" }],
  teacherCue: "عفواً؟",
  turkishTrap: "—",
};

test("onarım hamlesi hedef yazımla yakalanır", () => {
  assert.deepEqual(detectRepair("Attends, je n'ai pas compris.", fr, "latin"), ["anlamadim"]);
});

test("aksan ve büyük harf farkı tespiti bozmaz", () => {
  assert.deepEqual(detectRepair("TU PEUX REPETER ?", fr, "latin"), ["tekrar"]);
});

test("birden fazla hamle varsa hepsi ve ÖĞRETİM SIRASINDA döner", () => {
  const out = detectRepair("Je n'ai pas compris, moins vite !", fr, "latin");
  assert.deepEqual(out, ["anlamadim", "yavas"]);
});

test("onarım yoksa boş döner — ölçüm şişmez", () => {
  assert.deepEqual(detectRepair("Hier je suis allé au marché avec mon frère.", fr, "latin"), []);
  assert.deepEqual(detectRepair("", fr, "latin"), []);
});

test("kelimenin İÇİNDE geçen parça hamle sayılmaz", () => {
  // Düz `includes` kullanılsaydı ölçüm şişer, öğrenci hiç onarım yapmadığı
  // hâlde "yapıyor" görünürdü.
  const kit: NegotiationKit = {
    ...fr,
    phrases: [{ category: "anlamadim", target: "quoi", translit: "", tr: "ne", register: "samimi" }],
  };
  assert.deepEqual(detectRepair("Le pourquoi de cette histoire", kit, "latin"), []);
  assert.deepEqual(detectRepair("Quoi ?", kit, "latin"), ["anlamadim"]);
});

test("Arap alfabesinde hareke farkı tespiti bozmaz", () => {
  assert.deepEqual(detectRepair("عفواً، لَمْ أَفْهَم", ar, "arabic"), ["anlamadim"]);
});

test("klavyesi olmayan öğrenci OKUNUŞLA yazsa da sayılır", () => {
  // Ölçüm klavyeye göre ayrım yapmamalı: okunuşla yazmak da gerçek bir
  // onarım hamlesidir.
  assert.deepEqual(detectRepair("hocam lem efhem", ar, "arabic"), ["anlamadim"]);
});

// --- kapsam ---------------------------------------------------------------

test("hiç onarım yapmamış öğrenci için uyarı serttir ve sebebini söyler", () => {
  const c = repairCoverage([]);
  assert.equal(c.fluentEnough, false);
  assert.deepEqual(c.used, []);
  assert.equal(c.missing.length, REPAIR_CATEGORIES.length);
  assert.match(c.summary, /HİÇ onarım hamlesi yapmadı/);
  assert.match(c.summary, /kilitlenmesinin/);
});

test("az sayıda hamle kullanan öğrenciye eksikleri sayılır", () => {
  const c = repairCoverage(["anlamadim", "tekrar"]);
  assert.equal(c.fluentEnough, false);
  assert.deepEqual(c.used, ["anlamadim", "tekrar"]);
  assert.match(c.summary, /yalnız 2 tanesini/);
  assert.match(c.summary, /ZORLA/);
});

test("hedefe ulaşan öğrenci rahat bırakılır", () => {
  const c = repairCoverage(REPAIR_CATEGORIES.slice(0, REPAIR_GOAL));
  assert.equal(c.fluentEnough, true);
  assert.match(c.summary, /oturmuş/);
  assert.doesNotMatch(c.summary, /ZORLA/);
});

test("bilinmeyen kategori kapsama sızmaz", () => {
  const c = repairCoverage(["anlamadim", "uydurma-kategori"]);
  assert.deepEqual(c.used, ["anlamadim"]);
});

test("her kategorinin Türkçe adı var", () => {
  for (const c of REPAIR_CATEGORIES) {
    assert.ok(CATEGORY_LABEL[c] && CATEGORY_LABEL[c].length > 0, `${c} etiketsiz`);
  }
});

// --- kasıtlı anlamama ------------------------------------------------------

test("kasıtlı anlamama sıklığı seviyeyle ARTAR", () => {
  // A1'de sık anlamamak cesaret kırar; B2'de hiç anlamamamak sahte güven üretir.
  const a1 = feignPolicy("A1").everyNTurns;
  const a2 = feignPolicy("A2").everyNTurns;
  const b1 = feignPolicy("B1").everyNTurns;
  const c1 = feignPolicy("C1").everyNTurns;
  assert.ok(a1 > a2 && a2 > b1 && b1 > c1, `${a1} ${a2} ${b1} ${c1}`);
});

test("her seviyede talimat dolu ve gerekçeli", () => {
  for (const lvl of ["A0", "A1", "A2", "B1", "B2", "C1", "C2"]) {
    const p = feignPolicy(lvl);
    assert.ok(p.everyNTurns >= 3 && p.everyNTurns <= 10, lvl);
    assert.ok(p.instruction.length > 40, `${lvl}: talimat zayıf`);
  }
});

test("başlangıç seviyesinde öğretmek sınamaktan önce gelir", () => {
  assert.match(feignPolicy("A1").instruction, /ÖĞRET/);
});

// --- prompt özeti ----------------------------------------------------------

test("araç çantası özeti kategori başına en fazla 2 kalıp taşır", () => {
  const kit: NegotiationKit = {
    ...fr,
    phrases: [
      { category: "tekrar", target: "A", translit: "", tr: "a", register: "samimi" },
      { category: "tekrar", target: "B", translit: "", tr: "b", register: "samimi" },
      { category: "tekrar", target: "C", translit: "", tr: "c", register: "samimi" },
    ],
  };
  const brief = kitBrief(kit, "latin");
  assert.ok(brief.includes("A"));
  assert.ok(brief.includes("B"));
  assert.ok(!brief.includes("C"), "üçüncü kalıp sızmış — panikteyken uzun liste hatırlanmaz");
});

test("özet okunuşu ve yardımcı kalıpları taşır", () => {
  const brief = kitBrief(ar, "arabic");
  assert.match(brief, /lem efhem/);
  assert.match(brief, /zaman kazanma/);
  assert.match(brief, /tarif etmeye başlama/);
});
