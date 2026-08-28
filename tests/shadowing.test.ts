/** Shadowing kuyruğu ve öz-not testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildShadowQueue, noteShadow } from "../src/shadowing.ts";
import type { ShadowNotesMap } from "../src/shadowing.ts";
import type { PronunciationSet, ReadingText } from "../src/types.ts";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const iso = (min: number) => new Date(NOW.getTime() + min * 60000).toISOString();

function reading(over: Partial<ReadingText>): ReadingText {
  return {
    id: "r1",
    title: "t",
    titleTr: "t",
    sentences: [],
    newWords: [],
    usedReviewWords: [],
    questions: [],
    productionTask: { instruction: "", example: "" },
    topic: "x",
    level: "A1",
    length: "kisa",
    coldStart: false,
    createdAt: iso(0),
    knownRatio: 1,
    complianceRatio: 1,
    unplannedUnknown: [],
    reviewCardIds: [],
    addedWordIds: [],
    ...over,
  };
}

const sent = (target: string) => ({ target, translit: "x", tr: "y" });

const PRON: PronunciationSet = {
  items: [
    { arabic: "مرحبا يا صديقي", transliteration: "merhaba", turkish: "selam", tip: "" },
    { arabic: "شكراً جزيلاً", transliteration: "şükran", turkish: "teşekkür", tip: "" },
  ],
  createdAt: iso(0),
};

test("kuyruk: kelime sayısı filtresi (2-14) ve tekilleştirme", () => {
  const texts = [
    reading({
      sentences: [
        sent("مرحبا"), // 1 kelime → elenir
        sent("رحت عالسوق مبارح"),
        sent("رحت عالسوق مبارح"), // mükerrer → teklenir
        sent("كلمة ".repeat(15).trim()), // 15 kelime → elenir
      ],
    }),
  ];
  const q = buildShadowQueue(texts, null, {}, true);
  assert.equal(q.length, 1);
  assert.equal(q[0].text, "رحت عالسوق مبارح");
});

test("kuyruk: kaynaklar dönüşümlü dizilir, telaffuz da girer", () => {
  const texts = [reading({ sentences: [sent("جملة اولى هنا"), sent("جملة ثانية هنا")] })];
  const q = buildShadowQueue(texts, PRON, {}, true);
  assert.equal(q[0].source, "okuma");
  assert.equal(q[1].source, "telaffuz");
  assert.ok(q.some((i) => i.text === "شكراً جزيلاً"));
});

test("kuyruk: bitirilmiş metinler öncelikli", () => {
  const texts = [
    reading({ id: "yeni", createdAt: iso(10), sentences: [sent("غير منتهية جملة")] }),
    reading({
      id: "eski-bitmis",
      createdAt: iso(0),
      finishedAt: iso(5),
      sentences: [sent("منتهية جملة هنا")],
    }),
  ];
  const q = buildShadowQueue(texts, null, {}, true);
  assert.equal(q[0].text, "منتهية جملة هنا"); // bitirilmiş (anlaşılmış) önce
});

test("kuyruk: 'tekrar lazım' notlular başa alınır, limit çalışır", () => {
  const texts = [
    reading({ sentences: [sent("جملة اولى هنا"), sent("جملة ثانية هنا"), sent("جملة ثالثة هنا")] }),
  ];
  const notes: ShadowNotesMap = {
    "جمله ثانيه هنا": { tries: 1, lastNote: 0, lastAt: iso(0) }, // normalize: ة→ه
  };
  const q = buildShadowQueue(texts, null, notes, true);
  assert.equal(q[0].text, "جملة ثانية هنا");
  assert.equal(buildShadowQueue(texts, null, {}, true, 2).length, 2);
});

test("noteShadow: tries artar, immutable, 300 budaması", () => {
  const m0: ShadowNotesMap = {};
  const m1 = noteShadow(m0, "k1", 0, NOW);
  const m2 = noteShadow(m1, "k1", 2, NOW);
  assert.deepEqual(m0, {});
  assert.equal(m2.k1.tries, 2);
  assert.equal(m2.k1.lastNote, 2);
  let big: ShadowNotesMap = {};
  for (let i = 0; i < 305; i++) {
    big = noteShadow(big, `k${i}`, 1, new Date(NOW.getTime() + i * 1000));
  }
  assert.equal(Object.keys(big).length, 300);
  assert.equal(big.k0, undefined); // en eski düştü
  assert.ok(big.k304);
});
