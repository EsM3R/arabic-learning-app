/**
 * Cümle Kurma kayıt kuralları — geri dönüş kredisi (tasarım §4.5): geri
 * gelen taşı önizlemesiz doğru kullanmak, taşın ÖĞRETİLDİĞİ kalıbın kanıtıdır.
 */
import type { BlockProgress } from "../src/buildmastery";
import { retrievalBlockKeys } from "../src/screens/build/helpers";
import { applyBlockEvent, applyEvent, applyRecycledCredit, ensureBlocks, upsertSentenceBlocks } from "../src/screens/build/record";
import type { BuildEvent } from "../src/screens/build/record";
import { videoSet } from "./fixtures/videoSet";

const block = (firstPatternId: string): BlockProgress => ({
  target: "before",
  tr: "-madan önce",
  kind: "connector",
  note: "",
  contrast: "",
  firstPatternId,
  firstSetId: "eski-set",
  firstSentence: 1,
  contrastShown: true,
  producedOk: 1,
  recycledOkKeys: [],
  sets: ["eski-set"],
  trapMiss: 0,
  retrievalOk: 0,
  retrievalMiss: 0,
  lastSeen: "2026-09-28T00:00:00.000Z",
});

const ev = (extra: Partial<BuildEvent> = {}): BuildEvent => ({
  k: "guided",
  ok: 1,
  first: true,
  spoken: true,
  sk: "i have a shower before i have breakfast",
  si: 0,
  rec: true,
  recKeys: ["before"],
  ...extra,
});

test("geri dönüş kredisi taşın ilk kalıbına yazılır, setin odağına değil", () => {
  const set = videoSet({ patternId: "olmak" });
  const blocks = { before: block("madan-once") };
  const out = applyRecycledCredit({}, set, ev(), blocks);
  expect(out["madan-once"]?.recycledKeys).toEqual([ev().sk]);
  expect(out["madan-once"]?.recycledSets).toEqual([set.id]);
  expect(out.olmak).toBeUndefined();
  // Rehberli olayın kendisi odak kalıba "öğrenme" yazar ama geri dönüş kredisi vermez.
  const p = applyEvent({}, set, ev({ si: 1 }));
  expect(p.olmak?.recycledKeys ?? []).toEqual([]);
});

test("kopya, yanlış, ilk olmayan deneme ve geri çağırma geri dönüş kredisi vermez", () => {
  const set = videoSet();
  const blocks = { before: block("madan-once") };
  for (const e of [ev({ k: "copy" }), ev({ ok: 0 }), ev({ ok: 0.5 }), ev({ first: false }), ev({ k: "retrieval" }), ev({ recKeys: [] })]) {
    expect(applyRecycledCredit({}, set, e, blocks)).toEqual({});
  }
});

test("taşı öğreten cümlenin ilk denemedeki tuzağı kaybolmaz (kayıt olaydan önce açılır)", () => {
  const set = videoSet();
  const sen = set.sentences[0];
  const b = sen.blocks[0];
  // Yalnız anılan taş açılır: görülmemiş taşın karşıtlığı "gösterildi" sayılmasın.
  const opened = ensureBlocks({}, set, 0, [b.key, "yok-boyle-tas"]);
  expect(Object.keys(opened)).toEqual([b.key]);
  const after = applyBlockEvent(opened, ev({ k: "guided", ok: 0, trap: "t1", blockKeys: [b.key], rec: false, recKeys: [] }));
  expect(after[b.key]?.trapMiss).toBe(1);
  // Özet kartındaki toplu yazım sayacı sıfırlamaz.
  const recap = upsertSentenceBlocks(after, set, 0);
  expect(recap[b.key]?.trapMiss).toBe(1);
  expect(recap[b.key]?.sets).toEqual([set.id]);
  // Var olan kayda dokunulmaz.
  expect(ensureBlocks(after, set, 0, [b.key])).toBe(after);
});

test("geri çağırma kredisi taşa gider: tuzak kimliği ve ders kimliği taş anahtarı değildir", () => {
  const set = videoSet();
  const base = set.sentences[0];
  const sen = { ...base, blocks: base.blocks.map((b, i) => (i === 2 ? { ...b, trapIds: ["on-the-morning"] } : b)) };
  const trap = { step: 0, q: "?", options: ["a", "b"] as [string, string], answer: 0 as const, why: "", src: "trap" as const, refKey: "on-the-morning" };
  expect(retrievalBlockKeys(sen, trap)).toEqual([sen.blocks[2].key]);
  const sys = { ...trap, src: "system" as const, refKey: "clock12", step: 1 };
  expect(retrievalBlockKeys(sen, sys)).toEqual(sen.blocks.filter((b) => b.step === 1).map((b) => b.key));
  expect(retrievalBlockKeys(sen, sys)).not.toContain("clock12");
  // Yanlış seçim o taşın kaçırmasıdır.
  const blocks = ensureBlocks({}, set, 0, [sen.blocks[2].key]);
  const out = applyBlockEvent(blocks, ev({ k: "retrieval", ok: 0, blockKeys: retrievalBlockKeys(sen, trap) }));
  expect(out[sen.blocks[2].key]?.retrievalMiss).toBe(1);
});
