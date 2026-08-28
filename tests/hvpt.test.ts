/** HVPT ayırt etme turu saf mantık testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { effectivePlayIndex, pickVoiceVariant, sanitizeMinimalPairs } from "../src/hvpt.ts";
import type { MinimalPairItem } from "../src/types.ts";

const pair = (a: string, b: string, playIndex: 0 | 1 = 0): MinimalPairItem => ({
  a: { word: a, translit: a },
  b: { word: b, translit: b },
  focus: "ع vs ء",
  tip: "ipucu",
  playIndex,
});

test("sanitize: boş, aynı-kelimeli ve alansız çiftler elenir", () => {
  const out = sanitizeMinimalPairs(
    [
      pair("عَلَم", "أَلَم"), // geçerli
      pair("", "kelime"), // boş taraf
      pair("سُوق", "سوق"), // normalize sonrası aynı (hareke farkı)
      { ...pair("a", "b"), focus: "" }, // focus yok
    ],
    true
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].a.word, "عَلَم");
});

test("sanitize: hepsi aynı playIndex ise dengelenir", () => {
  const allZero = sanitizeMinimalPairs([pair("a", "b", 0), pair("c", "d", 0), pair("e", "f", 0)], false);
  assert.deepEqual(allZero.map((p) => p.playIndex), [0, 1, 0]);
  const allOne = sanitizeMinimalPairs([pair("a", "b", 1), pair("c", "d", 1)], false);
  assert.deepEqual(allOne.map((p) => p.playIndex), [0, 1]);
});

test("sanitize: karışık playIndex'e dokunulmaz", () => {
  const mixed = sanitizeMinimalPairs([pair("a", "b", 1), pair("c", "d", 0)], false);
  assert.deepEqual(mixed.map((p) => p.playIndex), [1, 0]);
});

test("effectivePlayIndex: tekrar turunda taraf çevrilir", () => {
  assert.equal(effectivePlayIndex(0, 0), 0);
  assert.equal(effectivePlayIndex(0, 1), 1);
  assert.equal(effectivePlayIndex(1, 1), 0);
  assert.equal(effectivePlayIndex(1, 2), 1);
});

test("pickVoiceVariant: 2+ seste rotasyon, tek/sıfır seste hız varyasyonu", () => {
  assert.deepEqual(pickVoiceVariant(["a", "b", "c"], 4), { voiceId: "b", rate: 0.95 });
  assert.equal(pickVoiceVariant(["a"], 0).rate, 0.8);
  assert.equal(pickVoiceVariant(["a"], 1).rate, 0.95);
  assert.equal(pickVoiceVariant(["a"], 2).rate, 1.1);
  const none = pickVoiceVariant([], 2);
  assert.equal(none.voiceId, undefined);
  assert.equal(none.rate, 1.1);
});
