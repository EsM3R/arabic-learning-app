/**
 * Cümle Kurma v3 — ilerleme veri modeli ve v1 → v2 geçişi (saf mantık).
 *
 * Geçişin iki sözü var: öğrencinin emeği sessizce geri alınmaz (v1'de oturan
 * kalıp "tekrar doğrula" olur, kaybolmaz) ve ilk gün bir tekrar yığınıyla
 * karşılaşmaz (tekrarlar 7 güne, günde en fazla 12). Göç yeni anahtar yazar,
 * eskisini asla silmez.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildStoreKey,
  DEFAULT_BUILD_UI,
  MEMORY_DAILY_CAP,
  mergeProgress,
  mergeSets,
  migrateBuildEntries,
  migrateBuildLang,
  patternIdsOf,
  seedBlocks,
  seedHistory,
  seedMemory,
  seedUi,
  upgradeProgressMapV1,
  upgradeProgressV1,
} from "../src/buildmastery.ts";
import {
  advanceRetell,
  applyNewStepProbe,
  applyPlacement,
  applyTestOut,
  checklistText,
  creditPattern,
  creditRecycled,
  isBlockMastered,
  isMastered,
  isPatternDue,
  karmaPatterns,
  knownWords,
  masteryChecklist,
  MEMORY_INTERVALS,
  memoryItem,
  newProgress,
  nextFocus,
  nextPlacementBatch,
  pendingNewPatterns,
  placementPatterns,
  pruneMemory,
  recordBlockEvent,
  recordEvent,
  recycleCandidates,
  reviewMemory,
  reviewQueue,
  scheduleMemory,
  scheduleRetell,
  shouldOfferPlacement,
  unscaffoldedAccuracy,
} from "../src/buildmastery.ts";
import type {
  BlockProgress,
  MasteryEvent,
  PatternProgress as P2,
  ProgressMap2,
  RecordCtx,
  SentenceMemory,
} from "../src/buildmastery.ts";
import { MASTER_SENTENCES, PATTERN_LADDER, recordAttempt, trKey, upgradeSetV1 } from "../src/sentencebuilding.ts";
import type { ProgressMap } from "../src/sentencebuilding.ts";
import type { VocabCard } from "../src/types.ts";

const v1Set = () => JSON.parse(readFileSync(new URL("./fixtures/v1-set.json", import.meta.url), "utf8"));
const NOW = new Date("2026-09-30T08:00:00.000Z");
const dayOf = (iso: string) => Math.round((new Date(iso).getTime() - NOW.getTime()) / 86_400_000);

function masteredV1(id: string, map: ProgressMap = {}): ProgressMap {
  let m = map;
  for (let i = 0; i < MASTER_SENTENCES; i += 1) m = recordAttempt(m, id, "dogru", true, new Date("2026-09-01T00:00:00Z"));
  return m;
}

test("upgradeProgressV1: oturmuş kalıp 'verify' olur (geri alınmaz), rehberli sayılar yalnız 'learn'e", () => {
  const m = masteredV1("olmak", recordAttempt({}, "istek", "yanlis", false));
  const up = upgradeProgressMapV1(m, NOW);
  assert.equal(up.olmak.status, "verify");
  assert.equal(up.olmak.masteredBy, "legacy");
  assert.equal(up.olmak.learn.attempts, MASTER_SENTENCES);
  assert.deepEqual(up.olmak.proof, []);
  assert.deepEqual(up.olmak.proofKeys, [], "rehberli adımlar kanıt sayılmaz");
  assert.equal(up.olmak.legacy?.sentencesDone, MASTER_SENTENCES);
  assert.ok(up.olmak.srs.due);
  assert.equal(up.istek.status, "learning");
  assert.equal(up.istek.srs.due, undefined);
  // İdempotent.
  assert.deepEqual(upgradeProgressV1(up.olmak), up.olmak);
  assert.deepEqual(upgradeProgressMapV1(up, NOW), up);
});

test("oturmuş kalıpların doğrulama tekrarları 7 güne yayılır", () => {
  let m: ProgressMap = {};
  for (const id of ["olmak", "var-yok", "sahip", "genis-zaman", "istek", "olumsuz", "emir", "rica", "gecmis"]) m = masteredV1(id, m);
  const up = upgradeProgressMapV1(m, NOW);
  const days = Object.values(up).map((p) => dayOf(p.srs.due!));
  for (const d of days) assert.ok(d >= 1 && d <= 7, `gün ${d}`);
  assert.ok(new Set(days).size >= 7);
});

test("mergeProgress: v2 kaydı kazanır, v1'de kalan yeni kalıp da taşınır", () => {
  const v2 = upgradeProgressMapV1(masteredV1("olmak"), NOW);
  v2.olmak.status = "mastered";
  const merged = mergeProgress(v2, { ...masteredV1("olmak"), ...recordAttempt({}, "istek", "dogru", false) }, NOW);
  assert.equal(merged.olmak.status, "mastered");
  assert.equal(merged.istek.status, "learning");
  assert.deepEqual(mergeProgress(null, null, NOW), {});
});

test("tohumlar: taş hafızası, cümle tekrarı, tarihçe, bağlaç görülmüşlüğü", () => {
  const set = upgradeSetV1(v1Set(), "en");
  const blocks = seedBlocks([set]);
  assert.equal(blocks.before.producedOk, 1);
  assert.equal(blocks.before.contrastShown, true);
  assert.equal(blocks.before.firstSentence, 1);
  assert.equal(blocks.before.firstPatternId, "zaman-baglac");
  assert.equal(blocks["take a shower"].contrastShown, false);

  const mem = seedMemory([set], NOW);
  assert.equal(mem.length, 4);
  assert.ok(mem.every((x) => x.stage === 0 && x.lapses === 0));
  assert.equal(mem[1].target, "Before I have breakfast, I take a shower.");
  assert.ok(mem[1].steps.length === 3 && mem[1].steps[0].move === "connector");
  assert.deepEqual(mem[0].patternIds, ["zaman-baglac"]);

  const hist = seedHistory([set, { ...set, id: "b", createdAt: "2026-09-02T00:00:00.000Z", intro: "Bölüm 2", plan: { ...set.plan, ozet: "Bölüm 2" } }]);
  const h = hist["zaman-baglac|rutin"];
  assert.equal(h.episode, 2);
  assert.equal(h.ozet, "Bölüm 2");
  assert.ok(h.trKeys.includes(trKey("Kahvaltı yapmadan önce duş alırım.")));
  assert.equal(new Set(h.trKeys).size, h.trKeys.length);

  const ui = seedUi([set]);
  assert.equal(ui.connSeen.before, 2);
  assert.equal(ui.connSeen.but, 1);
  assert.equal(ui.reorderSeen, 2);
  assert.equal(ui.fastFlow, true);
  assert.deepEqual(patternIdsOf("karma:sevmek+tercih"), ["sevmek", "tercih"]);
});

test("cümle tekrarı ilk gün yığılmaz: 7 güne yayılır, günde en fazla 12", () => {
  const sets = Array.from({ length: 30 }, (_, i) => {
    const raw = v1Set();
    raw.createdAt = `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T0${i % 10}:00:00.000Z`;
    raw.patternId = `p${i}`;
    // Her sette farklı cümleler: anahtarlar çakışmasın.
    for (const s of raw.sentences) for (const st of s.steps) st.target = `${st.target} ${i}`;
    return upgradeSetV1(raw, "en");
  });
  const mem = seedMemory(sets, NOW);
  assert.equal(mem.length, 120);
  const perDay = new Map<number, number>();
  for (const m of mem) perDay.set(dayOf(m.dueAt), (perDay.get(dayOf(m.dueAt)) ?? 0) + 1);
  for (const [d, c] of perDay) {
    assert.ok(d >= 1, `gün ${d}`);
    assert.ok(c <= MEMORY_DAILY_CAP, `gün ${d}: ${c}`);
  }
  const few = seedMemory([upgradeSetV1(v1Set(), "en")], NOW);
  assert.ok(few.every((m) => dayOf(m.dueAt) >= 1 && dayOf(m.dueAt) <= 7));
});

test("mergeSets: v2 listesi + eski ekranın yazdığı v1 setleri, kimliğe göre tekil, en yeni önce", () => {
  const old = v1Set();
  const newer = { ...v1Set(), createdAt: "2026-09-05T00:00:00.000Z" };
  const v2 = [upgradeSetV1(old, "en")];
  const merged = mergeSets(v2, [old, newer], "en");
  assert.equal(merged.length, 2);
  assert.equal(merged[0].createdAt, "2026-09-05T00:00:00.000Z");
  assert.ok(merged.every((s) => s.v === 2));
  assert.deepEqual(mergeSets([], [], "en"), []);
});

test("göç: her dil için yeni anahtarlar yazılır, eskiler aynen kalır", () => {
  const sets = JSON.stringify([v1Set()]);
  const prog = JSON.stringify(masteredV1("zaman-baglac"));
  const entries: Record<string, string> = {
    "buildSets.v1": sets, // Arapça: eksiz anahtar
    "buildProgress.v1": prog,
    "buildSets.v1.en": sets,
    "vocab.v1": "[]",
  };
  const out = migrateBuildEntries(entries, NOW);
  for (const [k, v] of Object.entries(entries)) assert.equal(out[k], v, `eski anahtar değişti: ${k}`);
  for (const lang of ["ar", "en"]) {
    for (const base of ["buildSets2", "buildProgress2", "buildBlocks", "buildMemory", "buildHistory", "buildUi"]) {
      assert.ok(out[buildStoreKey(base, lang)] !== undefined, `${base} ${lang}`);
    }
  }
  const arSets = JSON.parse(out["buildSets2.v1"]);
  assert.equal(arSets[0].v, 2);
  assert.equal(arSets[0].lang, "ar");
  assert.equal(JSON.parse(out["buildSets2.v1.en"])[0].lang, "en");
  assert.equal(JSON.parse(out["buildProgress2.v1"])["zaman-baglac"].status, "verify");
  assert.deepEqual(JSON.parse(out["buildProgress2.v1.en"]), {});
  assert.equal(out["buildSets2.v1.fr"], undefined, "kaydı olmayan dile yazılmaz");
});

test("göç: var olan yeni anahtarın üstüne yazmaz; bozuk JSON çökertmez", () => {
  const out = migrateBuildEntries({ "buildSets.v1.de": "{bozuk", "buildUi.v1.de": '{"connSeen":{"weil":3},"reorderSeen":1,"fastFlow":false}' }, NOW);
  assert.deepEqual(JSON.parse(out["buildSets2.v1.de"]), []);
  assert.equal(JSON.parse(out["buildUi.v1.de"]).connSeen.weil, 3);
  const again = migrateBuildEntries(out, NOW);
  assert.deepEqual(again, out, "ikinci çalıştırma hiçbir şey değiştirmez");
});

test("migrateBuildLang: boş depo boş ama geçerli v2 yapısı verir", () => {
  const r = migrateBuildLang([], {}, "en", NOW);
  assert.deepEqual(r.sets, []);
  assert.deepEqual(r.memory, []);
  assert.deepEqual(r.ui, DEFAULT_BUILD_UI);
});

// ===========================================================================
// Oturma mantığı (tasarım §6, §9 buildmastery listesi)
// ===========================================================================

const T0 = new Date("2026-09-01T08:00:00.000Z");
const hoursLater = (h: number) => new Date(T0.getTime() + h * 3_600_000);
const ctx = (over: Partial<RecordCtx> = {}): RecordCtx => ({
  patternIds: ["sevmek"],
  themeId: "rutin",
  setId: "s1",
  usesFocus: true,
  focusIsNew: false,
  ...over,
});
const ev = (k: MasteryEvent["k"], sk: string, over: Partial<MasteryEvent> = {}): MasteryEvent => ({
  k,
  ok: 1,
  first: true,
  spoken: true,
  sk,
  ...over,
});

/**
 * Bütün ölçütleri tutan kalıp: iki temada 12 farklı yardımsız cümle, iki
 * setten geri dönüş, bir aktarım ve ertesi gün bir kanıt.
 */
