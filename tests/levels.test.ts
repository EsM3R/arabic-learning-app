/** Seviye merdiveni ve seviye değişimi kapısı testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isLevel,
  levelIndex,
  LEVELS,
  normalizeLevel,
  validateLevelChange,
} from "../src/levels.ts";

test("merdiven A0'dan C2'ye, sırası doğru", () => {
  assert.deepEqual([...LEVELS], ["A0", "A1", "A2", "B1", "B2", "C1", "C2"]);
  assert.equal(levelIndex("A0"), 0);
  assert.equal(levelIndex("C2"), 6);
  assert.equal(levelIndex("Orta"), -1);
});

test("isLevel / normalizeLevel: serbest yazım merdivene oturur", () => {
  assert.equal(isLevel("B1"), true);
  assert.equal(isLevel("b1"), false); // ham kontrol büyük harf ister
  assert.equal(normalizeLevel(" b1 "), "B1");
  assert.equal(normalizeLevel("a 2"), "A2");
  assert.equal(normalizeLevel("B1-B2"), null);
  assert.equal(normalizeLevel("Orta"), null);
  assert.equal(normalizeLevel(3), null);
  assert.equal(normalizeLevel(undefined), null);
});

test("tek kademe yükseliş kabul edilir", () => {
  const r = validateLevelChange("A1", "A2");
  assert.equal(r.value, "A2");
  assert.equal(r.error, undefined);
});

test("aynı seviyeye yazmak serbest (zayıf yön güncellemesi bunu kullanır)", () => {
  const r = validateLevelChange("B1", "B1");
  assert.equal(r.value, "B1");
  assert.equal(r.error, undefined);
});

test("çok kademe sıçrama reddedilir, mevcut seviye korunur ve gerekçe döner", () => {
  const r = validateLevelChange("A1", "C1");
  assert.equal(r.value, "A1");
  assert.match(r.error ?? "", /sıçraması kabul edilmiyor/);
  assert.match(r.error ?? "", /A2/); // izin verilen bir sonraki kademeyi söyler
});

test("düşüş serbest: hoca öğrencinin geride olduğunu söyleyebilmeli", () => {
  const r = validateLevelChange("B2", "A2");
  assert.equal(r.value, "A2");
  assert.equal(r.error, undefined);
});

test("geçersiz yazım reddedilir, mevcut korunur", () => {
  for (const bad of ["Orta", "B1-B2", "", 5, null]) {
    const r = validateLevelChange("A2", bad);
    assert.equal(r.value, "A2");
    assert.match(r.error ?? "", /Geçersiz seviye/);
  }
});

test("bozuk mevcut seviye: merdivene oturtmak kabul edilir", () => {
  const r = validateLevelChange("Orta", "B1");
  assert.equal(r.value, "B1");
  assert.equal(r.error, undefined);
});
