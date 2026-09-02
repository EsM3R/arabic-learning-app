/** Hocaya sunulan ölçülmüş ilerleme özeti testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { progressDigest, readingPerformance } from "../src/progress.ts";
import type { StatsSummary } from "../src/stats.ts";
import type { ReadingText } from "../src/types.ts";

function reading(over: Partial<ReadingText>): ReadingText {
  return {
    title: "t",
    titleTr: "t",
    sentences: [],
    newWords: [],
    usedReviewWords: [],
    questions: [],
    productionTask: { instruction: "", example: "" },
    id: "r1",
    topic: "konu",
    level: "A2",
    length: "orta",
    coldStart: false,
    createdAt: "2026-09-01T10:00:00.000Z",
    knownRatio: 0.97,
    complianceRatio: 0.97,
    unplannedUnknown: [],
    reviewCardIds: [],
    addedWordIds: [],
    ...over,
  };
}

function stats(over: Partial<StatsSummary> = {}): StatsSummary {
  return { today: {}, week: {}, total: {}, activeDays7: 0, activeDays30: 0, ...over };
}

test("readingPerformance: yalnız bitmiş metinler sayılır, skor birleştirilir", () => {
  const perf = readingPerformance(
    [
      reading({ id: "a", finishedAt: "2026-09-01T12:00:00.000Z", quizCorrect: 3, quizTotal: 3 }),
      reading({ id: "b", finishedAt: "2026-09-02T12:00:00.000Z", quizCorrect: 1, quizTotal: 3, level: "B1" }),
      reading({ id: "c" }), // bitmemiş
    ],
    0.85
  );
  assert.equal(perf.finished, 2);
  assert.equal(perf.accuracy, 4 / 6);
  assert.deepEqual(perf.recentLevels, ["B1", "A2"]); // yeniden eskiye
  assert.equal(perf.lowCompliance, 0);
});

test("readingPerformance: hiç bitmiş metin yoksa accuracy null", () => {
  const perf = readingPerformance([reading({})], 0.85);
  assert.equal(perf.finished, 0);
  assert.equal(perf.accuracy, null);
});

test("readingPerformance: uyum düşük metinler sayılır, soğuk başlangıç hariç", () => {
  const perf = readingPerformance(
    [
      reading({ id: "a", complianceRatio: 0.6 }),
      reading({ id: "b", complianceRatio: 0.5, coldStart: true }), // soğuk başlangıç sayılmaz
      reading({ id: "c", complianceRatio: 0.95 }),
    ],
    0.85
  );
  assert.equal(perf.lowCompliance, 1);
});

test("progressDigest: veri yoksa dürüstçe 'ölçüm yok' der", () => {
  const d = progressDigest(stats(), readingPerformance([], 0.85));
  assert.match(d, /Henüz ölçülmüş veri yok/);
  assert.doesNotMatch(d, /0 metin/); // sıfırları rapor etmiyoruz
});

test("progressDigest: yüksek anlama seviye yükseltmeyi önerir", () => {
  const perf = readingPerformance(
    [reading({ finishedAt: "2026-09-01T12:00:00.000Z", quizCorrect: 9, quizTotal: 10 })],
    0.85
  );
  const d = progressDigest(stats(), perf);
  assert.match(d, /%90 doğru/);
  assert.match(d, /bir üst seviyeye geçmeyi düşünebilirsin/);
});

test("progressDigest: düşük anlama seviye yükseltmeyi AÇIKÇA yasaklar", () => {
  const perf = readingPerformance(
    [reading({ finishedAt: "2026-09-01T12:00:00.000Z", quizCorrect: 2, quizTotal: 10 })],
    0.85
  );
  const d = progressDigest(stats(), perf);
  assert.match(d, /seviyeyi YÜKSELTME/);
});

test("progressDigest: kulak verisi ve zayıf ayırt etme uyarısı", () => {
  const d = progressDigest(
    stats({ week: { discrimination: 20, discriminationCorrect: 10 } }),
    readingPerformance([], 0.85)
  );
  assert.match(d, /%50 doğru/);
  assert.match(d, /telaffuz çalışması olmadan konuşma seviyesini yükseltme/);
});

test("progressDigest: haftalık üretim ve gölgeleme hatırlatması", () => {
  const d = progressDigest(
    stats({ week: { produced: 12, reviewed: 40, readSentence: 30 }, activeDays7: 4, activeDays30: 11 }),
    readingPerformance([], 0.85)
  );
  assert.match(d, /12 cümle üretti/);
  assert.match(d, /4 gün aktif/);
  assert.match(d, /son 30 günde 11 gün/);
  assert.match(d, /Gölgeleme hiç denenmemiş/);
});

test("progressDigest: gölgeleme yapılmışsa hatırlatma çıkmaz", () => {
  const d = progressDigest(
    stats({ week: { shadowed: 5 }, total: { shadowed: 5 }, activeDays7: 1 }),
    readingPerformance([], 0.85)
  );
  assert.match(d, /5 cümle gölgeledi/);
  assert.doesNotMatch(d, /Gölgeleme hiç denenmemiş/);
});

test("progressDigest: kural dışına taşan metinler uyarı olarak geçer", () => {
  const perf = readingPerformance([reading({ complianceRatio: 0.5 })], 0.85);
  assert.match(progressDigest(stats(), perf), /kelime defterinin dışına taşmış/);
});