function fullProgress(): ProgressMap2 {
  let m: ProgressMap2 = {};
  for (let i = 0; i < 12; i += 1) {
    const second = i >= 6;
    m = creditPattern(
      m,
      ctx({ themeId: second ? "is" : "rutin", setId: second ? "s2" : "s1", focusIsNew: i === 0 }),
      ev("oneshot", `cumle ${i}`),
      hoursLater(second ? 30 + i : i)
    );
  }
  return creditPattern(m, ctx(), ev("transfer", "aktarim"), hoursLater(50));
}

test("tam kanıtlı kalıp oturur; kontrol listesi her ölçütü gösterir", () => {
  const m = fullProgress();
  assert.equal(m.sevmek.status, "mastered");
  assert.equal(m.sevmek.masteredBy, "proof");
  assert.ok(isMastered(m.sevmek));
  assert.ok(masteryChecklist(m.sevmek).every((c) => c.ok));
  assert.ok(m.sevmek.srs.due, "oturunca tekrar takvimine girer");
  const empty = checklistText(masteryChecklist(undefined));
  assert.equal(empty, "12 farklı cümle 0/12 · 2 tema: eksik · geri dönüş 0/2: eksik · aktarım: eksik · ertesi gün: eksik");
});

test("aynı seti 3 kez oynamak farklı cümle sayısını artırmaz, oturtmaz", () => {
  let m: ProgressMap2 = {};
  for (let round = 0; round < 3; round += 1) {
    for (let i = 0; i < 6; i += 1) m = creditPattern(m, ctx(), ev("oneshot", `cumle ${i}`), hoursLater(round * 30 + i));
  }
  assert.equal(m.sevmek.proofKeys.length, 6);
  assert.equal(m.sevmek.proof.length, 6, "tekrar oynanan doğru cümle kanıt listesine yeniden girmez");
  assert.equal(isMastered(m.sevmek), false);
});

