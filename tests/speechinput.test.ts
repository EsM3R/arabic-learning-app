/** Sesli giriş: hedef karşılaştırma ve işaretleme testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  editDistance,
  isSpoken,
  judgeSpeech,
  markSpoken,
  NEAR_THRESHOLD,
  RECOGNITION_NOTE,
  similarity,
  speechLocale,
  SPOKEN_PREFIX,
  stripSpokenMark,
} from "../src/speechinput.ts";

test("speechLocale: bilinen diller eşlenir, bilinmeyen güvenli varsayılana düşer", () => {
  assert.equal(speechLocale("ar"), "ar-SA");
  assert.equal(speechLocale("en"), "en-US");
  assert.equal(speechLocale("es"), "es-ES");
  assert.equal(speechLocale("zz"), "en-US");
});

test("sesli işareti: koy, tanı, sök", () => {
  const m = markSpoken("  مرحبا  ");
  assert.equal(m, `${SPOKEN_PREFIX} مرحبا`);
  assert.equal(isSpoken(m), true);
  assert.equal(stripSpokenMark(m), "مرحبا");
  // işaretsiz metin bozulmaz
  assert.equal(isSpoken("merhaba"), false);
  assert.equal(stripSpokenMark("merhaba"), "merhaba");
});

test("editDistance ve similarity temel davranış", () => {
  assert.equal(editDistance("abc", "abc"), 0);
  assert.equal(editDistance("", "abc"), 3);
  assert.equal(editDistance("kitab", "kitap"), 1);
  assert.equal(similarity("abc", "abc"), 1);
  assert.equal(similarity("", ""), 1);
  assert.ok(similarity("kitab", "kitap") > 0.75);
  assert.ok(similarity("kitap", "masa") < 0.5);
});

test("judgeSpeech: hedef yazımla birebir söylendi → doğru", () => {
  const r = judgeSpeech("سوق", "suk", "سوق", "arabic");
  assert.equal(r.verdict, "dogru");
  assert.equal(r.match, "target");
  assert.equal(r.similarity, 1);
});

test("judgeSpeech: okunuşla söylendi → doğru (okunuş etiketiyle)", () => {
  const r = judgeSpeech("سوق", "suk", "suk", "arabic");
  assert.equal(r.verdict, "dogru");
  assert.equal(r.match, "translit");
  assert.match(r.message, /okunuş/);
});

test("judgeSpeech: yakın söyleyiş 'yakin', duyulanı gösterir", () => {
  const r = judgeSpeech("كتاب", "kitab", "كتام", "arabic");
  assert.equal(r.verdict, "yakin");
  assert.ok(r.similarity >= NEAR_THRESHOLD);
  assert.match(r.message, /كتام/); // duyulan metin öğrenciye gösterilir
});

test("judgeSpeech: alakasız söyleyiş 'uzak'", () => {
  const r = judgeSpeech("مدرسة", "medrese", "طاولة", "arabic");
  assert.equal(r.verdict, "uzak");
  assert.ok(r.similarity < NEAR_THRESHOLD);
});

test("judgeSpeech: boş sonuç 'bos' ve suçlayıcı olmayan mesaj", () => {
  const r = judgeSpeech("سوق", "suk", "   ", "arabic");
  assert.equal(r.verdict, "bos");
  assert.equal(r.similarity, 0);
  assert.match(r.message, /bir daha dene/i);
});

test("judgeSpeech: Latin dilde okunuş yolu kapalı, hedefle karşılaştırılır", () => {
  assert.equal(judgeSpeech("casa", "", "casa", "latin").verdict, "dogru");
  const near = judgeSpeech("escuela", "", "escuala", "latin");
  assert.equal(near.verdict, "yakin");
});


test("hüküm 'doğru telaffuz' DEĞİL 'anlaşıldı' der", () => {
  // Ölçülen şey ses tanımanın hedefi duymasıdır: anlaşılırlık. Telaffuz
  // puanı gibi sunmak öğrenciye yalan söylemek olurdu — ilerlediğini sanıp
  // ilerlemez.
  const r = judgeSpeech("سوق", "suk", "سوق", "arabic");
  assert.match(r.message, /Anlaşıldı/);
  assert.doesNotMatch(r.message, /Doğru/);
});

test("dürüstlük notu ne ölçüldüğünü açıkça söyler", () => {
  assert.match(RECOGNITION_NOTE, /telaffuz puanı değil/i);
  assert.match(RECOGNITION_NOTE, /ANLAŞILIRLIK/);
});
