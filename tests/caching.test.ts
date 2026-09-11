/**
 * Önbellek yerleşimi testleri.
 *
 * Anthropic önbelleği ÖN-EK eşleşmesiyle çalışır: işaretten önceki içerik bayt
 * bayt aynıysa %10 fiyata okunur, tek bayt değişirse sonrasının tamamı düşer.
 * Yani işaretin yeri doğrudan FATURAYI belirliyor ve yanlış konduğunda hiçbir
 * hata mesajı çıkmaz — maliyet sessizce katlanır. Bu yüzden test ediliyor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMessages, cachedPrefix, cachedTools, systemBlocks } from "../src/caching.ts";
import type { ChatMessage } from "../src/types.ts";

const msg = (role: "user" | "assistant", content: string): ChatMessage =>
  ({ role, content }) as ChatMessage;

/** Bir mesajın içeriğindeki cache_control işaretlerini sayar. */
function marks(m: unknown): number {
  const content = (m as { content: unknown }).content;
  if (!Array.isArray(content)) return 0;
  return content.filter((b) => (b as { cache_control?: unknown }).cache_control).length;
}

test("tek mesajlık ilk turda işaret konmaz — önbelleklenecek geçmiş yok", () => {
  const out = buildMessages([msg("user", "merhaba")]);
  assert.equal(out.length, 1);
  assert.equal(marks(out[0]), 0);
});

test("boş geçmiş çökertmez", () => {
  assert.deepEqual(buildMessages([]), []);
});

test("işaret SON mesaja değil, ondan ÖNCEKİNE konur", () => {
  // Son mesaj her turda değişir; ona işaret konsaydı önbellek hiç tutmazdı.
  const out = buildMessages([msg("user", "bir"), msg("assistant", "iki"), msg("user", "üç")]);
  assert.equal(out.length, 3);
  assert.equal(marks(out[1]), 1, "sondan bir önceki mesaj işaretlenmeli");
  assert.equal(marks(out[2]), 0, "son mesaj işaretlenmemeli");
});

test("değişken hafıza işaretin ARKASINA, son mesaja eklenir", () => {
  // Hata defteri ve tekrar durumu her turda değişir; işaretin önüne konsaydı
  // ön-ek her turda bozulur ve önbellek hiç kullanılmazdı.
  const out = buildMessages(
    [msg("user", "bir"), msg("assistant", "iki"), msg("user", "üç")],
    "\n\nHAFIZA: ..."
  );
  const last = JSON.stringify(out[out.length - 1]);
  assert.ok(last.includes("HAFIZA"), "değişken hafıza son mesajda olmalı");
  const before = JSON.stringify(out.slice(0, -1));
  assert.ok(!before.includes("HAFIZA"), "değişken hafıza işaretin önüne sızmış");
});

test("dinamik hafıza verilmezse son mesaj olduğu gibi kalır", () => {
  const out = buildMessages([msg("user", "bir"), msg("user", "iki")]);
  assert.equal(JSON.stringify(out[1]).includes("undefined"), false);
});

test("geçmiş büyüdükçe işaret ilerler ama hep sondan bir öncede kalır", () => {
  for (const n of [2, 3, 6, 11]) {
    const history = Array.from({ length: n }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `m${i}`)
    );
    const out = buildMessages(history);
    const marked = out.map(marks);
    assert.equal(
      marked.reduce((a, b) => a + b, 0),
      1,
      `n=${n}: tam olarak bir işaret olmalı`
    );
    assert.equal(marked[n - 2], 1, `n=${n}: işaret yanlış yerde`);
  }
});

test("sistem bloğu işaretlenir — sabit prompt her turda yeniden okunuyor", () => {
  const blocks = systemBlocks("uzun sabit sistem promptu");
  assert.ok(blocks.length >= 1);
  assert.ok(
    blocks.some((b) => (b as { cache_control?: unknown }).cache_control),
    "sistem promptu önbelleklenmiyor"
  );
});

test("araçlar işaretlenir ve sayıları korunur", () => {
  const tools = [
    { name: "a", description: "d", input_schema: { type: "object" as const } },
    { name: "b", description: "d", input_schema: { type: "object" as const } },
  ];
  const out = cachedTools(tools);
  assert.equal(out.length, 2);
  assert.ok(
    out.some((t) => (t as { cache_control?: unknown }).cache_control),
    "araç listesi önbelleklenmiyor"
  );
});

test("boş araç listesi çökertmez", () => {
  assert.deepEqual(cachedTools([]), []);
});

test("cachedPrefix ön-eki geri okuyabiliyor (hata ayıklama kancası)", () => {
  const out = buildMessages([msg("user", "bir"), msg("assistant", "iki"), msg("user", "üç")]);
  const prefix = cachedPrefix(out);
  assert.equal(typeof prefix, "string");
});
