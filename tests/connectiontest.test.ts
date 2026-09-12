/**
 * Bağlantı testi hata yorumu.
 *
 * Ham API hatası ("401", "fetch failed") öğrenciye hiçbir şey anlatmaz.
 * Buradaki sınıflandırma yanlışsa öğrenci yanlış yeri kurcalar: bakiyesi
 * bittiği hâlde anahtarını değiştirmeye çalışır.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyError,
  successResult,
  TEST_TIMEOUT_MS,
  validateBeforeCall,
} from "../src/connectiontest.ts";

test("yetki hataları anahtar sorununa çevrilir", () => {
  for (const raw of [
    "Error 401: Unauthorized",
    "invalid api key provided",
    "API key not valid. Please pass a valid API key.",
    "PERMISSION_DENIED",
    "authentication_error",
  ]) {
    const r = classifyError(raw);
    assert.equal(r.outcome, "anahtar", raw);
    assert.equal(r.ok, false);
    assert.match(r.detail, /[Aa]nahtar/);
  }
});

test("kota ve bakiye hataları anahtar sorunuyla KARIŞTIRILMAZ", () => {
  // En sık yanlış teşhis bu: bakiyesi bitmiş öğrenci anahtarını değiştirmeye
  // uğraşıp saatini harcar.
  for (const raw of [
    "429 Too Many Requests",
    "You exceeded your current quota",
    "insufficient_quota",
    "rate limit reached",
    "Your credit balance is too low",
  ]) {
    const r = classifyError(raw);
    assert.equal(r.outcome, "kota", raw);
    assert.match(r.detail, /bakiye|kota/i);
  }
});

test("emekli model adı ayrı bir sonuç olarak çıkar", () => {
  // Bu uygulamada gerçekten yaşandı: DeepSeek V4-Pro emekliye ayrıldı.
  for (const raw of ["404 model not found", "The model `x` does not exist", "unknown model"]) {
    const r = classifyError(raw);
    assert.equal(r.outcome, "model", raw);
    assert.match(r.detail, /model/i);
  }
});

test("ağ hataları sağlayıcı hatası sanılmaz", () => {
  for (const raw of [
    "Network request failed",
    "fetch failed",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "getaddrinfo ENOTFOUND api.example.com",
  ]) {
    const r = classifyError(raw);
    assert.equal(r.outcome, "ag", raw);
  }
});

test("tanınmayan hata YUTULMAZ, ham metin gösterilir", () => {
  const r = classifyError("Beklenmedik bir şey oldu: XYZ-9");
  assert.equal(r.outcome, "bilinmiyor");
  assert.match(r.detail, /XYZ-9/);
});

test("boş hata metni çökertmez", () => {
  const r = classifyError("");
  assert.equal(r.ok, false);
  assert.ok(r.detail.length > 0);
});

test("çok uzun hata metni kırpılır", () => {
  const r = classifyError("z".repeat(5000));
  assert.ok(r.detail.length < 400, `detay çok uzun: ${r.detail.length}`);
});

test("başarı sonucu modeli ve cevabı gösterir", () => {
  const r = successResult("tamam", "deepseek-flash");
  assert.equal(r.ok, true);
  assert.equal(r.outcome, "calisiyor");
  assert.match(r.detail, /deepseek-flash/);
  assert.match(r.detail, /tamam/);
});

test("boş cevap BAŞARISIZ sayılmaz — bağlantı yine de kuruldu", () => {
  const r = successResult("   ", "gemini-3-flash");
  assert.equal(r.ok, true);
  assert.match(r.detail, /boş cevap/);
});

test("anahtar yoksa çağrı hiç yapılmaz", () => {
  const r = validateBeforeCall("", "sk-");
  assert.ok(r);
  assert.equal(r?.ok, false);
  assert.match(r?.title ?? "", /girilmemiş/);
});

test("yanlış sağlayıcının anahtarı önden yakalanır", () => {
  const r = validateBeforeCall("AIzaSyXXXX", "sk-");
  assert.ok(r);
  assert.match(r?.detail ?? "", /"sk-"/);
});

test("geçerli görünen anahtar önden engellenmez", () => {
  assert.equal(validateBeforeCall("sk-abc123", "sk-"), null);
  assert.equal(validateBeforeCall("herhangi-bir-anahtar"), null);
});

test("baştaki/sondaki boşluk anahtarı geçersiz yapmaz", () => {
  assert.equal(validateBeforeCall("  sk-abc  ", "sk-"), null);
});

test("sınama süresi makul bir üst sınırda", () => {
  // Uzun beklemek testin amacını bozar: öğrenci zaten "çalışıyor mu" diye bakıyor.
  assert.ok(TEST_TIMEOUT_MS >= 5000 && TEST_TIMEOUT_MS <= 30_000);
});