test("yeniden oynatma isabeti ne şişirir ne düşürür; tuzağı yalnız ölçüt (e) görür", () => {
  let m = creditPattern({}, ctx(), ev("oneshot", "a"), T0);
  for (let i = 0; i < 3; i += 1) {
    m = creditPattern(m, ctx(), ev("oneshot", "a"), hoursLater(1 + i));
    m = creditPattern(m, ctx(), ev("oneshot", "a", { ok: 0 }), hoursLater(1 + i));
  }
  assert.deepEqual(unscaffoldedAccuracy(m.sevmek), { n: 1, acc: 1 });
  assert.equal(m.sevmek.proof.length, 1);
  m = creditPattern(m, ctx(), ev("oneshot", "a", { ok: 0, trap: "t" }), hoursLater(5));
  assert.deepEqual(unscaffoldedAccuracy(m.sevmek), { n: 1, acc: 1 });
  assert.equal(masteryChecklist(m.sevmek).find((c) => c.id === "e")!.ok, false);
});

test("Bilmiyorum → tekrar → doğru: yalnız kopya, hiçbir şey sayılmaz", () => {
  let m = creditPattern({}, ctx(), ev("guided", "a", { ok: 0 }), T0);
  const before = m;
  m = creditPattern(m, ctx(), ev("copy", "a", { first: false }), T0);
  assert.equal(m, before);
  assert.equal(m.sevmek.learn.attempts, 1);
  assert.equal(m.sevmek.learn.firstTryOk, 0);
  assert.deepEqual(m.sevmek.proof, []);
  // İlk olmayan rehberli deneme de sayılmaz.
  assert.equal(creditPattern(m, ctx(), ev("guided", "a", { first: false }), T0).sevmek.learn.attempts, 1);
});

