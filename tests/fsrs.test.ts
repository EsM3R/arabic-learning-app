/** FSRS-5 saf çekirdek testleri — altın değerler formüllerin bağımsız node uygulamasından. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FACTOR,
  initDifficulty,
  initStability,
  intervalForRetention,
  nextDifficulty,
  nextIntervalDays,
  retrievability,
  stabilityAfterLapse,
  stabilityAfterRecall,
  stabilityShortTerm,
} from "../src/fsrs.ts";

const approx = (a: number, b: number, tol = 1e-3) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b} (tol ${tol})`);

test("sabitler: FACTOR = 19/81; R(0)=1; R(S,S)=0.9; I(S,0.9)=S", () => {
  approx(FACTOR, 19 / 81, 1e-9);
  for (const s of [0.5, 3, 30, 365]) {
    approx(retrievability(0, s), 1, 1e-9);
    approx(retrievability(s, s), 0.9, 1e-9);
    approx(intervalForRetention(s, 0.9), s, 1e-9);
  }
});

test("başlangıç değerleri S0 ve D0", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((g) => initStability(g as 1)),
    [0.40255, 1.18385, 3.173, 15.69105]
  );
  const d0 = [1, 2, 3, 4].map((g) => initDifficulty(g as 1));
  approx(d0[0], 7.1949);
  approx(d0[1], 6.488305);
  approx(d0[2], 5.282434);
  approx(d0[3], 3.224502);
});

test("kısa dönem çarpanları ve sıralaması", () => {
  approx(stabilityShortTerm(1, 3), 1.407771);
  approx(stabilityShortTerm(1, 1), 0.501029);
  const s = 5;
  assert.ok(stabilityShortTerm(s, 1) < s);
  assert.ok(s < stabilityShortTerm(s, 3));
  assert.ok(stabilityShortTerm(s, 3) < stabilityShortTerm(s, 4));
});

test("bilinen zincir: Good(+3g) → Again(+11g) → kısa-dönem Good", () => {
  let S = 3.173;
  let D = 5.282434;
  // 3 gün sonra Good
  const r1 = retrievability(3, S);
  approx(r1, 0.904698);
  const S1 = stabilityAfterRecall(D, S, r1, 3);
  const D1 = nextDifficulty(D, 3);
  approx(S1, 10.738926);
  approx(D1, 5.272968);
  assert.equal(nextIntervalDays(S1), 11);
  // 11 gün sonra Again
  const r2 = retrievability(11, S1);
  approx(r2, 0.897929);
  const S2 = stabilityAfterLapse(D1, S1, r2);
  const D2 = nextDifficulty(D1, 1);
  approx(S2, 2.185775);
  assert.ok(S2 <= S1);
  approx(D2, 6.790568);
  // 10 dk sonra kısa-dönem Good
  const S3 = stabilityShortTerm(S2, 3);
  approx(S3, 3.077071);
  assert.equal(nextIntervalDays(S3), 3);
});

test("nextIntervalDays sınırları", () => {
  assert.equal(nextIntervalDays(0.2), 1);
  assert.equal(nextIntervalDays(3.173), 3);
  assert.equal(nextIntervalDays(15.69105), 16);
  assert.equal(nextIntervalDays(10000), 365);
});

test("özellikler: monotonluk ve sınırlar (ızgara)", () => {
  const Ds = [1, 3, 5.5, 8, 10];
  const Ss = [0.1, 1, 10, 100, 300];
  const Rs = [0.5, 0.7, 0.9, 0.99];
  for (const d of Ds)
    for (const s of Ss)
      for (const r of Rs) {
        const hard = stabilityAfterRecall(d, s, r, 2);
        const good = stabilityAfterRecall(d, s, r, 3);
        const easy = stabilityAfterRecall(d, s, r, 4);
        assert.ok(hard < good && good < easy, `recall sıralı değil d=${d} s=${s} r=${r}`);
        assert.ok(hard > s, "başarı stability büyütmeli");
        const lapse = stabilityAfterLapse(d, s, r);
        assert.ok(lapse <= s && lapse > 0);
        // Not sıralaması her d'de kesin: Again ≥ Hard ≥ Good ≥ Easy.
        assert.ok(nextDifficulty(d, 1) >= nextDifficulty(d, 2));
        assert.ok(nextDifficulty(d, 2) >= nextDifficulty(d, 3));
        assert.ok(nextDifficulty(d, 3) >= nextDifficulty(d, 4));
        // Mutlak yön, ortalamaya-dönüş tavana yaklaşınca bozulur (d=10'da
        // Again bile D0(4) çapasına doğru kıl payı düşürür) — o yüzden
        // yalnız iç bölgede iddia ediyoruz.
        if (d <= 8) assert.ok(nextDifficulty(d, 1) >= d - 1e-12);
        if (d >= 3) assert.ok(nextDifficulty(d, 4) <= d + 1e-12);
        for (const g of [1, 2, 3, 4] as const) {
          const nd = nextDifficulty(d, g);
          assert.ok(nd >= 1 && nd <= 10);
        }
      }
  // retrievability: t'de azalan, S'de artan
  assert.ok(retrievability(5, 10) > retrievability(9, 10));
  assert.ok(retrievability(5, 20) > retrievability(5, 10));
  // uç difficulty birikimi
  let d = initDifficulty(1);
  for (let i = 0; i < 20; i++) d = nextDifficulty(d, 1);
  approx(d, 9.9031, 0.01);
  assert.ok(d <= 10);
  let d2 = initDifficulty(4);
  for (let i = 0; i < 20; i++) d2 = nextDifficulty(d2, 4);
  approx(d2, 1, 0.01);
});
