/** SRS durum makinesi + SM-2→FSRS göç testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { initDifficulty } from "../src/fsrs.ts";
import {
  cardMemory,
  deckStats,
  difficultyFromEase,
  dueCards,
  easeFromDifficulty,
  gradeCard,
  newCard,
  strugglingCards,
} from "../src/srs.ts";
import type { VocabCard } from "../src/types.ts";

const approx = (a: number, b: number, tol = 1e-3) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b} (tol ${tol})`);

const NOW = new Date("2026-08-28T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

/** Eski (SM-2) şemada kart üretir — stability/difficulty alanları YOK. */
function legacyCard(over: Partial<VocabCard>): VocabCard {
  return {
    id: "v1",
    arabic: "سوق",
    transliteration: "suk",
    turkish: "çarşı",
    track: "konusma",
    addedAt: daysAgo(30),
    due: NOW.toISOString(),
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    ...over,
  };
}

test("ease↔difficulty haritası ve struggling paritesi", () => {
  approx(difficultyFromEase(1.3), 10);
  approx(difficultyFromEase(2.1), 6.855, 0.01);
  approx(difficultyFromEase(2.5), 5.282434);
  approx(difficultyFromEase(3.0), 3.3168, 0.01);
  approx(difficultyFromEase(NaN), 5.282434);
  // roundtrip
  for (const e of [1.3, 1.8, 2.2, 2.5, 2.9, 3.0]) {
    approx(easeFromDifficulty(difficultyFromEase(e)), e, 1e-9);
  }
  // parite: ease<2.5 ⟺ difficulty>D0(3)
  const dMid = initDifficulty(3);
  for (let i = 0; i < 34; i++) {
    const e = 1.3 + i * 0.05;
    if (Math.abs(e - 2.5) < 1e-9) continue; // tam sınır: float birikimi iki yana düşebilir
    assert.equal(e < 2.5, difficultyFromEase(e) > dMid + 1e-12, `parite bozuk e=${e}`);
  }
});

test("newCard tohumları", () => {
  const zor = newCard("a", "a", "a", "konusma", undefined, "zor", NOW);
  const orta = newCard("b", "b", "b", "konusma", undefined, "orta", NOW);
  const kolay = newCard("c", "c", "c", "okuma", undefined, "kolay", NOW);
  approx(zor.difficulty!, 6.4883);
  approx(zor.ease, 2.1933, 0.001);
  approx(orta.difficulty!, 5.2824);
  approx(orta.ease, 2.5);
  approx(kolay.difficulty!, 3.2245);
  approx(kolay.ease, 3.0);
  assert.equal(orta.stability, undefined);
  assert.equal(orta.intervalDays, 0);
  assert.equal(orta.reps, 0);
});

test("ilk tekrar: tohum ofseti D'ye işler, S'ye işlemez", () => {
  const orta = gradeCard(newCard("a", "a", "a", "konusma", undefined, "orta", NOW), 2, NOW);
  approx(orta.stability!, 3.173);
  approx(orta.difficulty!, 5.2824);
  assert.equal(orta.intervalDays, 3);
  assert.equal(orta.reps, 1);
  const zorGood = gradeCard(newCard("a", "a", "a", "konusma", undefined, "zor", NOW), 2, NOW);
  approx(zorGood.stability!, 3.173); // tohum stability'yi ETKİLEMEZ
  approx(zorGood.difficulty!, 6.488305, 0.001);
  const zorAgain = gradeCard(newCard("a", "a", "a", "konusma", undefined, "zor", NOW), 0, NOW);
  approx(zorAgain.difficulty!, 8.400771, 0.001);
  const kolayEasy = gradeCard(newCard("a", "a", "a", "konusma", undefined, "kolay", NOW), 3, NOW);
  approx(kolayEasy.difficulty!, 1.166569, 0.001);
});

test("bilemedi → 10 dk → kısa-dönem Good", () => {
  const first = gradeCard(newCard("a", "a", "a", "konusma", undefined, "orta", NOW), 0, NOW);
  assert.equal(first.intervalDays, 0);
  const dueMin = (Date.parse(first.due) - NOW.getTime()) / 60000;
  assert.ok(dueMin >= 9.5 && dueMin <= 10.5);
  assert.equal(first.lapses, 1);
  assert.equal(first.reps, 0); // reps değişmez
  approx(first.stability!, 0.40255);
  const later = new Date(NOW.getTime() + 10 * 60000);
  const second = gradeCard(first, 2, later);
  approx(second.stability!, 0.40255 * 1.407771, 1e-3); // kısa-dönem yolu
  assert.ok(second.intervalDays >= 1);
});

test("aynı-gün enflasyon koruması (review kartı ×1.41 şişmez)", () => {
  const card = legacyCard({
    stability: 100,
    difficulty: 5,
    intervalDays: 30,
    reps: 5,
    lastReviewedAt: new Date(NOW.getTime() - 10 * 60000).toISOString(),
  });
  const g = gradeCard(card, 2, NOW);
  assert.ok(g.stability! > 100 && g.stability! < 100.05, `S=${g.stability}`);
});