test("rehberli %100 ama yardımsız isabet %85 altı → oturmaz", () => {
  let m = fullProgress();
  for (let i = 0; i < 200; i += 1) m = creditPattern(m, ctx(), ev("guided", `g${i}`), hoursLater(60));
  // Oturduktan sonra değil, öncesinde düşük yardımsız isabet: sıfırdan kur.
  let low: ProgressMap2 = {};
  for (let i = 0; i < 100; i += 1) low = creditPattern(low, ctx(), ev("guided", `g${i}`), T0);
  for (let i = 0; i < 12; i += 1) {
    low = creditPattern(low, ctx({ themeId: i % 2 ? "is" : "rutin", setId: i % 2 ? "s2" : "s1" }), ev("oneshot", `c${i}`), hoursLater(i * 3));
    low = creditPattern(low, ctx(), ev("oneshot", `x${i}`, { ok: 0 }), hoursLater(i * 3));
  }
  low = creditPattern(low, ctx(), ev("transfer", "t"), hoursLater(40));
  assert.equal(low.sevmek.learn.firstTryOk, 100);
  assert.equal(low.sevmek.proofKeys.length, 12);
  const acc = masteryChecklist(low.sevmek).find((c) => c.id === "acc")!;
  assert.equal(acc.ok, false);
  assert.equal(isMastered(low.sevmek), false);
  assert.notEqual(low.sevmek.status, "mastered");
});

test("her ölçüt tek tek eksikken oturmaz", () => {
  const full = fullProgress().sevmek;
  const variants: [string, (p: P2) => P2][] = [
    ["a: 11 cümle", (p) => ({ ...p, proofKeys: p.proofKeys.slice(0, 11) })],
    ["b: tek tema", (p) => ({ ...p, themes: ["rutin"] })],
    ["b: geri dönüş yok", (p) => ({ ...p, recycledKeys: [], recycledSets: [] })],
    ["b: geri dönüş tek setten", (p) => ({ ...p, recycledSets: ["s1"] })],
    ["c: aktarım yok", (p) => ({ ...p, transferOk: 0 })],
    ["d: son geri çağırma yanlış", (p) => ({ ...p, retrieval: [1, 1, 0] })],
    ["e: son olaylarda tuzak", (p) => ({ ...p, proof: [...p.proof, { ...p.proof[0], k: "guided", ok: 0, trap: "with-by" }] })],
    ["f: ertesi gün yok", (p) => ({ ...p, proof: p.proof.map((e) => ({ ...e, at: p.firstProofAt! })) })],
  ];
  for (const [name, f] of variants) assert.equal(isMastered(f(full)), false, name);
  assert.equal(isMastered({ ...full, retrieval: [0, 1, 1] }), true, "2/3 ve sonuncusu doğru");
});

test("rehberli ilk denemedeki tuzak, son 6 olayda oturmayı engeller", () => {
  let m = fullProgress();
  const p0 = { ...m.sevmek, status: "proving" as const };
  m = creditPattern({ sevmek: p0 }, ctx(), ev("guided", "g", { ok: 0, trap: "ar-maa-bi" }), hoursLater(60));
  assert.equal(isMastered(m.sevmek), false);
  assert.equal(m.sevmek.status, "proving");
  // Altı temiz yardımsız olaydan sonra tuzak pencereden çıkar.
  for (let i = 0; i < 6; i += 1) m = creditPattern(m, ctx(), ev("retell", `yeni ${i}`), hoursLater(61 + i));
  // Tuzağı olan kalıp geri çağırma da ister (ölçüt d): 3'te 2 ve sonuncusu doğru.
  assert.equal(m.sevmek.status, "proving");
  assert.equal(masteryChecklist(m.sevmek).find((c) => c.id === "d")?.ok, false);
  for (const ok of [1, 1] as const) m = creditPattern(m, ctx(), ev("retrieval", "r", { ok }), hoursLater(70));
  assert.equal(m.sevmek.status, "mastered");
});

test("tuzak taşı öğreten kalıp, öğrenci tuzağa hiç düşmese de geri çağırma ister (d)", () => {
  let m: ProgressMap2 = {};
  for (let i = 0; i < 12; i += 1) {
    const second = i >= 6;
    m = creditPattern(
      m,
      ctx({ themeId: second ? "is" : "rutin", setId: second ? "s2" : "s1", focusIsNew: i === 0, trapBlocks: i === 0 }),
      ev("oneshot", `cumle ${i}`),
      hoursLater(second ? 30 + i : i)
    );
  }
  m = creditPattern(m, ctx(), ev("transfer", "aktarim"), hoursLater(50));
  assert.equal(m.sevmek.trapBlocks, true);
  assert.equal(m.sevmek.status, "proving");
  assert.equal(masteryChecklist(m.sevmek).find((c) => c.id === "d")?.ok, false);
  for (const ok of [1, 1] as const) m = creditPattern(m, ctx(), ev("retrieval", "r", { ok }), hoursLater(51));
  assert.equal(m.sevmek.status, "mastered");
  // Tuzaksız kalıpta (d) listede yok.
  assert.equal(masteryChecklist(fullProgress().sevmek).some((c) => c.id === "d"), false);
});

