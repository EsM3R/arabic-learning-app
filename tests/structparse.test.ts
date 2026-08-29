/** Yapılandırılmış cevap ayrıştırma/toparlama testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeCurriculumModules,
  parseStructuredJson,
  stripJsonFences,
} from "../src/structparse.ts";

test("stripJsonFences: ```json çitini soyar, çitsiz metni aynen bırakır", () => {
  assert.equal(stripJsonFences('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripJsonFences('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripJsonFences('{"a":1}'), '{"a":1}');
});

test("parseStructuredJson: geçerli ve çitli JSON'u ayrıştırır", () => {
  assert.deepEqual(parseStructuredJson<{ a: number }>('{"a":1}'), { a: 1 });
  assert.deepEqual(parseStructuredJson<{ a: number }>('```json\n{"a":2}\n```'), { a: 2 });
});

test("parseStructuredJson: bozuk JSON'da Türkçe, yol gösteren hata", () => {
  assert.throws(
    () => parseStructuredJson('{"modules": [{"id": "k1", "title"'),
    /geçerli JSON döndürmedi.*Tekrar denemek/
  );
});

test("normalizeCurriculumModules: geçerli modüller aynen geçer", () => {
  const out = normalizeCurriculumModules({
    modules: [
      {
        id: "k1",
        track: "konusma",
        title: "Selamlaşma",
        description: "d",
        level: "A0",
        objectives: ["a", "b"],
      },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "k1");
  assert.deepEqual(out[0].objectives, ["a", "b"]);
});

test("normalizeCurriculumModules: Türkçe/İngilizce parkur adları düzeltilir", () => {
  const out = normalizeCurriculumModules({
    modules: [
      { id: "k1", track: "Konuşma", title: "A" },
      { id: "o1", track: "reading", title: "B" },
    ],
  });
  assert.equal(out[0].track, "konusma");
  assert.equal(out[1].track, "okuma");
});

test("normalizeCurriculumModules: parkursuz/başlıksız modül elenir, eksik alanlar dolar", () => {
  const out = normalizeCurriculumModules({
    modules: [
      { track: "banane", title: "Elenecek" },
      { title: "Parkuru yok" },
      { track: "okuma", title: "  " },
      { track: "okuma", title: "Kalan", objectives: ["x", 42, null] },
      "düz metin",
      null,
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Kalan");
  assert.equal(out[0].id, "o1"); // id gelmedi → parkura göre üretildi
  assert.equal(out[0].level, "A0");
  assert.equal(out[0].description, "");
  assert.deepEqual(out[0].objectives, ["x"]); // string olmayan hedefler elendi
});

test("normalizeCurriculumModules: çakışan id'ler tekilleştirilir", () => {
  const out = normalizeCurriculumModules({
    modules: [
      { id: "k1", track: "konusma", title: "A" },
      { id: "k1", track: "konusma", title: "B" },
      { id: "k1", track: "konusma", title: "C" },
    ],
  });
  assert.deepEqual(
    out.map((m) => m.id),
    ["k1", "k1-2", "k1-3"]
  );
});

test("normalizeCurriculumModules: modules dizisi yoksa/bozuksa boş liste", () => {
  assert.deepEqual(normalizeCurriculumModules(null), []);
  assert.deepEqual(normalizeCurriculumModules({}), []);
  assert.deepEqual(normalizeCurriculumModules({ modules: "yok" }), []);
});
