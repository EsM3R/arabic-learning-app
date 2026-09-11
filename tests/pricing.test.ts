/**
 * Fiyatlandırma testleri. Uygulamanın PARA hesabı yapan tek yeri burası ve
 * yanlış bir kural sessizce yanlış fatura tahmini üretir — kullanıcı bunu
 * ancak ay sonunda fark eder.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { costOf, formatTry, priceFor, USD_TRY } from "../src/pricing.ts";

test("her sağlayıcının modeli kendi kuralına düşer", () => {
  assert.equal(priceFor("claude-opus-5").input, 5);
  assert.equal(priceFor("claude-sonnet-5").input, 2);
  assert.equal(priceFor("gpt-5.6-luna").output, 1.2);
  assert.equal(priceFor("gemini-3-flash").input, 0.75);
  assert.equal(priceFor("deepseek-flash").output, 0.6);
});

test("model adı büyük harfle gelse de eşleşir", () => {
  assert.deepEqual(priceFor("DeepSeek-Flash"), priceFor("deepseek-flash"));
});

test("emekli DeepSeek adları da V4.1 fiyatına düşer", () => {
  // Eski adlara giden istekler V4.1-Flash'a yönleniyor ve ONUN fiyatından
  // faturalanıyor; ayrı satır tutmak yanlış tahmin üretirdi.
  for (const name of ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat"]) {
    assert.deepEqual(priceFor(name), priceFor("deepseek-flash"), name);
  }
});

test("bilinmeyen model sıfır sayılmaz — orta bir tahmine düşer", () => {
  // Sessizce 0 saymak, maliyeti olmayan bir model varmış gibi göstermek olurdu.
  const p = priceFor("yepyeni-model-2030");
  assert.ok(p.input > 0 && p.output > 0);
});

test("önbellekten okuma girdiden çok daha ucuz (DeepSeek)", () => {
  // Uygulamanın maliyetini belirleyen asıl kalem bu: uzun sistem promptu
  // her turda yeniden okunuyor.
  const p = priceFor("deepseek-flash");
  assert.ok(p.cacheRead < p.input / 10, "önbellek indirimi kaybolmuş");
});

test("maliyet milyon token üzerinden hesaplanır", () => {
  const c = costOf({ model: "deepseek-flash", input: 1_000_000, output: 0 });
  assert.equal(Number(c.toFixed(6)), 0.15);
  const both = costOf({ model: "deepseek-flash", input: 1_000_000, output: 1_000_000 });
  assert.equal(Number(both.toFixed(6)), 0.75);
});

test("önbellek alanları verilmezse sıfır sayılır, çökertmez", () => {
  const c = costOf({ model: "claude-sonnet-5", input: 100, output: 100 });
  assert.ok(c > 0 && Number.isFinite(c));
});

test("önbellekten okunan tokenlar ucuz kalemden hesaplanır", () => {
  const pahali = costOf({ model: "deepseek-flash", input: 1_000_000, output: 0 });
  const ucuz = costOf({ model: "deepseek-flash", input: 0, output: 0, cacheRead: 1_000_000 });
  assert.ok(ucuz < pahali / 10, `önbellek okuması ucuz değil: ${ucuz} vs ${pahali}`);
});

test("TL biçimi kuru uygular", () => {
  assert.match(formatTry(1), /TL/);
  assert.match(formatTry(1), new RegExp(`^${USD_TRY}`));
});

test("küçük tutar sıfıra yuvarlanıp yok edilmez", () => {
  // Bir ders ~0.02 USD ≈ 1 TL. "0 TL" yazmak maliyeti yok göstermek olurdu;
  // biçimlendirici küçüldükçe basamak açar.
  const kurus = formatTry(0.002); // ≈ 0.10 TL
  assert.doesNotMatch(kurus, /^0 TL$/);
  assert.match(kurus, /0\.\d\d TL/);
});

test("büyük tutar kuruşla değil yuvarlak gösterilir", () => {
  assert.match(formatTry(10), /^480 TL$/);
});
