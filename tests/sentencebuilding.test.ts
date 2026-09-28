/**
 * Cümle kurma — saf mantık.
 *
 * Bu bölümde öğrencinin gördüğü tek geri bildirim "doğru / değil". Denetim
 * fazla katıysa ("I'm" yazana "I am" bekliyoruz diye yanlış demek) öğrenci
 * doğru konuştuğu hâlde cezalanır ve yöntemden soğur; fazla gevşekse yanlış
 * kalıp oturur. Testlerin çoğu bu dengeyi tutuyor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonical,
  checkStep,
  isMastered,
  ladderSummary,
  MASTER_SENTENCES,
  nextPattern,
  normalizeDrillSet,
  PATTERN_LADDER,
  patternsDueForReview,
  recordAttempt,
  toBand,
} from "../src/sentencebuilding.ts";
import type { BuildStep, ProgressMap } from "../src/sentencebuilding.ts";

const step = (target: string, alts: string[] = []): BuildStep => ({
  trPiece: "x",
  trSoFar: "x",
  target,
  alts,
  translit: "",
  note: "",
});

// --- merdiven ------------------------------------------------------------------

test("merdiven benzersiz, dolu ve kolaydan zora sıralı", () => {
  const ids = PATTERN_LADDER.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(PATTERN_LADDER.length >= 40);
  const order = ["A1", "A2", "B1", "B2", "C1"];
  for (let i = 1; i < PATTERN_LADDER.length; i += 1) {
    assert.ok(order.indexOf(PATTERN_LADDER[i].band) >= order.indexOf(PATTERN_LADDER[i - 1].band));
  }
  for (const p of PATTERN_LADDER) assert.ok(p.concept.length > 10, p.id);
});

test("seviye bandı güvenli okunur", () => {
  assert.equal(toBand("A0"), "A1");
  assert.equal(toBand(undefined), "A1");
  assert.equal(toBand("B2"), "B2");
  assert.equal(toBand("C2"), "C1");
});

// --- denetim ---------------------------------------------------------------------

test("büyük/küçük harf ve noktalama farkı YANLIŞ sayılmaz", () => {
  assert.equal(checkStep(step("I wanted to go."), "i wanted to go", "latin"), "dogru");
});

test("kısaltma ile açık hâl AYNI cevaptır", () => {
  // "I'm" diyene "I am bekliyordum" demek, doğru konuşanı cezalandırmak olur.
  assert.equal(checkStep(step("I am tired."), "I'm tired", "latin"), "dogru");
  assert.equal(checkStep(step("I don't want to go."), "I do not want to go", "latin"), "dogru");
  assert.equal(checkStep(step("I can't swim."), "I cannot swim", "latin"), "dogru");
  assert.equal(checkStep(step("She's at home."), "she is at home", "latin"), "dogru");
  assert.equal(canonical("I’m", "latin"), canonical("I am", "latin")); // kıvrık kesme işareti
});

test("kabul edilen ALTERNATİF de doğrudur", () => {
  const s = step("Last night I wanted to go to the cinema.", ["I wanted to go to the cinema last night."]);
  assert.equal(checkStep(s, "I wanted to go to the cinema last night", "latin"), "dogru");
});

test("uzun cümlede TEK kelime farkı 'yakın' — ceza yok ama doğrusu gösterilir", () => {
  const s = step("I wanted to go to the cinema with my friend.");
  assert.equal(checkStep(s, "I wanted to go to cinema with my friend", "latin"), "yakin");
});

test("kısa cümlede tek kelime farkı yakın SAYILMAZ — kalıp o kelimedir", () => {
  // "I want to go" ile "I want go" arasındaki fark tam da öğretilen şey.
  assert.equal(checkStep(step("I want to go."), "I want go", "latin"), "yanlis");
});

test("iki kelime farkı yanlıştır; boş cevap yanlıştır", () => {
  const s = step("I wanted to go to the cinema with my friend.");
  assert.equal(checkStep(s, "I want go to the cinema with my friend", "latin"), "yanlis");
  assert.equal(checkStep(s, "   ", "latin"), "yanlis");
});

test("Arap yazısında hareke farkı yanlış sayılmaz", () => {
  assert.equal(checkStep(step("أُرِيدُ أَنْ أَذْهَبَ"), "اريد ان اذهب", "arabic"), "dogru");
});

// --- model çıktısı ------------------------------------------------------------------

test("bozuk model çıktısı ÇÖKERTMEZ", () => {
  const d = normalizeDrillSet(null, "istek");
  assert.equal(d.patternId, "istek");
  assert.deepEqual(d.sentences, []);
  assert.deepEqual(d.examples, []);
});

test("hedefi boş adım atılır; tek adımlı cümle bırakılmaz", () => {
  // Boş hedefle karşılaştırma her cevabı yanlış sayardı; tek adımlı cümlede
  // parça parça kurmanın anlamı kalmaz.
  const d = normalizeDrillSet(
    {
      formula: "I want to + fiil",
      sentences: [
        {
          tr: "Eve gitmek istiyorum.",
          steps: [
            { trPiece: "istiyorum", trSoFar: "istiyorum", target: "I want" },
            { trPiece: "gitmek", trSoFar: "gitmek istiyorum", target: "I want to go", alts: ["I wanna go", 5] },
            { trPiece: "eve", trSoFar: "eve gitmek istiyorum", target: "" },
          ],
        },
        { tr: "Tek adım.", steps: [{ trPiece: "a", trSoFar: "a", target: "A" }] },
        { tr: "", steps: [] },
      ],
      examples: [{ target: "I want to eat.", tr: "Yemek istiyorum." }, { target: "", tr: "x" }],
    },
    "istek"
  );
  assert.equal(d.sentences.length, 1);
  assert.equal(d.sentences[0].steps.length, 2);
  assert.deepEqual(d.sentences[0].steps[1].alts, ["I wanna go"]);
  assert.equal(d.examples.length, 1);
  assert.equal(d.formula, "I want to + fiil");
});

// --- ilerleme -----------------------------------------------------------------------

test("kalıp ancak yeterince cümle ve yüksek isabetle OTURMUŞ sayılır", () => {
  let m: ProgressMap = {};
  for (let i = 0; i < MASTER_SENTENCES; i += 1) m = recordAttempt(m, "olmak", "dogru", true);
  assert.equal(isMastered(m.olmak), true);

  let low: ProgressMap = {};
  for (let i = 0; i < MASTER_SENTENCES; i += 1) low = recordAttempt(low, "olmak", "yanlis", true);
  assert.equal(isMastered(low.olmak), false); // çok cümle ama isabet düşük

  let few: ProgressMap = {};
  few = recordAttempt(few, "olmak", "dogru", true);
  assert.equal(isMastered(few.olmak), false); // isabet yüksek ama tek cümle
});

test("'yakın' cevap doğru sayılır — tek kelimelik kayma çoğu zaman ses tanımadan", () => {
  const m = recordAttempt({}, "istek", "yakin", false);
  assert.equal(m.istek.correct, 1);
});

test("sıradaki kalıp oturmamış İLK basamaktır", () => {
  assert.equal(nextPattern({}).id, PATTERN_LADDER[0].id);
  let m: ProgressMap = {};
  for (let i = 0; i < MASTER_SENTENCES; i += 1) m = recordAttempt(m, PATTERN_LADDER[0].id, "dogru", true);
  assert.equal(nextPattern(m).id, PATTERN_LADDER[1].id);
});

test("uzun süre çalışılmayan oturmuş kalıp TEKRARA gelir", () => {
  let m: ProgressMap = {};
  const old = new Date("2026-09-01T00:00:00Z");
  for (let i = 0; i < MASTER_SENTENCES; i += 1) m = recordAttempt(m, "olmak", "dogru", true, old);
  const now = new Date("2026-09-20T00:00:00Z");
  assert.deepEqual(patternsDueForReview(m, now).map((p) => p.id), ["olmak"]);
  assert.deepEqual(patternsDueForReview(m, new Date("2026-09-03T00:00:00Z")), []);
});

test("merdiven özeti bant bant sayar", () => {
  let m: ProgressMap = {};
  for (let i = 0; i < MASTER_SENTENCES; i += 1) m = recordAttempt(m, "olmak", "dogru", true);
  const a1 = ladderSummary(m).find((b) => b.band === "A1")!;
  assert.equal(a1.done, 1);
  assert.ok(a1.total > 5);
});