test("son eksik ölçüt geri dönüşse kalıp geri dönüş kredisiyle hemen oturur", () => {
  const full = fullProgress().sevmek;
  const start: ProgressMap2 = { sevmek: { ...full, status: "proving", masteredBy: undefined, recycledKeys: [], recycledSets: [] } };
  const block: BlockProgress = {
    target: "early", tr: "erken", kind: "adverb", note: "", contrast: "", firstPatternId: "sevmek", firstSetId: "s1",
    firstSentence: 0, contrastShown: false, producedOk: 1, recycledOkKeys: [], sets: ["s1"], trapMiss: 0,
    retrievalOk: 0, retrievalMiss: 0, lastSeen: T0.toISOString(),
  };
  let m = creditRecycled(start, { setId: "s7" }, ev("oneshot", "x1", { recKeys: ["early"] }), { early: block }, hoursLater(60));
  assert.equal(m.sevmek.status, "proving");
  m = creditRecycled(m, { setId: "s8" }, ev("oneshot", "x2", { recKeys: ["early"] }), { early: block }, hoursLater(61));
  assert.equal(m.sevmek.status, "mastered");
  assert.equal(m.sevmek.masteredBy, "proof");
});

test("aktarım: yalnız denetlenen, ilk denemede ve temiz aktarım sayılır (açık uç hiç kaydedilmez)", () => {
  let m: ProgressMap2 = {};
  m = creditPattern(m, ctx(), ev("transfer", "t", { ok: 0.5, spoken: false }), T0);
  m = creditPattern(m, ctx(), ev("pair", "p", { first: false }), T0);
  m = creditPattern(m, ctx(), ev("copy", "o"), T0);
  assert.equal(m.sevmek.transferOk, 0);
  assert.equal(masteryChecklist(m.sevmek).find((c) => c.id === "c")!.ok, false);
  m = creditPattern(m, ctx(), ev("pair", "p2"), T0);
  assert.equal(m.sevmek.transferOk, 1);
});

test("odak kalıbın geçmediği cümle (usesFocus:false) kalıba kredi vermez", () => {
  assert.deepEqual(creditPattern({}, ctx({ usesFocus: false }), ev("oneshot", "a"), T0), {});
  // Karma sette her kalıp kredi alır.
  const k = creditPattern({}, ctx({ patternIds: ["sevmek", "tercih"] }), ev("oneshot", "a"), T0);
  assert.deepEqual(Object.keys(k).sort(), ["sevmek", "tercih"]);
});

test("geri dönüş kredisi taşın İLK kalıbına gider; taş hafızası üretim/tuzak/geri çağırmayı yazar", () => {
  const block: BlockProgress = {
    target: "by bus", tr: "otobüsle", kind: "caseSplit", note: "", contrast: "", firstPatternId: "vasita",
    firstSetId: "s0", firstSentence: 0, contrastShown: true, producedOk: 1, recycledOkKeys: [], sets: ["s0"],
    trapMiss: 0, retrievalOk: 0, retrievalMiss: 0, lastSeen: T0.toISOString(),
  };
  const st = recordEvent(
    { progress: {}, blocks: { "by bus": block } },
    ctx({ patternIds: ["zaman-baglac"], setId: "s5" }),
    ev("guided", "i go to work by bus", { rec: true, recKeys: ["by bus"], blockKeys: ["by bus"] }),
    T0
  );
  assert.deepEqual(st.progress.vasita.recycledKeys, ["i go to work by bus"]);
  assert.deepEqual(st.progress.vasita.recycledSets, ["s5"]);
  assert.equal(st.progress["zaman-baglac"].recycledKeys.length, 0);
  assert.equal(st.blocks["by bus"].producedOk, 2);
  assert.deepEqual(st.blocks["by bus"].recycledOkKeys, ["i go to work by bus"]);
  // Yarım kredi ya da ilk olmayan deneme geri dönüş vermez.
  assert.deepEqual(creditRecycled({}, { setId: "s" }, ev("oneshot", "x", { ok: 0.5, recKeys: ["by bus"] }), { "by bus": block }), {});
  const trap = recordBlockEvent({ "by bus": block }, ev("guided", "x", { ok: 0, trap: "with-by", blockKeys: ["by bus"] }), T0);
  assert.equal(trap["by bus"].trapMiss, 1);
  const ret = recordBlockEvent(trap, ev("retrieval", "x", { ok: 0, blockKeys: ["by bus"] }), T0);
  assert.equal(ret["by bus"].retrievalMiss, 1);
});

test("taş oturması: 3 farklı cümle, 2 set, bir geri dönüş, son 3 kullanımda tuzak yok", () => {
  const base: BlockProgress = {
    target: "early", tr: "erken", kind: "adverb", note: "", contrast: "", firstPatternId: "sevmek", firstSetId: "s1",
    firstSentence: 0, contrastShown: false, producedOk: 0, recycledOkKeys: [], sets: ["s1", "s2"], trapMiss: 0,
    retrievalOk: 0, retrievalMiss: 0, lastSeen: T0.toISOString(),
  };
  let b: Record<string, BlockProgress> = { early: base };
  for (const [sk, rec] of [["a", false], ["b", false], ["a", false]] as const) b = recordBlockEvent(b, ev("guided", sk, { rec, blockKeys: ["early"] }), T0);
  assert.equal(isBlockMastered(b.early), false, "yalnız 2 farklı cümle, geri dönüş yok");
  b = recordBlockEvent(b, ev("oneshot", "c", { rec: true, blockKeys: ["early"] }), T0);
  assert.equal(isBlockMastered(b.early), true);
  b = recordBlockEvent(b, ev("guided", "d", { ok: 0, trap: "t", blockKeys: ["early"] }), T0);
  assert.equal(isBlockMastered(b.early), false);
});