test("göç uçtan uca: çalışılmış SM-2 kartı", () => {
  const c = legacyCard({
    intervalDays: 20,
    ease: 2.3,
    reps: 5,
    lapses: 1,
    lastReviewedAt: daysAgo(20),
  });
  const mem = cardMemory(c);
  approx(mem.stability!, 20);
  approx(mem.difficulty, 6.068695, 0.001);
  assert.equal(c.stability, undefined); // tembel göç kartı DEĞİŞTİRMEZ
  const g = gradeCard(c, 2, NOW);
  approx(g.stability!, 54.7393, 0.05);
  assert.equal(g.intervalDays, 55);
  approx(g.difficulty!, 6.055612, 0.001);
});

test("göç: bilemedi beklemesindeki ve hiç çalışılmamış eski kartlar", () => {
  const relearn = legacyCard({ intervalDays: 0, reps: 0, lapses: 2, lastReviewedAt: daysAgo(0) });
  const memR = cardMemory(relearn);
  approx(memR.stability!, 0.40255);
  const g = gradeCard(relearn, 2, new Date(NOW.getTime() + 10 * 60000));
  assert.equal(g.intervalDays, 1); // kısa-dönem → 1 gün
  const fresh = legacyCard({ ease: 2.1 });
  const memF = cardMemory(fresh);
  assert.equal(memF.stability, undefined);
  approx(memF.difficulty, 6.488305, 0.001); // kanonik "zor" tohumu
});

test("göç: lastReviewedAt yoksa due−intervalDays çıkarımı", () => {
  const c = legacyCard({ intervalDays: 10, ease: 2.5, reps: 3, due: NOW.toISOString() });
  const g = gradeCard(c, 2, NOW); // elapsed=10 gün → R≈0.9 civarı, S büyür
  assert.ok(g.stability! > 10);
});

test("dueCards: bozuk due kartı gizlemez, başa alır", () => {
  const broken = legacyCard({ id: "b", due: "garbage" });
  const future = legacyCard({ id: "f", due: new Date(NOW.getTime() + 86_400_000).toISOString() });
  const nowDue = legacyCard({ id: "n", due: NOW.toISOString() });
  const due = dueCards([future, nowDue, broken], NOW);
  assert.deepEqual(
    due.map((c) => c.id),
    ["b", "n"]
  );
  assert.doesNotThrow(() => gradeCard(broken, 2, NOW));
});

test("monotonluk: 8 ardışık tam-vadeli Good", () => {
  let card = gradeCard(newCard("a", "a", "a", "konusma", undefined, "orta", NOW), 2, NOW);
  let prevS = card.stability!;
  let prevI = card.intervalDays;
  let t = NOW.getTime();
  for (let i = 0; i < 7; i++) {
    t += card.intervalDays * 86_400_000;
    card = gradeCard(card, 2, new Date(t));
    assert.ok(card.stability! > prevS, "S artmalı");
    assert.ok(card.intervalDays >= prevI, "aralık azalmamalı");
    assert.ok(card.intervalDays <= 365);
    prevS = card.stability!;
    prevI = card.intervalDays;
  }
});

test("deckStats ve strugglingCards", () => {
  const clean = gradeCard(newCard("a", "a", "a", "konusma", undefined, "orta", NOW), 2, NOW);
  const hardSeed = newCard("b", "b", "b", "konusma", undefined, "zor", NOW);
  const lapsed = legacyCard({ id: "l", lapses: 2, ease: 2.4, reps: 1, intervalDays: 2 });
  const mastered = legacyCard({
    id: "m",
    reps: 4,
    intervalDays: 20,
    stability: 20,
    difficulty: 4,
    due: daysAgo(-5),
  });
  const relearnNotMastered = legacyCard({
    id: "r",
    reps: 4,
    intervalDays: 0,
    stability: 20,
    difficulty: 4,
  });
  const cards = [clean, hardSeed, lapsed, mastered, relearnNotMastered];
  const s = deckStats(cards, NOW);
  assert.equal(s.total, 5);
  assert.equal(s.neverReviewed, 1); // yalnız hardSeed (lapsed'ın lapses>0)
  assert.equal(s.mastered, 1); // yalnız mastered (relearn intervalDays=0 → değil)
  const strugg = strugglingCards(cards, 10);
  assert.ok(strugg.some((c) => c.id === "l"));
  assert.ok(strugg.some((c) => c.id === hardSeed.id));
  assert.ok(!strugg.some((c) => c.id === clean.id));
  assert.equal(strugg[0].id, "l"); // lapse'lı önde
  assert.equal(strugglingCards(cards, 1).length, 1);
});

test("determinizm", () => {
  const c = legacyCard({ intervalDays: 7, ease: 2.4, reps: 2, lastReviewedAt: daysAgo(7) });
  assert.deepEqual(gradeCard(c, 1, NOW), gradeCard(c, 1, NOW));
});
