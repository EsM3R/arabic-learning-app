/** Okuma Salonu saf mantık testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReadingRequest,
  COLD_START_MIN,
  dedupeNewWords,
  finalizeReading,
  knownWordList,
  LENGTH_SPECS,
  matchReviewCards,
  normalizeReadingPayload,
  MAX_KNOWN_WORDS,
  MAX_READINGS,
  pruneReadings,
  selectReviewCards,
  topicFromModule,
} from "../src/reading.ts";
import { readingCoverage } from "../src/textnorm.ts";
import type { ReadingGenPayload, ReadingText, VocabCard } from "../src/types.ts";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString();

let seq = 0;
function card(over: Partial<VocabCard>): VocabCard {
  seq += 1;
  return {
    id: `c${seq}`,
    arabic: `كلمة${seq}`,
    transliteration: "x",
    turkish: "y",
    track: "okuma",
    addedAt: iso(-seq),
    due: iso(1), // varsayılan: henüz due değil
    intervalDays: 5,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    ...over,
  };
}

test("LENGTH_SPECS bütçeleri tutarlı", () => {
  for (const spec of Object.values(LENGTH_SPECS)) {
    assert.ok(spec.maxNew <= 0.05 * spec.words[1]);
    assert.ok(spec.maxNew / spec.words[0] <= 0.06);
    assert.ok(spec.reviewCap <= spec.sentences[1]);
    assert.ok(spec.questionCount >= 2);
  }
});

test("selectReviewCards: diglossic'te konuşma kartı seçilmez, cap aşılmaz", () => {
  const cards = [
    card({ id: "k1", track: "konusma", due: iso(-1) }),
    card({ id: "o1", track: "okuma", due: iso(-2) }),
    card({ id: "o2", track: "okuma", due: iso(-1) }),
    card({ id: "o3", track: "okuma", lapses: 3 }),
  ];
  const dig = selectReviewCards(cards, true, 2, NOW);
  assert.ok(dig.every((c) => c.track === "okuma"));
  assert.equal(dig.length, 2);
  assert.equal(dig[0].id, "o1"); // due sırası: en eski önce
  const nonDig = selectReviewCards(cards, false, 10, NOW);
  assert.ok(nonDig.some((c) => c.id === "k1"));
  // mükerrer yok
  const ids = nonDig.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("selectReviewCards: due kartlar struggling'den önce gelir", () => {
  const cards = [
    card({ id: "s1", lapses: 5, due: iso(3) }), // zorlanılan ama due değil
    card({ id: "d1", due: iso(-1) }), // due
  ];
  const picked = selectReviewCards(cards, false, 2, NOW);
  assert.equal(picked[0].id, "d1");
  assert.ok(picked.some((c) => c.id === "s1"));
});

test("knownWordList: 600 altında tam liste; üstünde must+struggling korunur", () => {
  const small = [card({}), card({})];
  assert.equal(knownWordList(small, []).length, 2);

  const big: VocabCard[] = [];
  for (let i = 0; i < MAX_KNOWN_WORDS + 50; i++) {
    big.push(card({ id: `b${i}`, arabic: `word${i}` }));
  }
  const mustCards = [big[600], big[610]];
  const strugglingOld = card({ id: "old-strug", arabic: "STRUG", lapses: 9, addedAt: iso(-9999) });
  big.push(strugglingOld);
  const list = knownWordList(big, mustCards);
  assert.equal(list.length, MAX_KNOWN_WORDS);
  assert.ok(list.includes(big[600].arabic));
  assert.ok(list.includes("STRUG"));
});

test("buildReadingRequest: soğuk başlangıç eşiği ve konu önceliği", () => {
  const smallDeck = Array.from({ length: COLD_START_MIN - 1 }, (_, i) =>
    card({ id: `s${i}`, track: i % 2 ? "konusma" : "okuma" })
  );
  const cold = buildReadingRequest(smallDeck, { length: "orta" }, "A1", undefined, "a, b", true, NOW);
  assert.equal(cold.coldStart, true);
  assert.equal(cold.reviewCards.length, smallDeck.length); // TAMAMI, konuşma dahil
  assert.equal(cold.deckSize, smallDeck.length);

  const bigDeck = Array.from({ length: COLD_START_MIN }, (_, i) => card({ id: `g${i}` }));
  const warm = buildReadingRequest(bigDeck, { length: "kisa" }, "B1", undefined, "a, b", true, NOW);
  assert.equal(warm.coldStart, false);
  assert.ok(warm.reviewCards.length <= LENGTH_SPECS.kisa.reviewCap);

  const t1 = buildReadingRequest(bigDeck, { length: "kisa", topic: "pazar" }, "B1", "modül konusu", "a", false, NOW);
  assert.equal(t1.topic, "pazar");
  const t2 = buildReadingRequest(bigDeck, { length: "kisa" }, "B1", "modül konusu", "a", false, NOW);
  assert.equal(t2.topic, "modül konusu");
  const t3 = buildReadingRequest(bigDeck, { length: "kisa" }, "B1", undefined, "", false, NOW);
  assert.equal(t3.topic, "günlük hayattan bir kesit");
});

test("topicFromModule biçimi", () => {
  assert.equal(
    topicFromModule({ title: "Çarşıda", objectives: ["pazarlık", "sayılar", "üçüncü"] }),
    "Çarşıda — hedefler: pazarlık; sayılar"
  );
  assert.equal(topicFromModule({ title: "Çarşıda", objectives: [] }), "Çarşıda");
});

test("matchReviewCards: klitik, hareke ve çok kelimeli eşleşme", () => {
  const cards = [
    card({ id: "m1", arabic: "سوق" }),
    card({ id: "m2", arabic: "صباح الخير" }),
    card({ id: "m3", arabic: "قلم" }),
  ];
  const ids = matchReviewCards(
    cards,
    ["سُوق"], // harekeli beyan
    ["رحت عالسوق مبارح", "صباح الخير يا أستاذ"],
    true
  );
  assert.ok(ids.includes("m1")); // klitik soymayla da yakalanır
  assert.ok(ids.includes("m2")); // çok kelimeli substring
  assert.ok(!ids.includes("m3")); // metinde yok
  // defterde olmayan beyan id üretmez
  const none = matchReviewCards(cards, ["مدرسة"], ["لا شيء"], true);
  assert.equal(none.length, 0);
});

test("dedupeNewWords: defter ve liste içi mükerrer elenir", () => {
  const vocab = [card({ arabic: "مدرسة" })];
  const out = dedupeNewWords(
    [
      { word: "مَدْرَسَة", translit: "medrese", tr: "okul", hint: "" }, // defterde (normalize)
      { word: "قلم", translit: "kalem", tr: "kalem", hint: "" },
      { word: "قَلَم", translit: "kalem", tr: "kalem", hint: "" }, // liste içi mükerrer
      { word: "", translit: "", tr: "", hint: "" }, // boş
    ],
    vocab,
    true
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].word, "قلم");
});

function payload(over: Partial<ReadingGenPayload>): ReadingGenPayload {
  return {
    title: "t",
    titleTr: "t",
    sentences: [{ target: "رحت عالسوق", translit: "x", tr: "y" }],
    newWords: [],
    usedReviewWords: [],
    questions: [{ q: "?", choices: ["a", "b", "c"], answer: 0 }],
    productionTask: { instruction: "yaz", example: "مثال" },
    ...over,
  };
}

test("finalizeReading: temizlik, kapsam TAM defterle, taşıma alanları", () => {
  const vocab = [card({ arabic: "سوق" }), card({ arabic: "راح" })];
  const req = buildReadingRequest(vocab, { length: "kisa", topic: "pazar" }, "A2", undefined, "a", false, NOW);
  const raw = payload({
    sentences: [
      { target: "رحت عالسوق", translit: "", tr: "" },
      { target: "   ", translit: "", tr: "" }, // boş → atılır
    ],
    questions: [
      { q: "iyi", choices: ["a", "b"], answer: 1 },
      { q: "bozuk", choices: ["a", "b"], answer: 5 }, // aralık dışı → atılır
    ],
  });
  const fin = finalizeReading(raw, req, vocab, true, NOW);
  assert.equal(fin.sentences.length, 1);
  assert.equal(fin.questions.length, 1);
  assert.ok(fin.id.startsWith("r"));
  assert.deepEqual(fin.addedWordIds, []);
  assert.equal(fin.topic, "pazar");
  assert.equal(fin.level, "A2");
  assert.equal(fin.length, "kisa");
  assert.ok(fin.knownRatio > 0); // سوق klitikle bilinen
  assert.ok(fin.unplannedUnknown.length <= 20);
});

test("pruneReadings: önce en eski bitmişler düşer", () => {
  const texts: ReadingText[] = [];
  const req = buildReadingRequest([card({})], { length: "kisa" }, "A1", undefined, "a", false, NOW);
  for (let i = 0; i < MAX_READINGS + 3; i++) {
    const t = finalizeReading(payload({}), req, [], false, new Date(NOW.getTime() + i * 60000));
    texts.push({ ...t, id: `r${i}`, finishedAt: i < 5 ? iso(0) : undefined });
  }
  const pruned = pruneReadings(texts);
  assert.equal(pruned.length, MAX_READINGS);
  // en eski bitmişler: r0, r1, r2 düşmeli; bitmemiş r5..r22 durmalı
  assert.ok(!pruned.some((r) => r.id === "r0"));
  assert.ok(!pruned.some((r) => r.id === "r1"));
  assert.ok(!pruned.some((r) => r.id === "r2"));
  assert.ok(pruned.some((r) => r.id === "r5"));
  // yeni → eski sıralı
  assert.equal(pruned[0].id, `r${MAX_READINGS + 2}`);
  // hepsi bitmemişse en eskiler düşer
  const unfinished = texts.map((t) => ({ ...t, finishedAt: undefined }));
  const pruned2 = pruneReadings(unfinished);
  assert.ok(!pruned2.some((r) => r.id === "r0"));
});

test("readingCoverage: compliance planlı yeniyi affeder, plansızı cezalandırır", () => {
  const known = ["راح", "سوق", "بيت", "يوم", "اكل", "شرب", "كتب", "قرا"];
  const text = "راح سوق بيت يوم اكل شرب كتب قرا خضرة فواكه";
  const r1 = readingCoverage(text, known, ["خضرة", "فواكه"], true);
  assert.equal(r1.complianceRatio, 1);
  assert.ok(Math.abs(r1.knownRatio - 0.8) < 1e-9);
  assert.equal(r1.unplannedUnknown.length, 0);
  const r2 = readingCoverage(text, known, ["خضرة"], true); // فواكه plansız
  assert.ok(r2.complianceRatio < 1);
  assert.ok(r2.unplannedUnknown.includes("فواكه"));
  // klitikli bilinen ve klitikli planlı
  const r3 = readingCoverage("والبيت بالخضرة", ["بيت"], ["خضرة"], true);
  assert.equal(r3.knownTokens, 1);
  assert.equal(r3.plannedNewTokens, 1);
  // boş metin
  assert.equal(readingCoverage("", ["x"], [], true).complianceRatio, 1);
});

test("normalizeReadingPayload: eksik diziler boşlanır, bozuk öğeler elenir", () => {
  const p = normalizeReadingPayload({
    title: "عنوان",
    sentences: [
      { target: "جملة", translit: "cümle", tr: "cümle" },
      { target: "  " }, // boş hedef → elenir
      { translit: "hedefi yok" },
      null,
      { target: "ثانية" }, // translit/tr eksik → "" olur
    ],
    newWords: [{ word: "قلم", tr: "kalem" }, { tr: "kelimesi yok" }, "düz"],
    questions: [
      { q: "Soru?", choices: ["a", "b", 3], answer: 0 },
      { q: "cevapsız", choices: ["a"] },
      { choices: ["a"], answer: 0 },
    ],
    usedReviewWords: ["سوق", 42, null],
    productionTask: { instruction: "yaz" },
  });
  assert.equal(p.title, "عنوان");
  assert.equal(p.titleTr, ""); // hiç gelmedi
  assert.equal(p.sentences.length, 2);
  assert.deepEqual(p.sentences[1], { target: "ثانية", translit: "", tr: "" });
  assert.equal(p.newWords.length, 1);
  assert.equal(p.newWords[0].hint, "");
  assert.equal(p.questions.length, 1);
  assert.deepEqual(p.questions[0].choices, ["a", "b"]); // string olmayan seçenek elendi
  assert.deepEqual(p.usedReviewWords, ["سوق"]);
  assert.deepEqual(p.productionTask, { instruction: "yaz", example: "" });
});

test("normalizeReadingPayload: tamamen bozuk cevap güvenli boş yüke döner", () => {
  for (const raw of [null, undefined, "metin", 42, []]) {
    const p = normalizeReadingPayload(raw);
    assert.deepEqual(p.sentences, []);
    assert.deepEqual(p.newWords, []);
    assert.deepEqual(p.questions, []);
    assert.deepEqual(p.usedReviewWords, []);
    assert.equal(p.title, "");
    assert.deepEqual(p.productionTask, { instruction: "", example: "" });
  }
});