test("cümle tekrarı: aralıklar ilerler, yanlış sıfırlar; tavan budaması oturmuşları önce atar", () => {
  const set = upgradeSetV1(v1Set(), "en");
  let it = memoryItem(set, 1, NOW.toISOString())!;
  assert.equal(it.focus, true);
  for (let i = 1; i <= 3; i += 1) {
    it = scheduleMemory(it, true, NOW);
    assert.equal(it.stage, i);
    assert.equal(dayOf(it.dueAt), MEMORY_INTERVALS[i]);
  }
  it = scheduleMemory(it, false, NOW);
  assert.equal(it.stage, 0);
  assert.equal(it.lapses, 1);
  assert.equal(dayOf(it.dueAt), 1);
  const many: SentenceMemory[] = Array.from({ length: 5 }, (_, i) => ({ ...it, key: `k${i}`, stage: i === 3 ? 6 : 1, lapses: 0 }));
  const pruned = pruneMemory(many, 4);
  assert.deepEqual(pruned.map((m) => m.key), ["k0", "k1", "k2", "k4"]);
  assert.deepEqual(reviewMemory(many, "k2", true, NOW).find((m) => m.key === "k2")!.stage, 2);
});

test("Tekrar zamanı: günde en fazla 12, kalıba göre karışık; vadeli kalıptan 2 cümle, yetmezse yoklama", () => {
  const set = upgradeSetV1(v1Set(), "en");
  const base = memoryItem(set, 0, "2026-09-29T00:00:00.000Z")!;
  const mem: SentenceMemory[] = Array.from({ length: 20 }, (_, i) => ({
    ...base,
    key: `k${i}`,
    patternIds: [i % 2 ? "sevmek" : "gecmis"],
  }));
  const plan = reviewQueue({}, mem, NOW);
  assert.equal(plan.items.length, 12);
  assert.equal(plan.items[0].key, "k0");
  assert.equal(plan.items[1].key, "k1", "kalıplar sırayla");
  assert.equal(plan.total, 12);
  // Bugün 5 tekrar yapıldıysa kalan 7.
  const done = mem.map((m, i) => (i < 5 ? { ...m, lastAt: NOW.toISOString(), dueAt: "2026-10-10T00:00:00.000Z" } : m));
  assert.equal(reviewQueue({}, done, NOW).items.filter((x) => x.why === "due").length, 7);
  // Vadesi gelen doğrulanacak kalıp: kayıtlı cümlesinden 2; hiç yoksa yoklama.
  const future = mem.map((m) => ({ ...m, dueAt: "2026-12-01T00:00:00.000Z" }));
  const verify: ProgressMap2 = {
    sevmek: { ...newProgress(NOW.toISOString()), status: "verify", masteredBy: "legacy", srs: { stage: 0, lapses: 0, due: "2026-09-29T00:00:00.000Z" } },
    olmak: { ...newProgress(NOW.toISOString()), status: "verify", masteredBy: "test", srs: { stage: 0, lapses: 0, due: "2026-09-29T00:00:00.000Z" } },
  };
  const p2 = reviewQueue(verify, future, NOW);
  assert.deepEqual(p2.items.map((x) => x.why), ["pattern", "pattern"]);
  assert.deepEqual(p2.probe, ["olmak"]);
  assert.equal(p2.total, 4);
  // Anlatım takvimi: 1 → 4 → 10 gün, sonra çıkar.
  let ui = scheduleRetell(DEFAULT_BUILD_UI, set.id, new Date("2026-09-28T00:00:00.000Z"));
  assert.equal(reviewQueue({}, [], NOW, { ui, setIds: [set.id] }).retellSetId, set.id);
  ui = advanceRetell(ui, set.id, NOW);
  assert.equal(ui.retells![set.id].stage, 1);
  ui = advanceRetell(advanceRetell(ui, set.id, NOW), set.id, NOW);
  assert.equal(ui.retells![set.id], undefined);
});

test("sına ve geç → verify → doğru tekrar → oturdu", () => {
  const fail = applyTestOut({}, "sevmek", { oks: [1, 1, 0, 0], trap: false }, T0);
  assert.equal(fail.passed, false);
  assert.equal(fail.progress.sevmek.status, "learning");
  const trap = applyTestOut({}, "sevmek", { oks: [1, 1, 1, 1], trap: true }, T0);
  assert.equal(trap.passed, false);
  const pass = applyTestOut({}, "sevmek", { oks: [1, 1, 0.5, 0], trap: false }, T0);
  assert.equal(pass.passed, true);
  assert.equal(pass.progress.sevmek.status, "verify");
  assert.equal(pass.progress.sevmek.masteredBy, "test");
  assert.equal(isPatternDue(pass.progress.sevmek, T0), false);
  const later = hoursLater(49);
  assert.equal(isPatternDue(pass.progress.sevmek, later), true);
  const m = creditPattern(pass.progress, ctx({ setId: "", themeId: "" }), ev("review", "r1"), later);
  assert.equal(m.sevmek.status, "mastered");
  assert.equal(m.sevmek.srs.stage, 1);
});

