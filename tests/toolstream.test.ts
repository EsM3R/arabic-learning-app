/** Akıştaki araç çağrısı parçalarının birleştirilmesi. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { completedToolCalls, mergeToolCallDelta } from "../src/toolstream.ts";
import type { ToolCallDraft } from "../src/toolstream.ts";

test("parçalar sırayla birleşir: id+name ilk parçada, arguments dağınık", () => {
  const drafts: ToolCallDraft[] = [];
  mergeToolCallDelta(drafts, { index: 0, id: "c1", function: { name: "kelime_kaydet" } });
  mergeToolCallDelta(drafts, { index: 0, function: { arguments: '{"ara' } });
  mergeToolCallDelta(drafts, { index: 0, function: { arguments: 'bic":"سوق"}' } });
  assert.equal(drafts.length, 1);
  assert.deepEqual(drafts[0], { id: "c1", name: "kelime_kaydet", arguments: '{"arabic":"سوق"}' });
});

test("paralel çağrılar index'e göre ayrışır, boşluk doldurulur", () => {
  const drafts: ToolCallDraft[] = [];
  mergeToolCallDelta(drafts, { index: 1, id: "c2", function: { name: "not_yaz", arguments: "{}" } });
  mergeToolCallDelta(drafts, { index: 0, id: "c1", function: { name: "hata_kaydet" } });
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].name, "hata_kaydet");
  assert.equal(drafts[1].name, "not_yaz");
});

test("completedToolCalls: adı/id'si oluşmamış taslak elenir", () => {
  const drafts: ToolCallDraft[] = [];
  mergeToolCallDelta(drafts, { index: 0, id: "c1", function: { name: "tekrar_durumu", arguments: "{}" } });
  mergeToolCallDelta(drafts, { index: 1, function: { arguments: '{"x":1}' } }); // id/name yok
  const done = completedToolCalls(drafts);
  assert.equal(done.length, 1);
  assert.equal(done[0].id, "c1");
});

test("geçersiz index sessizce yok sayılır", () => {
  const drafts: ToolCallDraft[] = [];
  mergeToolCallDelta(drafts, { index: -1, id: "x" });
  assert.equal(drafts.length, 0);
});
