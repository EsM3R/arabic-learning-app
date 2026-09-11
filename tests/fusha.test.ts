/** Ammice → fusha geçiş mantığı testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { migrationScope, migrationSummary, withoutColloquial } from "../src/fusha.ts";
import type { Curriculum, VocabCard } from "../src/types.ts";

let seq = 0;
function card(track: "konusma" | "okuma"): VocabCard {
  seq += 1;
  return {
    id: `v${seq}`,
    arabic: "كلمة",
    transliteration: "kelime",
    turkish: "kelime",
    track,
    addedAt: "2026-09-01T10:00:00.000Z",
    due: "2026-09-02T10:00:00.000Z",
    intervalDays: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
  };
}

function curriculum(n: number): Curriculum {
  return {
    modules: Array.from({ length: n }, (_, i) => ({
      id: `k${i}`,
      track: "konusma" as const,
      title: "m",
      description: "d",
      level: "A1",
      objectives: [],
    })),
    generatedAt: "2026-09-01T10:00:00.000Z",
  };
}

test("kapsam: ammice kartlar ve müfredat sayılır", () => {
  const vocab = [card("konusma"), card("konusma"), card("okuma")];
  const s = migrationScope(vocab, curriculum(12), false, "ar");
  assert.equal(s.cardsToRemove, 2);
  assert.equal(s.cardsKept, 1);
  assert.equal(s.modulesToClear, 12);
  assert.equal(s.needed, true);
});

test("kapsam: silinecek kart yoksa ama müfredat varsa yine gerekli", () => {
  const s = migrationScope([card("okuma")], curriculum(8), false, "ar");
  assert.equal(s.cardsToRemove, 0);
  assert.equal(s.modulesToClear, 8);
  assert.equal(s.needed, true);
});

test("kapsam: hiçbiri yoksa gerekli değil", () => {
  const s = migrationScope([card("okuma")], undefined, false, "ar");
  assert.equal(s.needed, false);
});

test("GEÇİŞ YAPILDIYSA kapsam her zaman boş — yeni fusha kartları silinmez", () => {
  // Geçişten sonra "konusma" parkuru SÖZLÜ FUSHA demektir; bu kartlar
  // yeni ve korunmalıdır. Bayrak bunu garanti eder.
  const vocab = [card("konusma"), card("konusma"), card("okuma")];
  const s = migrationScope(vocab, curriculum(16), true, "ar");
  assert.equal(s.cardsToRemove, 0);
  assert.equal(s.cardsKept, 3);
  assert.equal(s.modulesToClear, 0);
  assert.equal(s.needed, false);
});

test("BAŞKA DİLDE kapsam her zaman boş — Fransızca kartlar ammice değildir", () => {
  // Dil kilidi olmasaydı Fransızca panelinde "ammice kartların silinecek"
  // diye sorulur, öğrencinin konuşma kartları yok edilirdi.
  const vocab = [card("konusma"), card("konusma"), card("okuma")];
  for (const lang of ["fr", "de", "it", "ru", "fa", "en", "es"]) {
    const s = migrationScope(vocab, curriculum(10), false, lang);
    assert.equal(s.needed, false, `${lang}: geçiş sorulmamalı`);
    assert.equal(s.cardsToRemove, 0);
    assert.equal(s.cardsKept, 3);
  }
});

test("withoutColloquial: yalnız konuşma parkuru düşer, sıra bozulmaz", () => {
  const a = card("okuma");
  const b = card("konusma");
  const c = card("okuma");
  assert.deepEqual(
    withoutColloquial([a, b, c]).map((x) => x.id),
    [a.id, c.id]
  );
  assert.deepEqual(withoutColloquial([]), []);
});

test("özet: sayıları söyler ve geri alınamazlığı uyarır", () => {
  const s = migrationScope([card("konusma"), card("okuma")], curriculum(4), false, "ar");
  const text = migrationSummary(s);
  assert.match(text, /1 ammice kart silinecek/);
  assert.match(text, /1 kart kalacak/);
  assert.match(text, /4 modüllük müfredat/);
  assert.match(text, /geri alınamaz/);
});

test("özet: silinecek kart yokken kart cümlesi hiç geçmez", () => {
  const s = migrationScope([card("okuma")], curriculum(4), false, "ar");
  const text = migrationSummary(s);
  assert.doesNotMatch(text, /kart silinecek/);
  assert.match(text, /müfredat/);
});
