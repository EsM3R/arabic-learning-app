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
import {
  arcRoles,
  blockKey,
  compileSentence,
  connSeq,
  connSeqLine,
  fadeSteps,
  isPermutation,
  LEGACY_PATTERN_IDS,
  normalizeSentence,
  placeholderSentence,
  rankThemes,
  setSize,
  trKey,
  upgradeSetV1,
  validatePlan,
} from "../src/sentencebuilding.ts";
import type { BuildSentence, BuildSet, Card, NormalizeStores, SetPlan } from "../src/sentencebuilding.ts";
import type { BuildStep, ProgressMap } from "../src/sentencebuilding.ts";
import { checkAnswer } from "../src/buildcheck.ts";
import { readFileSync } from "node:fs";

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
  const order = ["A1", "A2", "B1", "B2", "C1", "C2"];
  for (let i = 1; i < PATTERN_LADDER.length; i += 1) {
    assert.ok(order.indexOf(PATTERN_LADDER[i].band) >= order.indexOf(PATTERN_LADDER[i - 1].band));
  }
  for (const p of PATTERN_LADDER) assert.ok(p.concept.length > 10, p.id);
});

test("seviye bandı güvenli okunur", () => {
  assert.equal(toBand("A0"), "A1");
  assert.equal(toBand(undefined), "A1");
  assert.equal(toBand("B2"), "B2");
  assert.equal(toBand("C2"), "C2"); // merdiven artık C2'ye kadar
  assert.equal(toBand("c1"), "C1");
  assert.equal(toBand("Z9"), "A1");
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

// ===========================================================================
// v2 — plan, cihazda toparlama, kart sırası, v1 dönüşümü
// ===========================================================================

const fx = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

/** Videonun sekiz cümlesi (A2, İngilizce), modelin plan çıktısı biçiminde. */
const EN_PLAN_RAW = {
  intro: "Günlük rutin",
  ozet: "Sabahtan geceye bir gün",
  tense: "habit",
  s: [
    { tr: "Sabahları erken uyanmayı seviyorum.", r: "open", new: ["like to", "wake up", "early", "in the morning"], focus: true, fn: true },
    { tr: "Kahvaltı yapmadan önce duş alırım.", r: "build", conn: { k: "sub", tr: "-madan önce", t: "before", p1: "kahvaltı yapmak", p2: "duş almak" }, new: ["before", "have breakfast", "take a shower"], focus: true },
    { tr: "Dişlerimi fırçaladıktan sonra evden çıkarım.", r: "build", conn: { k: "sub", tr: "-dıktan sonra", t: "after" }, new: ["after", "brush my teeth", "leave home"] },
    { tr: "Bazen işe metroyla giderim ama sıklıkla işe otobüsle gitmeyi tercih ediyorum.", r: "peak", conn: { k: "coord", tr: "ama", t: "but" }, new: ["sometimes", "go to work", "by metro", "but", "prefer going", "often"] },
    { tr: "Saat 7 gibi işten çıkıyorum.", r: "dip", new: ["at around 7 PM"], rec: ["leave"], sys: "clock12" },
    { tr: "Eve vardığımda televizyonu açıyorum.", r: "build", conn: { k: "sub", tr: "-dığımda", t: "when" }, new: ["when", "turn on the TV"] },
    { tr: "çünkü haber izlemeyi seviyorum", r: "extension", conn: { k: "causal", tr: "çünkü", t: "because" }, new: ["because", "like watching"] },
    { tr: "Saat 10 gibi yatağa girerim.", r: "synthesis", new: ["go to bed"], rec: ["at around"], focus: true },
  ],
};

const EN_RAW: unknown[] = [
  {
    steps: [
      { q: "Kim seviyor?", p: "seviyorum", t: "I like" },
      { q: "Neyi seviyorum?", p: "uyanmayı", t: "I like to wake up", n: "-mayı ekini to ile veririz." },
      { q: "Nasıl uyanmayı seviyorum?", p: "erken", t: "I like to wake up early" },
      { q: "Ne zaman?", p: "Sabahları", t: "I like to wake up early in the morning.", n: "Kalıp: in the morning, hep böyle." },
    ],
    blocks: [
      { t: "to wake up", tr: "uyanmayı", k: "suffix", s: 1, n: "-mayı → to", a: ["waking up"] },
      { t: "early", tr: "erken", k: "adverb", s: 2, pair: { t: "late", tr: "geç" } },
      { t: "in the morning", tr: "sabahları", k: "chunk", s: 3, n: "kalıp", c: "on the morning değil" },
    ],
  },
  {
    steps: [
      { p: "yapmadan önce", t: "Before" },
      { q: "Kim kahvaltı yapacak?", p: "Kahvaltı", t: "Before I have breakfast", e: 1 },
      { q: "Ne yaparım?", p: "duş alırım", t: "Before I have breakfast, I take a shower." },
    ],
    blocks: [
      { t: "before", tr: "-madan önce", k: "connector", s: 0 },
      { t: "have breakfast", tr: "kahvaltı yapmak", k: "chunk", s: 1 },
      { t: "take a shower", tr: "duş almak", k: "chunk", s: 2, a: ["have a shower"] },
    ],
  },
  {
    steps: [
      { p: "fırçaladıktan sonra", t: "After" },
      { q: "Kim fırçalayacak?", p: "Dişlerimi", t: "After I brush my teeth", e: 1 },
      { q: "Ne yaparım?", p: "evden çıkarım", t: "After I brush my teeth, I leave home.", n: "çıkmak = ayrılmak → leave" },
    ],
    blocks: [
      { t: "after", tr: "-dıktan sonra", k: "connector", s: 0 },
      { t: "brush my teeth", tr: "dişlerimi fırçalamak", k: "chunk", s: 1 },
      { t: "leave home", tr: "evden çıkmak", k: "chunk", s: 2, x: { t: "I leave the hospital", tr: "Hastaneden çıkarım" } },
    ],
    reorder: "I leave home after I brush my teeth.",
  },
  {
    steps: [
      { q: "Kim, ne sıklıkla?", p: "Bazen … giderim", t: "I sometimes go" },
      { q: "Nereye?", p: "işe", t: "I sometimes go to work" },
      { q: "Nasıl?", p: "metroyla", t: "I sometimes go to work by metro", e: 1 },
      { p: "ama", t: "I sometimes go to work by metro, but" },
      { q: "Kim tercih ediyor?", p: "tercih ediyorum", t: "I sometimes go to work by metro, but I prefer" },
      { q: "Neyi?", p: "gitmeyi", t: "I sometimes go to work by metro, but I prefer going" },
      { q: "Nereye?", p: "işe", t: "I sometimes go to work by metro, but I prefer going to work" },
      { q: "Nasıl?", p: "otobüsle", t: "I sometimes go to work by metro, but I prefer going to work by bus" },
      { q: "Ne sıklıkla?", p: "sıklıkla", t: "I sometimes go to work by metro, but I often prefer going to work by bus." },
    ],
    blocks: [
      { t: "sometimes", tr: "bazen", k: "adverb", s: 0, a: ["from time to time"] },
      { t: "by metro", tr: "metroyla", k: "caseSplit", s: 2 },
      { t: "but", tr: "ama", k: "connector", s: 3 },
      { t: "prefer going", tr: "gitmeyi tercih etmek", k: "complement", s: 5 },
      { t: "often", tr: "sıklıkla", k: "adverb", s: 8, a: ["frequently"] },
    ],
    sw: [[", but", ". However,"]],
    reorder: "But I often prefer going to work by bus, I sometimes go to work by metro.",
  },
  {
    steps: [
      { q: "Kim çıkıyor?", p: "çıkıyorum", t: "I leave", n: "çıkmak = ayrılmak, terk etmek → leave" },
      { q: "Nereden?", p: "işten", t: "I leave work" },
      { q: "Ne zaman?", p: "Saat 7 gibi", t: "I leave work at around 7 PM.", n: "gibi = civarında → around" },
    ],
    blocks: [{ t: "at around 7 PM", tr: "saat 7 gibi", k: "rule", s: 2, a: ["at about 7 PM"] }],
  },
  {
    steps: [
      { p: "vardığımda", t: "When" },
      { q: "Kim varıyor?", p: "Eve", t: "When I arrive at home", e: 1 },
      { q: "Ne yaparım?", p: "televizyonu açıyorum", t: "When I arrive at home, I turn on the TV." },
    ],
    blocks: [
      { t: "when", tr: "-dığımda", k: "connector", s: 0 },
      { t: "turn on the TV", tr: "televizyonu açmak", k: "chunk", s: 2, pair: { t: "turn off the TV", tr: "televizyonu kapatmak" } },
    ],
    reorder: "I turn on the TV when I arrive at home.",
  },
  {
    steps: [
      { p: "çünkü", t: "because" },
      { q: "Kim seviyor?", p: "seviyorum", t: "because I like" },
      // Model önceki cümleyi yine de yazdı: cihaz öneki bir kez tutar.
      { q: "Neyi seviyorum?", p: "izlemeyi", t: "When I arrive at home, I turn on the TV because I like watching" },
      { q: "Neyi izlemeyi?", p: "haber", t: "because I like watching news." },
    ],
    blocks: [
      { t: "because", tr: "çünkü", k: "connector", s: 0 },
      { t: "like watching", tr: "izlemeyi sevmek", k: "complement", s: 2, a: ["like to watch"] },
    ],
    reorder: "Because I like watching news, when I arrive at home I turn on the TV.",
  },
  {
    steps: [
      { q: "Kim gider?", p: "girerim", t: "I go to bed" },
      { q: "Ne zaman?", p: "Saat 10 gibi", t: "I go to bed at around 10 PM." },
    ],
    blocks: [{ t: "go to bed", tr: "yatağa girmek", k: "chunk", s: 0 }],
  },
];

const AR_PLAN_RAW = {
  intro: "Günlük rutin",
  s: [
    { tr: "Sabahları erken uyanmayı seviyorum.", r: "open", new: ["أَنْ أَسْتَيْقِظَ", "مُبَكِّرًا", "فِي الصَّبَاحِ"], focus: true, fn: true },
    { tr: "Kahvaltı yapmadan önce duş alırım.", r: "build", conn: { k: "sub", tr: "-madan önce", t: "قَبْلَ أَنْ", p1: "kahvaltı yapmak", p2: "duş almak" }, new: ["قَبْلَ أَنْ"], focus: true },
    { tr: "Dişlerimi fırçaladıktan sonra evden çıkarım.", r: "build", conn: { k: "sub", tr: "-dıktan sonra", t: "بَعْدَ أَنْ" }, new: [] },
    { tr: "Bazen işe metroyla giderim ama sıklıkla işe otobüsle gitmeyi tercih ediyorum.", r: "peak", conn: { k: "coord", tr: "ama", t: "لَكِنَّ" }, new: [], focus: true },
    { tr: "Saat 7 gibi işten çıkıyorum.", r: "dip", new: [], sys: "saat-sira" },
    { tr: "Eve vardığımda televizyonu açıyorum.", r: "build", conn: { k: "sub", tr: "-dığımda", t: "عِنْدَمَا" }, new: [] },
    { tr: "çünkü haber izlemeyi seviyorum", r: "extension", conn: { k: "causal", tr: "çünkü", t: "لِأَنَّ" }, new: [] },
    { tr: "Saat 10 gibi yatağa girerim.", r: "synthesis", new: [] },
  ],
};

const enPlan = (band: "A2" | "B1" | "B2" = "A2"): SetPlan => validatePlan(EN_PLAN_RAW, 8, { lang: "en", band }).plan;
const arPlan = (): SetPlan => validatePlan(AR_PLAN_RAW, 8, { lang: "ar", band: "A2" }).plan;

/** Cümleleri sırayla toparlar (üretim hattının yaptığı gibi: her cümle öncekileri görür). */
function buildAll(plan: SetPlan, raws: unknown[], lang: "en" | "ar" | "de", stores: NormalizeStores): BuildSentence[] {
  const built: BuildSentence[] = [];
  plan.sentences.forEach((sp, k) => {
    built.push(k < raws.length ? normalizeSentence(raws[k], plan, k, built, lang, stores) : placeholderSentence(sp));
  });
  return built;
}

const mkSet = (plan: SetPlan, sentences: BuildSentence[], lang: "en" | "ar" | "de", level: BuildSet["level"] = "A2"): BuildSet => ({
  v: 2,
  id: "t",
  patternId: "zaman-baglac",
  themeId: "rutin",
  lang,
  level,
  tense: "habit",
  episode: 1,
  intro: plan.intro,
  plan,
  sentences,
  createdAt: "2026-09-01T00:00:00.000Z",
});

const kinds = (cards: Card[]) => cards.map((c) => (c.t === "step" ? `step${c.i}` : c.t === "system" ? `system-${c.part}` : c.t));

// --- merdiven v2 ------------------------------------------------------------------

test("merdiven v2: eski 48 kimlik korunur, yeni basamaklar ve C2 eklenir", () => {
  assert.equal(LEGACY_PATTERN_IDS.length, 48);
  const ids = new Set(PATTERN_LADDER.map((p) => p.id));
  for (const id of LEGACY_PATTERN_IDS) assert.ok(ids.has(id), `eski kimlik kayıp: ${id}`);
  for (const id of ["belirtme", "yon-yer", "vasita", "iyelik", "siklik", "saat", "tercih", "diginda", "digindan-beri", "ken", "ana-kadar", "digi-icin", "arak", "ir-maz", "sa-bile", "digi-halde", "sadece-degil", "sartiyla", "kayit-cifti", "ihtiyat", "edebi-baglac", "deyim-ileri", "anlati-iki-ton"]) {
    assert.ok(ids.has(id), `yeni basamak yok: ${id}`);
  }
  assert.ok(PATTERN_LADDER.some((p) => p.band === "C2"));
});

test("merdiven v2: her kalıbın tetiği, sorusu, bağlaç türü ve yerleşimi var", () => {
  for (const p of PATTERN_LADDER) {
    assert.ok(p.trigger.length > 0, `${p.id} tetik`);
    assert.equal(typeof p.question, "string", `${p.id} soru`);
    assert.ok(["sub", "coord", "causal", "none"].includes(p.conn), `${p.id} conn`);
    assert.ok(["narrative", "dialogue"].includes(p.placement), `${p.id} placement`);
    for (const v of Object.values(p.map ?? {})) assert.ok(v.length <= 60, `${p.id} map çok uzun: ${v}`);
  }
  // Videonun kalıpları hocanın sorularını taşır.
  assert.equal(PATTERN_LADDER.find((p) => p.id === "sevmek")?.question, "Neyi seviyorum?");
  assert.equal(PATTERN_LADDER.find((p) => p.id === "zaman-baglac")?.conn, "sub");
  assert.equal(PATTERN_LADDER.find((p) => p.id === "rica")?.placement, "dialogue");
  assert.equal(PATTERN_LADDER.find((p) => p.id === "gecmis")?.tense, "past");
  assert.ok(PATTERN_LADDER.filter((p) => p.probe).length >= 10);
});

test("temalar v2: seviye, zaman çerçevesi ve sahneler; arc = sahneler", () => {
  for (const t of THEMES) {
    assert.ok(t.bands.length > 0, t.id);
    assert.ok(["habit", "now", "past", "future", "mixed"].includes(t.tense), t.id);
    assert.ok(t.stages.length >= 4, t.id);
    assert.equal(t.arc, t.stages.join(", "));
  }
  for (const id of ["is-kriz", "haber", "tartisma", "iki-uslup"]) assert.ok(THEMES.some((t) => t.id === id), id);
  // Uygun tema öne gelir ama hiçbiri gizlenmez.
  const gecmis = PATTERN_LADDER.find((p) => p.id === "gecmis")!;
  const ranked = rankThemes(gecmis);
  assert.equal(ranked.length, THEMES.length);
  assert.equal(ranked[0].tense === "past" || ranked[0].tense === "mixed", true);
  assert.ok(ranked.indexOf(THEMES.find((t) => t.id === "iki-uslup")!) > ranked.indexOf(THEMES.find((t) => t.id === "tatil")!));
});

test("yeni basamak, oturmuş kalıbın altındaysa dayatılmaz", () => {
  let m: ProgressMap = {};
  for (const id of ["olmak", "var-yok", "sahip", "genis-zaman", "istek"]) {
    for (let i = 0; i < MASTER_SENTENCES; i += 1) m = recordAttempt(m, id, "dogru", true);
  }
  // belirtme…saat "istek"in altında kalır → atlanır; sıradaki eski basamak gelir.
  assert.equal(nextPattern(m).id, "olumsuz");
  // Hiç oturmamışken yeni A1 basamakları yerinde durur.
  let n: ProgressMap = {};
  for (const id of ["olmak", "var-yok", "sahip", "genis-zaman"]) {
    for (let i = 0; i < MASTER_SENTENCES; i += 1) n = recordAttempt(n, id, "dogru", true);
  }
  assert.equal(nextPattern(n).id, "belirtme");
});

// --- roller ve bağlaç dizisi ---------------------------------------------------------

test("arcRoles: 6, 7 ve 8 cümlede çukur, uzatma ve sentez hep var", () => {
  for (const n of [6, 7, 8]) {
    const r = arcRoles(n);
    assert.equal(r.length, n);
    assert.equal(r[0], "open");
    assert.equal(r[n - 1], "synthesis");
    assert.equal(r[n - 2], "extension");
    assert.ok(r.includes("dip") && r.includes("peak"), `n=${n}`);
    assert.equal(r.indexOf("dip"), r.indexOf("peak") + 1, "çukur zirveden hemen sonra");
  }
  assert.deepEqual(arcRoles(8), ["open", "build", "build", "peak", "dip", "build", "extension", "synthesis"]);
  assert.equal(setSize("A2"), 8);
  assert.equal(setSize("C2"), 6);
});

test("connSeq: A2 videonun sırası; A1 uzatması ve/sonra; odak bağlacı kendi yuvasını alır", () => {
  assert.equal(
    connSeqLine(connSeq("A2", 8)),
    "— · -madan önce · -dıktan sonra · ama · — · -dığımda · çünkü · sentez (sette öğretilmiş bir bağlaç geri gelebilir)"
  );
  const a1 = connSeq("A1", 6);
  assert.deepEqual(a1.map((s) => s.kind), ["none", "none", "coord", "none", "coord", "none"]);
  assert.equal(a1[4].tr, "ve / sonra");
  assert.ok(a1[4].linked);
  const b2 = connSeq("B2", 6);
  assert.deepEqual(b2.map((s) => s.tr), ["", "-masına rağmen", "ancak / oysa", "", "-dığı için", ""]);
  const ken = PATTERN_LADDER.find((p) => p.id === "ken")!;
  const b1 = connSeq("B1", 7, [ken]);
  assert.equal(b1[1].tr, "-ken");
  assert.ok(connSeq("A2", 8)[2].mirror);
  assert.ok(connSeq("A2", 8)[4].sys);
});

// --- validatePlan -------------------------------------------------------------------

test("validatePlan: roller konuma göre zorlanır, ikinci bağlaç atılır", () => {
  const v = validatePlan(
    {
      intro: "x",
      s: [
        { tr: "A bir.", r: "peak", new: ["a"] },
        { tr: "B iki.", r: "open", conn: [{ k: "sub", tr: "-madan önce", t: "before" }, { k: "coord", tr: "ama", t: "but" }], new: ["b"] },
        { tr: "C üç.", r: "open", new: ["c"] },
        { tr: "D dört.", r: "open", new: ["d"] },
        { tr: "E beş.", r: "open", new: ["e"] },
        { tr: "F altı.", r: "open", new: ["f"] },
      ],
    },
    6,
    { lang: "en", band: "A2" }
  );
  assert.deepEqual(v.plan.sentences.map((s) => s.role), arcRoles(6));
  assert.equal(v.plan.sentences[1].conn?.t, "before");
  assert.equal(v.plan.sentences[1].conn?.k, "sub");
});

test("validatePlan: sentezde YENİ bağlaç atılır, setteki bağlaç geri gelebilir; en fazla 2 yeni taş", () => {
  const base = (synthConn: { k: string; tr: string; t: string }) =>
    validatePlan(
      {
        s: [
          { tr: "Bir.", new: ["a"] },
          { tr: "Kahvaltı yapmadan önce duş alırım.", conn: { k: "sub", tr: "-madan önce", t: "before" }, new: ["before"] },
          { tr: "Üç.", new: ["c"] },
          { tr: "Dört.", new: ["d"] },
          { tr: "çünkü beş", conn: { k: "causal", tr: "çünkü", t: "because" }, new: ["because"] },
          { tr: "Uyumadan önce dişlerimi fırçalarım.", conn: synthConn, new: ["x", "y", "z"] },
        ],
      },
      6,
      { lang: "en", band: "A2" }
    ).plan.sentences[5];
  const recycled = base({ k: "sub", tr: "-madan önce", t: "Before" });
  assert.equal(recycled.role, "synthesis");
  assert.equal(recycled.conn?.t, "Before");
  assert.equal(recycled.new.length, 2);
  const fresh = base({ k: "sub", tr: "-dığımda", t: "when" });
  assert.equal(fresh.conn, undefined);
});

test("validatePlan: tekrar eden 'yeni' taş sonraki cümlelerde 'geri gelen' olur", () => {
  const v = validatePlan(
    { s: [{ tr: "Bir.", new: ["leave home"] }, { tr: "İki.", new: ["Leave home", "at 7"] }, { tr: "Üç.", new: [] }] },
    3,
    { lang: "en", band: "A2" }
  );
  assert.deepEqual(v.plan.sentences[0].new, ["leave home"]);
  assert.deepEqual(v.plan.sentences[1].new, ["at 7"]);
  assert.deepEqual(v.plan.sentences[1].rec, ["Leave home"]);
});

test("validatePlan: ilk cümlede 'çünkü' bağlanamaz; uzatma bağlacı çünkü olur (A1'de ve/sonra kalır)", () => {
  const raw = {
    s: [
      { tr: "Çünkü bir.", conn: { k: "causal", tr: "çünkü", t: "because" }, new: [] },
      { tr: "İki.", new: [] },
      { tr: "Üç.", new: [] },
      { tr: "Dört.", new: [] },
      { tr: "sonra beş", conn: { k: "coord", tr: "ve / sonra", t: "and then" }, new: [] },
      { tr: "Altı.", new: [] },
    ],
  };
  const a2 = validatePlan(raw, 6, { lang: "en", band: "A2" }).plan.sentences;
  assert.equal(a2[0].conn, undefined);
  assert.equal(a2[4].conn?.k, "causal");
  const a1 = validatePlan(raw, 6, { lang: "en", band: "A1" }).plan.sentences;
  assert.equal(a1[4].conn?.k, "coord");
  // Bağlaçsız uzatma "çünkü" ile başlıyorsa bağlaç koddan gelir.
  const bare = validatePlan({ s: [{ tr: "a" }, { tr: "b" }, { tr: "çünkü c" }, { tr: "d" }] }, 4, { lang: "ar", band: "A2" }).plan.sentences;
  assert.equal(bare[2].role, "extension");
  assert.equal(bare[2].conn?.k, "causal");
  assert.equal(bare[2].conn?.t, "لِأَنَّ");
});

test("validatePlan: tek sistem dersi, bilinen kimlik, çukura taşınır", () => {
  const v = validatePlan(
    {
      s: [
        { tr: "Bir.", sys: "yok-boyle-ders" },
        { tr: "İki.", sys: "saat-sira" },
        { tr: "Üç.", sys: "ikil" },
        { tr: "Dört." },
        { tr: "Beş." },
        { tr: "Altı." },
      ],
    },
    6,
    { lang: "ar", band: "A2" }
  );
  const withSys = v.plan.sentences.filter((s) => s.sys);
  assert.equal(withSys.length, 1);
  assert.equal(withSys[0].role, "dip");
  assert.equal(withSys[0].sys, "saat-sira");
  // Arapçada İngilizce sistem (clock12) geçersiz.
  const en = validatePlan({ s: [{ tr: "a", sys: "clock12" }, { tr: "b" }, { tr: "c" }, { tr: "d" }, { tr: "e" }, { tr: "f" }] }, 6, { lang: "ar", band: "A2" });
  assert.equal(en.plan.sentences.some((s) => s.sys), false);
});

test("validatePlan: tarihçedeki cümle tekrarlanmaz; 1'den fazlası yeniden plan ister", () => {
  const raw = { s: [{ tr: "Sabahları erken uyanırım." }, { tr: "Duş alırım." }, { tr: "Kahvaltı yaparım." }] };
  const one = validatePlan(raw, 3, { lang: "en", band: "A2", trKeys: [trKey("sabahları erken uyanırım")] });
  assert.deepEqual(one.dropped, ["Sabahları erken uyanırım."]);
  assert.equal(one.replan, false);
  assert.equal(one.plan.sentences.length, 2);
  const two = validatePlan(raw, 3, { lang: "en", band: "A2", trKeys: [trKey("Sabahları erken uyanırım."), trKey("DUŞ ALIRIM")] });
  assert.equal(two.replan, true);
});

test("validatePlan: p1/p2 yoksa kök kuralı mastar üretir", () => {
  const s = enPlan().sentences;
  assert.equal(s[1].conn?.p1, "kahvaltı yapmak"); // modelin yazdığı korunur
  assert.equal(s[2].conn?.p1, "dişlerimi fırçalamak");
  assert.equal(s[2].conn?.p2, "evden çıkmak");
  assert.equal(s[3].conn?.p1, "işe metroyla gitmek");
  assert.equal(s[3].conn?.p2, "işe otobüsle gitmeyi tercih etmek");
  assert.equal(s[5].conn?.p1, "eve varmak");
  assert.equal(s[5].conn?.p2, "televizyonu açmak");
  assert.equal(s[6].conn?.p2, "haber izlemeyi sevmek");
});

test("validatePlan: odak kalıp bir kez girip en az 3 cümlede geçmezse uyarı (set yine kullanılır)", () => {
  assert.deepEqual(validatePlan(EN_PLAN_RAW, 8, { lang: "en", band: "A2" }).warnings, []);
  const w = validatePlan({ s: [{ tr: "a", fn: true }, { tr: "b", fn: true }, { tr: "c" }] }, 3, { lang: "en", band: "A2" });
  assert.ok(w.warnings.length >= 1);
  assert.equal(w.plan.sentences.length, 3);
});

// --- normalizeSentence ---------------------------------------------------------------

test("normalizeSentence: Türkçe 'şu ana kadar' cihazda türetilir; hamleler ve eklenenler", () => {
  const s = buildAll(enPlan(), EN_RAW, "en", { band: "A2" });
  const s0 = s[0];
  assert.equal(s0.status, "ready");
  assert.deepEqual(
    s0.steps.map((x) => x.trSoFar),
    ["Seviyorum", "Uyanmayı seviyorum", "Erken uyanmayı seviyorum", "Sabahları erken uyanmayı seviyorum."]
  );
  // "wake up" bir kalıp: o adım kalıp hamlesi sayılır.
  assert.deepEqual(s0.steps.map((x) => x.move), ["anchor", "chunk", "slot", "toparla"]);
  assert.equal(s0.key, "i like to wake up early in the morning");
  assert.equal(s0.target, "I like to wake up early in the morning.");
  // Zirvede "often" araya girer; ikinci "işe" ikinci geçişte bulunur.
  const peak = s[3];
  const last = peak.steps[peak.steps.length - 1];
  assert.equal(last.inserted, true);
  const tr = peak.tr;
  const second = peak.steps[6].trSpan!;
  assert.ok(second[0] > tr.indexOf("işe") + 3, "ikinci işe");
  assert.equal(peak.steps[3].move, "connector");
  assert.equal(peak.steps[4].move, "anchor");
});

test("normalizeSentence: kısım biten adım işaretlenir; bağlaç kartı kısımlar ve ilk seferde tuzakla gelir", () => {
  const s = buildAll(enPlan(), EN_RAW, "en", { band: "A2" });
  const s1 = s[1];
  assert.equal(s1.steps[1].clauseEnd, true);
  assert.equal(s1.steps[0].move, "connector");
  assert.equal(s1.connector?.kind, "sub");
  assert.equal(s1.connector?.part1, "kahvaltı yapmak");
  assert.equal(s1.connector?.trapId, "en-ago");
  assert.match(s1.connector!.contrast, /ago/);
  // Bağlaç daha önce görüldüyse (öğrencinin geçmişi) karşıtlık tekrar gösterilmez.
  const again = normalizeSentence(EN_RAW[1], enPlan(), 1, s.slice(0, 1), "en", { band: "A2", connSeen: { before: 1 } });
  assert.equal(again.connector?.contrast, "");
  // Üçüncü bağlaçlı cümleden itibaren öğrenci kendisi böler.
  assert.equal(s1.connector?.learnerSplit, false);
  const split = normalizeSentence(EN_RAW[1], enPlan(), 1, s.slice(0, 1), "en", { band: "A2", connSeen: { after: 1, but: 1 } });
  assert.equal(split.connector?.learnerSplit, true);
});

test("normalizeSentence: bağlantılı (çünkü) cümle önceki cümleyle başlar; tekrarlanan önek bir kez kalır", () => {
  const s = buildAll(enPlan(), EN_RAW, "en", { band: "A2" });
  const ext = s[6];
  assert.equal(ext.linkPrev, true);
  assert.equal(ext.steps[0].move, "linked");
  assert.equal(ext.steps[0].question, "Önceki cümleyi söyle");
  assert.equal(ext.steps[0].target, "When I arrive at home, I turn on the TV.");
  assert.deepEqual(
    ext.steps.slice(1).map((x) => x.target),
    [
      "When I arrive at home, I turn on the TV because",
      "When I arrive at home, I turn on the TV because I like",
      "When I arrive at home, I turn on the TV because I like watching",
      "When I arrive at home, I turn on the TV because I like watching news.",
    ]
  );
  assert.equal(ext.tr, "Eve vardığımda televizyonu açıyorum, çünkü haber izlemeyi seviyorum");
  // Taşın adımı, eklenen 0. adım kadar kayar.
  assert.equal(ext.blocks.find((b) => b.key === "like watching")?.step, 3);
  // çünkü yer değiştirmez: model yazsa da sıralama yok.
  assert.equal(ext.reorder, "");
});

test("normalizeSentence: 6 taşlı zirve korunur (Arapça)", () => {
  const plan = arPlan();
  const s = buildAll(plan, [fx("ar-s1"), fx("ar-s2"), { steps: [] }, fx("ar-s4")], "ar", { band: "A2" });
  assert.equal(s[3].blocks.length, 6);
  assert.equal(s[3].status, "ready");
  assert.equal(s[2].status, "failed"); // adımsız cümle: KISA MOD'a
});

test("markRecycled: geri gelen taşın notu/karşıtlığı gizlenir, ilk hâli saklanır; karşıtlık ikinci kez yok", () => {
  const plan = enPlan();
  const built = buildAll(plan, EN_RAW.slice(0, 1), "en", { band: "A2" }).slice(0, 1);
  const again = normalizeSentence(
    {
      steps: [
        { p: "uyanırım", t: "I wake up" },
        { p: "Sabahları", t: "I wake up in the morning." },
      ],
      blocks: [{ t: "in the morning", tr: "sabahları", k: "chunk", s: 1, n: "kalıp yine", c: "on değil", a: ["in the mornings"] }],
    },
    plan,
    1,
    built,
    "en",
    { band: "A2" }
  );
  const b = again.blocks[0];
  assert.equal(b.note, "");
  assert.equal(b.contrast, "");
  assert.deepEqual(b.alts, []);
  assert.deepEqual(b.recycled, { fromSentence: 0, firstNote: "kalıp", firstContrast: "on the morning değil" });
  assert.ok(again.recallKeys.includes("in the morning"));
  // Önceki setten bilinen taş da (BlockProgress) geri gelen sayılır: -1.
  const fromStore = normalizeSentence(EN_RAW[0], plan, 0, [], "en", { band: "A2", blocks: { early: { note: "erken = early", contrast: "" } } });
  assert.equal(fromStore.blocks.find((x) => x.key === "early")?.recycled?.fromSentence, -1);
});

test("kod tuzağının metni taşa ilk seferde konur, ikinci taşta tekrar edilmez", () => {
  const s = buildAll(enPlan(), EN_RAW, "en", { band: "A2" });
  const metro = s[3].blocks.find((b) => b.key === "by metro")!;
  assert.deepEqual(metro.trapIds, ["en-with-by"]);
  assert.match(metro.contrast, /with değil/);
  const tv = s[5].blocks.find((b) => b.key === "turn on the tv")!;
  assert.ok(tv.trapIds?.includes("en-open"));
  assert.match(tv.contrast, /open değil/);
  const ar = buildAll(arPlan(), [fx("ar-s1"), fx("ar-s2"), { steps: [] }, fx("ar-s4")], "ar", { band: "A2" })[3];
  const metroAr = ar.blocks.find((b) => b.key === "ب المترو")!;
  const busAr = ar.blocks.find((b) => b.key === "ب الحافله")!;
  assert.match(metroAr.contrast, /مَعَ/);
  assert.equal(busAr.contrast, "");
});

test("sıralama: yan cümlede kalır; sıralı/bağlantılı, permütasyon olmayan ve 'because/لأن' başlangıcı temizlenir", () => {
  const s = buildAll(enPlan(), EN_RAW, "en", { band: "A2" });
  // Model göndermedi: İngilizcede cihaz kurar.
  assert.equal(s[1].reorder, "I take a shower before I have breakfast.");
  assert.equal(s[2].reorder, "I leave home after I brush my teeth.");
  assert.equal(s[3].reorder, ""); // ama
  assert.equal(s[6].reorder, ""); // çünkü
  const plan = enPlan();
  const bad = normalizeSentence({ ...(EN_RAW[1] as object), reorder: "I take a bath before breakfast." }, plan, 1, s.slice(0, 1), "en", { band: "A2" });
  assert.equal(bad.reorder, "");
  // Eski guard: sub bağlaç olsa bile ilk adım "Because" ile başlıyorsa sıralama yok.
  const legacy = normalizeSentence(
    {
      steps: [
        { p: "yapmadan önce", t: "Because" },
        { p: "Kahvaltı", t: "Because I have breakfast, I take a shower." },
      ],
      reorder: "I take a shower because I have breakfast.",
    },
    plan,
    1,
    s.slice(0, 1),
    "en",
    { band: "A2" }
  );
  assert.equal(legacy.reorder, "");
  // Arapça: لَكِنَّ ile kurulan zirvede model sıralama yazsa da yok.
  const arS = buildAll(arPlan(), [fx("ar-s1"), fx("ar-s2"), { steps: [] }, { ...fx("ar-s4"), reorder: "x" }], "ar", { band: "A2" });
  assert.equal(arS[3].reorder, "");
  assert.equal(arS[1].reorder, "أَسْتَحِمُّ قَبْلَ أَنْ أَتَنَاوَلَ الفُطُورَ.");
});

test("sıralama: Almancada fiil yeri değişse de permütasyon geçer; otomatik sıralama yok", () => {
  const plan = validatePlan(
    { s: [{ tr: "Kahvaltı yapmadan önce duş alırım.", conn: { k: "sub", tr: "-madan önce", t: "bevor" }, new: ["bevor"] }] },
    1,
    { lang: "de", band: "A2" }
  ).plan;
  const raw = {
    steps: [
      { p: "yapmadan önce", t: "Bevor" },
      { p: "Kahvaltı", t: "Bevor ich frühstücke", e: 1 },
      { p: "duş alırım", t: "Bevor ich frühstücke, dusche ich." },
    ],
    reorder: "Ich dusche, bevor ich frühstücke.",
  };
  assert.equal(normalizeSentence(raw, plan, 0, [], "de", { band: "A2" }).reorder, "Ich dusche, bevor ich frühstücke.");
  assert.equal(isPermutation("Ich dusche, bevor ich frühstücke.", "Bevor ich frühstücke, dusche ich.", "de"), true);
  const { reorder: _r, ...noReorder } = raw;
  assert.equal(normalizeSentence(noReorder, plan, 0, [], "de", { band: "A2" }).reorder, "");
});

test("okunuş: tw kelime kelime eşlenir, tx kazanır, eşlenemeyen kelimede '…' (asla yanlış okunuş)", () => {
  const plan = arPlan();
  const s0 = normalizeSentence(fx("ar-s1"), plan, 0, [], "ar", { band: "A2" });
  assert.deepEqual(s0.translitWords, ["uḥibbu", "an", "astayqiẓa", "mubakkiran", "fi", "ṣ-ṣabāḥ"]);
  assert.equal(s0.steps[1].translit, "uḥibbu an astayqiẓa");
  assert.equal(s0.steps[3].translit, "uḥibbu an astayqiẓa mubakkiran fi ṣ-ṣabāḥ");
  const raw = fx("ar-s1") as { steps: Record<string, unknown>[] };
  const changed = {
    ...raw,
    steps: [
      raw.steps[0],
      { ...raw.steps[1], t: "أُحِبُّ أَنْ أَسْتَيْقِظُ" }, // son hâlde olmayan hareke
      { ...raw.steps[2], tx: "uḥibbu an astayqiẓa mubakkiran (tx)" },
      raw.steps[3],
    ],
  };
  const s = normalizeSentence(changed, plan, 0, [], "ar", { band: "A2" });
  assert.equal(s.steps[1].translit, "uḥibbu an …");
  assert.equal(s.steps[2].translit, "uḥibbu an astayqiẓa mubakkiran (tx)");
  // Sıralamanın okunuşu tw'den permütasyonla.
  const s2 = normalizeSentence(fx("ar-s2"), plan, 1, [s0], "ar", { band: "A2" });
  assert.equal(s2.reorderTranslit, "astaḥimmu qabla an atanāwala l-fuṭūr");
  // tw kelime sayısı tutmazsa okunuş hiç gösterilmez.
  const off = normalizeSentence({ ...fx("ar-s1"), tw: ["a", "b"] }, plan, 0, [], "ar", { band: "A2" });
  assert.deepEqual(off.translitWords, []);
  assert.equal(off.steps[3].translit, "");
  // Latin dilde okunuş yok.
  assert.equal(buildAll(enPlan(), EN_RAW, "en", { band: "A2" })[0].steps[0].translit, "");
});

test("bozuk ret, pair ve x atılır; geçerli ret kalır", () => {
  const plan = arPlan();
  const base = fx("ar-s1") as { blocks: Record<string, unknown>[] };
  const withJunk = {
    ...base,
    blocks: [...base.blocks.slice(0, 2), { t: "فِي الصَّبَاحِ", tr: "sabahları", k: "chunk", s: 3, pair: { t: "x" }, x: "hastane" }],
  };
  for (const ret of [
    { s: 1, q: "?", o: ["a", "b", "c"], a: 0 },
    { s: 99, q: "?", o: ["a", "b"], a: 0 },
    { s: 1, q: "?", o: ["a", "b"], a: 2 },
    { s: 1, q: "", o: ["a", "b"], a: 0 },
  ]) {
    const s = normalizeSentence({ ...withJunk, ret }, plan, 0, [], "ar", { band: "A2" });
    assert.deepEqual(s.retrievals, [], JSON.stringify(ret));
    const b = s.blocks.find((x) => x.key === "في الصباح")!;
    assert.equal(b.pair, undefined);
    assert.equal(b.transfer, undefined);
  }
  const ok = normalizeSentence({ ...withJunk, ret: { s: 1, q: "أَنْ mı?", o: ["أَنْ", "—"], a: 0, w: "fiil fetha" } }, plan, 0, [], "ar", { band: "A2" });
  assert.deepEqual(ok.retrievals.map((r) => [r.step, r.src, r.answer]), [[1, "model", 0]]);
});

test("cihaz geri çağırmaları: dönen sistem (PM) ve geri gelen tuzaklı taş (by/with)", () => {
  const s = buildAll(enPlan(), EN_RAW, "en", { band: "A2" });
  const dip = s[4];
  assert.deepEqual(dip.systemLesson, { id: "clock12", step: 2 });
  const synth = s[7];
  assert.equal(synth.retrievals.length, 1);
  assert.equal(synth.retrievals[0].src, "system");
  assert.equal(synth.retrievals[0].step, 1);
  assert.deepEqual(synth.retrievals[0].options, ["AM", "PM"]);
  assert.equal(synth.retrievals[0].answer, 1);
  // Önceki cümlede öğretilen "by metro" geri gelir: seçenekler by/with, doğrusu by.
  const plan = enPlan();
  const trapRet = normalizeSentence(
    {
      steps: [
        { p: "giderim", t: "I go home" },
        { p: "metroyla", t: "I go home by metro." },
      ],
      blocks: [{ t: "by metro", tr: "metroyla", k: "caseSplit", s: 1 }],
    },
    plan,
    4,
    s.slice(0, 4),
    "en",
    { band: "A2" }
  );
  const r = trapRet.retrievals.find((x) => x.src === "trap")!;
  assert.ok(r, "tuzak sorusu");
  assert.equal(r.step, 1);
  assert.deepEqual([...r.options].sort(), ["by", "with"]);
  assert.equal(r.options[r.answer], "by");
  assert.match(r.q, /mı|mi/);
  // Arapçada seçenekler yalnız Arapçanın tuzak çiftlerinden gelir.
  const arBuilt = buildAll(arPlan(), [fx("ar-s1"), fx("ar-s2"), { steps: [] }, fx("ar-s4")], "ar", { band: "A2" });
  const arRet = normalizeSentence(
    { steps: [{ p: "giderim", t: "أَذْهَبُ إِلَى البَيْتِ" }, { p: "metroyla", t: "أَذْهَبُ إِلَى البَيْتِ بِالمِتْرُو" }], blocks: [{ t: "بِالمِتْرُو", tr: "metroyla", k: "caseSplit", s: 1 }] },
    arPlan(),
    4,
    arBuilt.slice(0, 4),
    "ar",
    { band: "A2" }
  ).retrievals.find((x) => x.src === "trap")!;
  assert.deepEqual([...arRet.options].sort(), ["بِـ", "مَعَ"].sort());
  for (const o of arRet.options) assert.doesNotMatch(o, /ago|AM|PM/);
});

test("tryFirst: sentez, B2+, B1 uzatması ve kanıtlama aşaması önce tek seferde", () => {
  const a2 = buildAll(enPlan(), EN_RAW, "en", { band: "A2" });
  assert.equal(a2[7].tryFirst, true);
  assert.equal(a2[1].tryFirst, false);
  assert.equal(a2[6].tryFirst, false);
  const b1 = buildAll(enPlan("B1"), EN_RAW, "en", { band: "B1" });
  assert.equal(b1[6].tryFirst, true);
  assert.equal(b1[1].tryFirst, false);
  const b2 = buildAll(enPlan("B2"), EN_RAW, "en", { band: "B2" });
  assert.ok(b2.every((s) => s.tryFirst));
  const proving = normalizeSentence(EN_RAW[0], enPlan(), 0, [], "en", { band: "A2", patternStatus: "proving" });
  assert.equal(proving.tryFirst, true);
});

test("sentez tek adımla kalabilir; diğer roller 2 adımdan azsa 'failed'", () => {
  const plan = enPlan();
  const built = buildAll(plan, EN_RAW, "en", { band: "A2" });
  const one = { steps: [{ p: "girerim", t: "I go to bed at around 10 PM." }] };
  assert.equal(normalizeSentence(one, plan, 7, built.slice(0, 7), "en", { band: "A2" }).status, "ready");
  assert.equal(normalizeSentence(one, plan, 0, [], "en", { band: "A2" }).status, "failed");
  assert.equal(normalizeSentence(null, plan, 0, [], "en", { band: "A2" }).status, "failed");
});

test("Arapça altın örnekler: yöntem tablosundaki adımlar aynen, JSON gidiş-dönüşü kayıpsız, cevap denetimi eşdeğerleri kabul eder", () => {
  const plan = arPlan();
  const s = buildAll(plan, [fx("ar-s1"), fx("ar-s2"), { steps: [] }, fx("ar-s4")], "ar", { band: "A2" });
  for (const i of [0, 1, 3]) assert.deepEqual(JSON.parse(JSON.stringify(s[i])), s[i], `cümle ${i}`);
  // 7.2: dört adım, yüklemden başlar.
  assert.deepEqual(s[0].steps.map((x) => x.target), [
    "أُحِبُّ",
    "أُحِبُّ أَنْ أَسْتَيْقِظَ",
    "أُحِبُّ أَنْ أَسْتَيْقِظَ مُبَكِّرًا",
    "أُحِبُّ أَنْ أَسْتَيْقِظَ مُبَكِّرًا فِي الصَّبَاحِ",
  ]);
  // Masdar eşdeğeri (like -ing gibi) son adımda da kabul.
  const acc = (target: string, given: string, sw: BuildSentence["swaps"]) => checkAnswer(target, [], given, { lang: "ar", swaps: sw })?.verdict;
  assert.equal(acc(s[0].target, "احب الاستيقاظ مبكرا في الصباح", s[0].swaps), "dogru");
  // 7.3: bağlaçla başlar, birinci kısım biter, sıralama permütasyon; masdarlı söyleyiş kabul.
  assert.equal(s[1].steps[0].move, "connector");
  assert.equal(s[1].steps[1].clauseEnd, true);
  assert.equal(s[1].connector?.trapId, "ar-an");
  assert.equal(acc(s[1].target, "قبل تناول الفطور استحم", s[1].swaps), "dogru");
  assert.equal(acc(s[1].reorder, "استحم قبل ان اتناول الفطور", s[1].swaps), "dogru");
  // 7.4: sekiz adım, لَكِنَّنِي bağlaç adımı, "ama"dan sonra yeni çekirdek; eşdeğer en fazla 3.
  assert.equal(s[3].steps.length, 8);
  assert.equal(s[3].steps[3].move, "connector");
  assert.equal(s[3].steps[4].move, "anchor");
  assert.equal(s[3].connector?.trapId, "ar-lakin");
  assert.ok(s[3].swaps.length <= 3);
  assert.equal(s[3].steps[0].trSoFar, "Bazen giderim");
  assert.equal(s[3].translitWords.length, 13);
  assert.equal(acc(s[3].target, "من حين لاخر اذهب الى العمل بالمترو لكنني غالبا ما افضل الذهاب الى العمل بالحافله", s[3].swaps), "dogru");
});

// --- compileSentence ---------------------------------------------------------------

test("kart sırası: bağlaçsız / yan / sıralı / bağlantılı / sentez", () => {
  const plan = enPlan();
  const set = mkSet(plan, buildAll(plan, EN_RAW, "en", { band: "A2" }), "en");
  assert.deepEqual(kinds(compileSentence(set, 0)), ["read", "step0", "step1", "step2", "step3", "pair", "recap"]);
  assert.deepEqual(kinds(compileSentence(set, 1)), ["read", "connector", "step0", "step1", "step2", "reorder", "recap"]);
  assert.deepEqual(kinds(compileSentence(set, 2)), ["read", "connector", "step0", "step1", "step2", "reorder", "transfer", "recap"]);
  const peak = kinds(compileSentence(set, 3));
  assert.equal(peak[1], "connector");
  assert.ok(!peak.includes("reorder"));
  assert.deepEqual(kinds(compileSentence(set, 6)), ["read", "connector", "step0", "step1", "step2", "step3", "step4", "recap"]);
  assert.deepEqual(kinds(compileSentence(set, 7)), ["read", "recall", "oneshot", "kurus", "step0", "retrieval", "step1", "recap"]);
  const recall = compileSentence(set, 7)[1] as Extract<Card, { t: "recall" }>;
  assert.deepEqual(recall.keys, ["at around 7 pm"]);
  // İkinci sıralamada "ilk sefer" notu yok.
  const r2 = compileSentence(set, 1, { reorderSeen: 1 }).find((c) => c.t === "reorder") as Extract<Card, { t: "reorder" }>;
  assert.equal(r2.first, false);
  // Hazır olmayan cümle kart üretmez.
  const pend = mkSet(plan, [placeholderSentence(plan.sentences[0])], "en");
  assert.deepEqual(compileSentence(pend, 0), []);
});

test("kart sırası: sistem dersi gerektiren adımdan önce, (d) kısmı sonra; 'öğrendik' çipleri", () => {
  const plan = enPlan();
  const set = mkSet(plan, buildAll(plan, EN_RAW, "en", { band: "A2" }), "en");
  assert.deepEqual(kinds(compileSentence(set, 4)), ["read", "recall", "step0", "step1", "system-abc", "step2", "system-d", "recap"]);
  const recall = compileSentence(set, 4)[1] as Extract<Card, { t: "recall" }>;
  assert.deepEqual(recall.keys, ["leave home"]);
});

test("kart sırası: öğrencinin kendisinin bölmesi 3. bağlaçlı cümleden", () => {
  const plan = enPlan();
  const set = mkSet(plan, buildAll(plan, EN_RAW, "en", { band: "A2" }), "en");
  const card = (seen: Record<string, number>) =>
    (compileSentence(set, 5, { connSeen: seen }).find((c) => c.t === "connector") as Extract<Card, { t: "connector" }>).card;
  assert.equal(card({ before: 1 }).learnerSplit, false);
  assert.equal(card({ before: 1, after: 1 }).learnerSplit, true);
});

test("solma: A2 bütün adımlar; B1 oturmuş taşın adımı atlanır; B2 önce tek seferde + solmuş adımlar", () => {
  const mastered = ["early"];
  const a2 = mkSet(enPlan(), buildAll(enPlan(), EN_RAW, "en", { band: "A2" }), "en", "A2");
  assert.deepEqual(fadeSteps(a2.sentences[0], "A2", "en", mastered), [0, 1, 2, 3]);
  const b1 = mkSet(enPlan("B1"), buildAll(enPlan("B1"), EN_RAW, "en", { band: "B1" }), "en", "B1");
  assert.deepEqual(fadeSteps(b1.sentences[0], "B1", "en", mastered), [0, 1, 3]);
  assert.deepEqual(kinds(compileSentence(b1, 0, { masteredBlocks: mastered })), ["read", "step0", "step1", "step3", "pair", "recap"]);
  // Oturmuş bağlacın tek başına adımı düşer; kısım biten adım ve son adım asla atlanmaz.
  assert.deepEqual(fadeSteps(b1.sentences[1], "B1", "en", ["before", "i have breakfast", "have breakfast", "i take a shower"]), [1, 2]);
  const b2 = mkSet(enPlan("B2"), buildAll(enPlan("B2"), EN_RAW, "en", { band: "B2" }), "en", "B2");
  assert.deepEqual(kinds(compileSentence(b2, 0, { masteredBlocks: mastered })), ["read", "oneshot", "kurus", "step0", "step1", "step3", "pair", "recap"]);
});

// --- v1 → v2 -----------------------------------------------------------------------

test("upgradeSetV1: roller konumdan, bağlaç Türkçeden; iki kez çalıştırmak aynı sonucu verir", () => {
  const v1 = fx("v1-set");
  const u = upgradeSetV1(v1, "en");
  assert.equal(u.v, 2);
  assert.equal(u.origin, "v1");
  assert.equal(u.id, "2026-09-01T08:00:00.000Z-zaman-baglac");
  assert.equal(u.tense, "habit");
  assert.equal(u.level, "A2");
  assert.deepEqual(u.sentences.map((s) => s.role), ["open", "build", "extension", "synthesis"]);
  assert.deepEqual(u.sentences.map((s) => s.connector?.kind ?? "none"), ["none", "sub", "coord", "sub"]);
  assert.equal(u.sentences[1].connector?.target, "before");
  assert.equal(u.sentences[1].connector?.part1, "");
  // Sıralama yalnız yan cümlede ve permütasyonsa; "ama"lı cümlede atılır.
  assert.equal(u.sentences[1].reorder, "I take a shower before I have breakfast.");
  assert.equal(u.sentences[2].reorder, "");
  // Aynı taş iki cümlede: ikincisi geri gelen.
  const again = u.sentences[3].blocks.find((b) => b.key === "before")!;
  assert.equal(again.recycled?.fromSentence, 1);
  assert.equal(again.contrast, "");
  assert.equal(again.kind, "connector");
  assert.deepEqual(u.sentences[3].recallKeys, ["before"]);
  assert.equal(u.sentences[0].focusIsNew, true);
  assert.equal(u.sentences[3].usesFocus, false);
  assert.equal(u.sentences[3].tryFirst, true);
  assert.ok(u.sentences.every((s) => s.status === "ready"));
  // İdempotent: v2 olduğu gibi; JSON'dan dönen de aynı.
  assert.deepEqual(upgradeSetV1(u, "en"), u);
  assert.deepEqual(upgradeSetV1(JSON.parse(JSON.stringify(u)), "en"), u);
  assert.deepEqual(JSON.parse(JSON.stringify(u)), u);
});

test("upgradeSetV1: eski set yeni kart sırasıyla çalışır; eski alternatifler adımlarda ve sıralamada geçer", () => {
  const u = upgradeSetV1(fx("v1-set"), "en");
  assert.deepEqual(kinds(compileSentence(u, 1)), ["read", "connector", "step0", "step1", "step2", "reorder", "recap"]);
  const s1 = u.sentences[1];
  const ok = (target: string, given: string) => checkAnswer(target, s1.steps[s1.steps.length - 1].alts, given, { lang: "en", swaps: s1.swaps })?.verdict;
  assert.equal(ok(s1.target, "Before I have breakfast, I have a shower."), "dogru");
  assert.equal(ok(s1.reorder, "I have a shower before I have breakfast"), "dogru");
  // İlk cümlenin adım alternatifi (to wake up → waking up) swap oldu.
  assert.equal(checkAnswer(u.sentences[0].target, [], "I like waking up early in the morning", { lang: "en", swaps: u.sentences[0].swaps })?.verdict, "dogru");
  // Türkçe parça yeri ve eklenen kelimeler türetildi.
  assert.deepEqual(u.sentences[0].steps[1].trSpan, [16, 24]);
  assert.deepEqual(u.sentences[0].steps[1].added, [2, 3, 4]);
  assert.equal(u.sentences[1].steps[1].clauseEnd, true);
  assert.equal(blockKey("Before", "en"), "before");
});
