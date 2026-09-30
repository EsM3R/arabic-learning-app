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
  MASTER_ACCURACY,
  MASTER_SENTENCES,
  masteryStatus,
  nextPattern,
  normalizeBuildSet,
  reorderStep,
  THEMES,
  PATTERN_LADDER,
  patternsDueForReview,
  recordAttempt,
  toBand,
} from "../src/sentencebuilding.ts";
import type { BuildStep, ProgressMap } from "../src/sentencebuilding.ts";

const step = (target: string, alts: string[] = []): BuildStep => ({
  question: "",
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

test("yutulan ARTİKEL 'yakın' — ses tanıma gürültüsü, ceza yok ama doğrusu gösterilir", () => {
  const s = step("I wanted to go to the cinema with my friend.");
  assert.equal(checkStep(s, "I wanted to go to cinema with my friend", "latin"), "yakin");
});

test("eski '6+ kelimede tek fark = yakın' kuralı YOK: artikel dışı tek kelime farkı yanlıştır", () => {
  // Hocanın uyardığı fark tek kelimedir (with/by, ago/before); uzun cümlede
  // bile "yakın" sayılırsa yanlış kalıp oturur.
  const s = step("I wanted to go to the cinema with my friend.");
  assert.equal(checkStep(s, "I wanted to go to the cinema with my brother", "latin"), "yanlis");
  const bus = step("I sometimes go to work by metro with my friend.");
  assert.equal(checkStep(bus, "I sometimes go to work with metro with my friend", "latin"), "yanlis");
});

test("checkStep ince sarmalayıcı: dil, ses ve önceki adım checkAnswer'a geçer", () => {
  // Seste sesteş (buy → by) affedilir, yazıda affedilmez.
  const s = step("I go to work by bus");
  assert.equal(checkStep(s, "I go to work buy bus", "latin", { lang: "en", spoken: true }), "dogru");
  assert.equal(checkStep(s, "I go to work buy bus", "latin", { lang: "en" }), "yanlis");
  // Bu adımda eklenen kelime (early) düşerse yanlış.
  const e = step("I like to wake up early");
  assert.equal(checkStep(e, "I like to wake up", "latin", { prev: "I like to wake up" }), "yanlis");
  // Arapçada İngilizce tuzak yok; dile özgü tuzak var (araçta مَعَ).
  const ar = step("أَذْهَبُ إِلَى العَمَلِ بِالمِتْرُو");
  assert.equal(checkStep(ar, "اذهب الى العمل مع المترو", "arabic", { lang: "ar" }), "yanlis");
  assert.equal(checkStep(ar, "اذهب الى العمل بال مترو", "arabic"), "dogru");
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
  const d = normalizeBuildSet(null, "istek", "rutin");
  assert.equal(d.patternId, "istek");
  assert.equal(d.themeId, "rutin");
  assert.deepEqual(d.sentences, []);
});

test("videodaki cümle: çekirdekten dışarı, yapı taşı, karşıtlık, bağlacın yeri", () => {
  // Transkriptteki ikinci cümle, olduğu gibi.
  const d = normalizeBuildSet(
    {
      intro: "Günlük rutin — bağlaçlar",
      sentences: [
        {
          tr: "Kahvaltı yapmadan önce duş alırım.",
          steps: [
            { trPiece: "duş alırım", trSoFar: "duş alırım", target: "I take a shower", alts: ["I have a shower"] },
            { trPiece: "kahvaltı yapmadan önce", trSoFar: "Kahvaltı yapmadan önce duş alırım.", target: "Before I have breakfast, I take a shower." },
            { trPiece: "x", trSoFar: "x", target: "" },
          ],
          blocks: [
            { target: "before", tr: "-madan önce", note: "iki eylemi bağlar", contrast: "ago sadece 'önce' demek: three days ago", alts: [] },
            { target: "", tr: "boş" },
          ],
          reorder: "I take a shower before I have breakfast.",
        },
        { tr: "Tek adım.", steps: [{ trPiece: "a", trSoFar: "a", target: "A" }] },
      ],
    },
    "zaman-baglac",
    "rutin"
  );
  assert.equal(d.sentences.length, 1);
  const s0 = d.sentences[0];
  assert.equal(s0.steps.length, 2); // boş hedefli adım atıldı
  assert.deepEqual(s0.steps[0].alts, ["I have a shower"]);
  assert.equal(s0.blocks.length, 1);
  assert.match(s0.blocks[0].contrast, /ago/);
  assert.equal(reorderStep(s0)?.target, "I take a shower before I have breakfast.");
  // İki sıralama da doğru; ama bağlaç adımında İSTENEN öteki sıralama.
  assert.equal(checkStep(reorderStep(s0)!, "I take a shower before I have breakfast", "latin"), "dogru");
});

test("bağlaç yeri değişmeyen cümlede ek adım yok", () => {
  const d = normalizeBuildSet(
    { sentences: [{ tr: "a b", steps: [{ trSoFar: "a", target: "A" }, { trSoFar: "a b", target: "A B" }] }] },
    "olmak",
    "rutin"
  );
  assert.equal(reorderStep(d.sentences[0]), null);
});

test("her temanın hikâye akışı var", () => {
  assert.ok(THEMES.length >= 8);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  for (const t of THEMES) assert.ok(t.arc.split(",").length >= 4, t.id);
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

test("OTURMA ölçütü sıkı: en az 12 cümle ve %85 — birkaç şanslı doğru yetmez", () => {
  // Kullanıcının isteği: "tam kavradığımı çözsün".
  assert.ok(MASTER_SENTENCES >= 12);
  assert.ok(MASTER_ACCURACY >= 0.85);
  let m: ProgressMap = {};
  for (let i = 0; i < 5; i += 1) m = recordAttempt(m, "istek", "dogru", true);
  assert.equal(isMastered(m.istek), false);
});

test("oturma SON denemelere bakar — ilk günlerin yanlışları sonsuza kadar tutmaz", () => {
  let m: ProgressMap = {};
  for (let i = 0; i < 30; i += 1) m = recordAttempt(m, "istek", "yanlis", false); // başta zorlandı
  for (let i = 0; i < 20; i += 1) m = recordAttempt(m, "istek", "dogru", true); // sonra oturttu
  assert.equal(m.istek.correct / m.istek.attempts < 0.85, true); // toplam isabet düşük
  assert.equal(isMastered(m.istek), true); // ama son 20 kusursuz
});

test("eski doğrular unutulmuş kalıbı 'oturdu' göstermez", () => {
  let m: ProgressMap = {};
  for (let i = 0; i < 40; i += 1) m = recordAttempt(m, "istek", "dogru", true);
  for (let i = 0; i < 10; i += 1) m = recordAttempt(m, "istek", "yanlis", false);
  assert.equal(isMastered(m.istek), false);
});

test("ilerleme durumu ekrana hazır: kaç cümle, son isabet", () => {
  let m: ProgressMap = {};
  for (let i = 0; i < 10; i += 1) m = recordAttempt(m, "istek", i < 8 ? "dogru" : "yanlis", true);
  const st = masteryStatus(m.istek);
  assert.equal(st.sentences, 10);
  assert.equal(st.needSentences, MASTER_SENTENCES);
  assert.equal(st.accuracy, 0.8);
  assert.equal(masteryStatus(undefined).accuracy, null);
});
