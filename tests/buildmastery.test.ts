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
import { MASTER_SENTENCES, recordAttempt, trKey, upgradeSetV1 } from "../src/sentencebuilding.ts";
import type { ProgressMap } from "../src/sentencebuilding.ts";

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
