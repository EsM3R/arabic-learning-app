/**
 * İstatistik çekirdeği testleri.
 * Çalıştırma: npm test  (node --experimental-strip-types --test tests/*.test.ts)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { bump, dateKey, prune, summarize } from "../src/stats.ts";

const NOW = new Date(2026, 7, 28, 14, 30); // 28 Ağustos 2026, yerel

test("dateKey yerel günü YYYY-MM-DD üretir", () => {
  assert.equal(dateKey(NOW), "2026-08-28");
  assert.equal(dateKey(new Date(2026, 0, 3)), "2026-01-03");
});

test("bump sayaç artırır ve girdiyi değiştirmez (immutable)", () => {
  const m0 = {};
  const m1 = bump(m0, "2026-08-28", "produced");
  const m2 = bump(m1, "2026-08-28", "produced", 2);
  assert.deepEqual(m0, {});
  assert.equal(m1["2026-08-28"].produced, 1);
  assert.equal(m2["2026-08-28"].produced, 3);
});

test("bump farklı olayları aynı günde ayrı sayar", () => {
  let m = bump({}, "2026-08-28", "produced");
  m = bump(m, "2026-08-28", "shadowed", 5);
  assert.deepEqual(m["2026-08-28"], { produced: 1, shadowed: 5 });
});

test("prune eski günleri düşürür, sınırdakini tutar", () => {
  let m = bump({}, "2026-01-01", "produced");
  m = bump(m, "2026-03-01", "produced");
  m = bump(m, "2026-08-28", "produced");
  const pruned = prune(m, NOW, 180); // 180 gün ≈ 1 Mart
  assert.equal(pruned["2026-01-01"], undefined);
  assert.ok(pruned["2026-03-01"]);
  assert.ok(pruned["2026-08-28"]);
});

test("summarize: bugün / hafta / toplam ayrımı", () => {
  let m = bump({}, "2026-08-28", "produced", 3); // bugün
  m = bump(m, "2026-08-25", "produced", 2); // bu hafta
  m = bump(m, "2026-08-01", "produced", 10); // sadece toplamda
  const s = summarize(m, NOW);
  assert.equal(s.today.produced, 3);
  assert.equal(s.week.produced, 5);
  assert.equal(s.total.produced, 15);
});

test("summarize: aktif gün sayıları pencerelere göre", () => {
  let m = bump({}, "2026-08-28", "reviewed"); // bugün
  m = bump(m, "2026-08-27", "shadowed"); // dün
  m = bump(m, "2026-08-10", "produced"); // 18 gün önce → sadece 30'luk
  m = bump(m, "2026-05-01", "produced"); // pencere dışı
  const s = summarize(m, NOW);
  assert.equal(s.activeDays7, 2);
  assert.equal(s.activeDays30, 3);
});

test("summarize boş haritayla çalışır", () => {
  const s = summarize({}, NOW);
  assert.deepEqual(s.today, {});
  assert.equal(s.activeDays7, 0);
});

test("hafta penceresi bugünü içerir, 7 gün öncesini içermez", () => {
  let m = bump({}, "2026-08-22", "produced", 1); // 6 gün önce → dahil
  m = bump(m, "2026-08-21", "produced", 100); // 7 gün önce → hariç
  const s = summarize(m, NOW);
  assert.equal(s.week.produced, 1);
});