test("tekrar kaçırılınca 'soluyor'; art arda ikinci kaçırma 'öğreniyor'a döner", () => {
  const start: ProgressMap2 = { sevmek: { ...fullProgress().sevmek } };
  let m = creditPattern(start, ctx(), ev("review", "cumle 1", { ok: 0 }), hoursLater(300));
  assert.equal(m.sevmek.status, "slipping");
  assert.equal(nextFocus(m, "A1", hoursLater(300)).kind, "slipping");
  // Aynı oturumdaki ikinci yanlış ikinci kaçırma sayılmaz.
  m = creditPattern(m, ctx(), ev("review", "cumle 2", { ok: 0 }), hoursLater(300.2));
  assert.equal(m.sevmek.status, "slipping");
  m = creditPattern(m, ctx(), ev("review", "cumle 3", { ok: 0 }), hoursLater(330));
  assert.equal(m.sevmek.status, "learning");
  assert.equal(m.sevmek.masteredBy, undefined);
  // Soluyan kalıp yalnız GECİKMELİ bir doğru tekrarla geri döner: aynı oturumdaki doğru sayılmaz.
  const s = creditPattern(start, ctx(), ev("review", "cumle 1", { ok: 0 }), hoursLater(300));
  const same = creditPattern(s, ctx(), ev("review", "cumle 4"), hoursLater(300.1));
  assert.equal(same.sevmek.status, "slipping");
  const back = creditPattern(same, ctx(), ev("review", "cumle 4"), hoursLater(325));
  assert.equal(back.sevmek.status, "mastered");
});

test("doğrulama oturumunda bir yanlış bir doğru: sıra sonucu değiştirmez, kalıp soluyor", () => {
  const pass = applyTestOut({}, "sevmek", { oks: [1, 1, 1, 0], trap: false }, T0).progress;
  const at = hoursLater(49);
  const c = ctx({ setId: "", themeId: "" });
  const missFirst = creditPattern(creditPattern(pass, c, ev("review", "r1", { ok: 0 }), at), c, ev("review", "r2"), new Date(at.getTime() + 60_000));
  const hitFirst = creditPattern(creditPattern(pass, c, ev("review", "r2"), at), c, ev("review", "r1", { ok: 0 }), new Date(at.getTime() + 60_000));
  assert.equal(missFirst.sevmek.status, "slipping");
  assert.equal(hitFirst.sevmek.status, "slipping");
  // Ertesi günkü doğru kalıbı yeniden oturtur.
  const next = creditPattern(missFirst, c, ev("review", "r3"), hoursLater(49 + 24));
  assert.equal(next.sevmek.status, "mastered");
});

test("nextFocus önceliği: soluyan/vadeli doğrulama → seçilen → seviye → üstü → karma", () => {
  const at = NOW.toISOString();
  const mk = (status: P2["status"], due?: string): P2 => ({ ...newProgress(at), status, srs: { stage: 0, lapses: 0, due } });
  assert.equal(nextFocus({}, "A1", NOW).patterns[0].id, PATTERN_LADDER[0].id);
  assert.equal(nextFocus({}, "B1", NOW, "sevmek").patterns[0].id, "sevmek");
  assert.equal(nextFocus({}, "B1", NOW, "sevmek").kind, "override");
  // Oturmuş kalıp seçilse de yeniden rehberli set olmaz.
  assert.equal(nextFocus({ sevmek: mk("mastered", "2027-01-01T00:00:00.000Z") }, "B1", NOW, "sevmek").kind, "learn");
  const due = { gecmis: mk("verify", "2026-09-01T00:00:00.000Z"), sevmek: mk("verify", "2027-01-01T00:00:00.000Z") };
  assert.deepEqual([nextFocus(due, "A1", NOW, "olmak").kind, nextFocus(due, "A1", NOW).patterns[0].id], ["verify", "gecmis"]);
  // A1 bitmişse seviye A1 öğrencisine üst seviye.
  const a1: ProgressMap2 = {};
  for (const p of PATTERN_LADDER.filter((x) => x.band === "A1")) a1[p.id] = mk("mastered", "2027-01-01T00:00:00.000Z");
  const f = nextFocus(a1, "A1", NOW);
  assert.equal(f.kind, "above");
  assert.equal(f.patterns[0].band, "A2");
  // Merdiven bitti: farklı seviyelerden 2–3 kalıp, en zayıf önce.
  const all: ProgressMap2 = {};
  for (const p of PATTERN_LADDER) all[p.id] = mk("mastered", "2027-01-01T00:00:00.000Z");
  all.sevmek = { ...all.sevmek, srs: { ...all.sevmek.srs, lapses: 1 } };
  const k = nextFocus(all, "C2", NOW);
  assert.equal(k.kind, "karma");
  assert.ok(k.patterns.length >= 2 && k.patterns.length <= 3);
  assert.equal(k.patterns[0].id, "sevmek");
  assert.equal(new Set(k.patterns.map((p) => p.band)).size, k.patterns.length);
  assert.equal(karmaPatterns({ olmak: mk("mastered"), istek: mk("mastered") }).length, 2, "tek seviyede de iki kalıp");
});

