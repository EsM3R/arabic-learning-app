/** Şema sürümü, göç zinciri ve geri-sürüm koruması testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FUTURE_SCHEMA_WARNING,
  MIGRATIONS,
  planMigrations,
  runMigrations,
  SCHEMA_VERSION,
  schemaStatus,
} from "../src/schema.ts";
import type { Migration } from "../src/schema.ts";

test("durum: damga yoksa 'bos', aynıysa 'guncel', eskiyse göç, yeniyse tehlike", () => {
  assert.equal(schemaStatus(null), "bos");
  assert.equal(schemaStatus(SCHEMA_VERSION), "guncel");
  assert.equal(schemaStatus(SCHEMA_VERSION - 1), "goc-gerekli");
  assert.equal(schemaStatus(SCHEMA_VERSION + 1), "gelecekten");
});

test("göç listesi 'to' sırasına göre ve sürümü aşmayacak biçimde planlanır", () => {
  const plan = planMigrations(0);
  const versions = plan.map((m) => m.to);
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
  for (const v of versions) assert.ok(v <= SCHEMA_VERSION);
});

test("güncel sürümden göç planlanmaz", () => {
  assert.deepEqual(planMigrations(SCHEMA_VERSION), []);
});

test("her kayıtlı göçün hedefi SCHEMA_VERSION'ı aşmaz", () => {
  // Bu, "göç ekledim ama sürümü artırmayı unuttum" hatasını yakalar:
  // o göç hiç çalışmaz ve kimse fark etmez.
  for (const m of MIGRATIONS) {
    assert.ok(m.to <= SCHEMA_VERSION, `göç ${m.to} > şema ${SCHEMA_VERSION}`);
    assert.ok(m.note.trim().length > 0, "göç notu boş");
  }
});

// --- Zincir davranışı, sahte göçlerle -------------------------------------

function fake(to: number, key: string, boom = false): Migration {
  return {
    to,
    note: `sahte ${to}`,
    apply: (e) => {
      if (boom) throw new Error("patladı");
      return { ...e, [key]: "1" };
    },
  };
}

/** planMigrations gerçek listeyi kullandığı için zinciri elle yürütüyoruz. */
function chain(entries: Record<string, string>, from: number, list: Migration[]) {
  let current = entries;
  let version = from;
  const applied: string[] = [];
  for (const m of list.filter((x) => x.to > from).sort((a, b) => a.to - b.to)) {
    try {
      current = m.apply(current);
      version = m.to;
      applied.push(m.note);
    } catch {
      break;
    }
  }
  return { entries: current, version, applied };
}

test("zincir sırayla uygulanır ve sürüm ilerler", () => {
  const r = chain({ a: "0" }, 1, [fake(2, "b"), fake(3, "c")]);
  assert.equal(r.version, 3);
  assert.deepEqual(Object.keys(r.entries).sort(), ["a", "b", "c"]);
});

test("patlayan göç zinciri DURDURUR ve sürüm ilerlemez", () => {
  // Yarım göçü "tamam" diye damgalamak veriyi sessizce bozmanın en kolay yolu.
  const r = chain({ a: "0" }, 1, [fake(2, "b"), fake(3, "c", true), fake(4, "d")]);
  assert.equal(r.version, 2, "patlayan göçten sonra sürüm ilerlememeli");
  assert.equal(r.entries.d, undefined, "sonraki göç çalışmamalı");
  assert.equal(r.applied.length, 1);
});

test("gerçek runMigrations bugün veriyi olduğu gibi bırakır", () => {
  const before = { "vocab.v1": "[]", "profile.v1": "{}" };
  const r = runMigrations(before, SCHEMA_VERSION);
  assert.deepEqual(r.entries, before);
  assert.equal(r.version, SCHEMA_VERSION);
  assert.deepEqual(r.applied, []);
});

test("geri sürüm uyarısı ne olduğunu ve ne yapılacağını söyler", () => {
  assert.match(FUTURE_SCHEMA_WARNING, /DAHA YENİ/);
  assert.match(FUTURE_SCHEMA_WARNING, /kaydedilmeyecek/);
  assert.match(FUTURE_SCHEMA_WARNING, /güncel/i);
});

test("göç 2 (cümle kurma v3): v1'den zincir yeni anahtarları yazar, eskileri silmez", () => {
  const before = {
    "buildSets.v1.en": JSON.stringify([
      {
        patternId: "istek",
        themeId: "rutin",
        intro: "x",
        createdAt: "2026-09-01T00:00:00.000Z",
        sentences: [
          {
            tr: "Eve gitmek istiyorum.",
            steps: [
              { question: "", trPiece: "istiyorum", trSoFar: "İstiyorum", target: "I want", alts: [], translit: "", note: "" },
              { question: "Neyi?", trPiece: "Eve gitmek", trSoFar: "Eve gitmek istiyorum.", target: "I want to go home.", alts: [], translit: "", note: "" },
            ],
            blocks: [],
            reorder: "",
          },
        ],
      },
    ]),
    "vocab.v1": "[]",
  };
  const r = runMigrations(before, 1);
  assert.equal(r.version, SCHEMA_VERSION);
  assert.deepEqual(r.applied, ["cümle kurma v3"]);
  assert.equal(r.entries["buildSets.v1.en"], before["buildSets.v1.en"]);
  assert.equal(r.entries["vocab.v1"], "[]");
  assert.equal(JSON.parse(r.entries["buildSets2.v1.en"])[0].v, 2);
  assert.equal(JSON.parse(r.entries["buildMemory.v1.en"]).length, 1);
});
