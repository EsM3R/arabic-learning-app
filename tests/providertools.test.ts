/**
 * Boş araç listesi kararı.
 *
 * Küçük bir fonksiyon ama gerçek bir hatayı kapatıyor: Ayarlar'daki bağlantı
 * sınaması araçsız çağırıyor ve sağlayıcıların bir kısmı boş listeyi geçersiz
 * sayıyor. Yani sınama, tam da yardım etmesi gereken sağlayıcıda "çalışmıyor"
 * diyordu. Karar burada, test altında.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { toolsOrUndefined } from "../src/providers/types.ts";

test("boş liste gönderilmez", () => {
  assert.equal(toolsOrUndefined([]), undefined);
});

test("dolu liste aynen geçer", () => {
  const tools = [{ name: "a" }, { name: "b" }];
  assert.equal(toolsOrUndefined(tools), tools, "liste kopyalanmamalı, aynen geçmeli");
});

test("tek araçlı liste de gönderilir", () => {
  assert.deepEqual(toolsOrUndefined([{ name: "x" }]), [{ name: "x" }]);
});