test("yerleştirme: A2+ ve ilerleme yoksa önerilir; 2/2 → verify, ilk kalan odak, altı geçilmiş sayılır", () => {
  assert.equal(shouldOfferPlacement({}, DEFAULT_BUILD_UI, "A1"), false);
  assert.equal(shouldOfferPlacement({}, DEFAULT_BUILD_UI, "B1"), true);
  assert.equal(shouldOfferPlacement({}, { placementDone: true }, "B1"), false);
  const pats = placementPatterns("A2");
  assert.ok(pats.every((p) => p.probe && (p.band === "A1" || p.band === "A2")));
  assert.equal(nextPlacementBatch("A2", {}).length, Math.min(8, pats.length));
  const out: Record<string, { oks: number[]; trap: boolean }> = {};
  for (const p of pats) out[p.id] = { oks: [1, 1], trap: false };
  out.sevmek = { oks: [1, 0], trap: false };
  assert.deepEqual(nextPlacementBatch("A2", out), [], "kalan kalıptan sonra yürüyüş durur");
  const r = applyPlacement({}, "A2", out, NOW);
  assert.equal(r.focus, "sevmek");
  assert.equal(r.progress.sevmek.status, "learning");
  assert.equal(r.progress.gecmis.status, "verify");
  assert.equal(r.progress.gecmis.masteredBy, "test");
  const d = dayOf(r.progress.gecmis.srs.due!);
  assert.ok(d >= 2 && d <= 3, `vade ${d}`);
  assert.equal(r.progress.olmak.status, "verify", "yoklanmayan alt basamak temsilcileriyle geçildi");
  assert.equal(r.progress["tercih"], undefined, "ilk kalanın üstündeki yoklanmamış kalıp açık kalır");
  assert.equal(shouldOfferPlacement(r.progress, DEFAULT_BUILD_UI, "B1"), false);
  assert.equal(nextFocus(r.progress, "A2", NOW).patterns[0].id, "sevmek");
  const trap = applyPlacement({}, "A1", { olmak: { oks: [1, 1], trap: true } }, NOW);
  assert.equal(trap.progress.olmak.status, "learning");
});

test("yeni basamaklar oturmuş kalıbın altındaysa dayatılmaz; 2 cümlelik yoklama", () => {
  const at = NOW.toISOString();
  const map: ProgressMap2 = {};
  for (const id of ["olmak", "var-yok", "sahip", "genis-zaman", "istek", "olumsuz"]) map[id] = { ...newProgress(at), status: "verify", srs: { stage: 0, lapses: 0, due: "2027-01-01T00:00:00.000Z" } };
  const pending = pendingNewPatterns(map).map((p) => p.id);
  assert.ok(pending.includes("belirtme"));
  assert.notEqual(nextFocus(map, "A1", NOW).patterns[0].id, "belirtme");
  const done = applyNewStepProbe(map, { belirtme: { oks: [1, 1], trap: false }, "yon-yer": { oks: [0, 1], trap: false } }, NOW);
  assert.equal(done.belirtme.status, "verify");
  assert.equal(done["yon-yer"].status, "learning");
});

test("ÖĞRENİLMİŞ TAŞLAR: bütün temalardan, önce zayıflar, en fazla 10; bağlaç yok", () => {
  const mk = (target: string, over: Partial<BlockProgress> = {}): BlockProgress => ({
    target, tr: target, kind: "lexical", note: "", contrast: "", firstPatternId: "p", firstSetId: "s", firstSentence: 0,
    contrastShown: false, producedOk: 1, recycledOkKeys: [], sets: ["s"], trapMiss: 0, retrievalOk: 0, retrievalMiss: 0,
    lastSeen: "2026-09-29T00:00:00.000Z", ...over,
  });
  const blocks: Record<string, BlockProgress> = { before: mk("before", { kind: "connector", trapMiss: 5 }) };
  for (let i = 0; i < 12; i += 1) blocks[`w${i}`] = mk(`w${i}`);
  blocks.trap = mk("with", { trapMiss: 2 });
  blocks.old = mk("old one", { lastSeen: "2026-08-01T00:00:00.000Z" });
  const list = recycleCandidates(blocks, NOW);
  assert.equal(list.length, 10);
  assert.deepEqual(list.slice(0, 2), ["with", "old one"]);
  assert.ok(!list.includes("before"));
});

test("bildiği kelimeler: zorlandıkları + en yeniler, en fazla 40", () => {
  const card = (i: number, lapses = 0): VocabCard =>
    ({ id: `${i}`, arabic: `w${i}`, transliteration: "", turkish: "", track: "konusma", addedAt: new Date(T0.getTime() + i * 1000).toISOString(), due: "", intervalDays: 1, ease: 2.5, reps: 1, lapses }) as VocabCard;
  const cards = Array.from({ length: 60 }, (_, i) => card(i, i === 3 ? 4 : 0));
  const words = knownWords(cards);
  assert.equal(words.length, 40);
  assert.equal(words[0], "w3", "zorlanılan önce");
  assert.ok(words.includes("w59") && !words.includes("w5"));
});

test("yerleştirmede kalan yeni basamak, geçilenlerin altında kalsa da odak olur", () => {
  const pats = placementPatterns("A2").slice(0, 8);
  const out: Record<string, { oks: number[]; trap: boolean }> = {};
  for (const p of pats) out[p.id] = { oks: [1, 1], trap: false };
  out.vasita = { oks: [0, 0], trap: false };
  const r = applyPlacement({}, "A2", out, NOW);
  assert.equal(r.focus, "vasita");
  assert.equal(nextFocus(r.progress, "A2", NOW).patterns[0].id, "vasita");
  assert.ok(pendingNewPatterns(r.progress).some((p) => p.id === "iyelik"), "atlanan yeni basamaklar yoklamaya");
});
