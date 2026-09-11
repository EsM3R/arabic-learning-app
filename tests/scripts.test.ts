/** Yazı sistemi katmanı: ayıklama, tespit, RTL/okunuş kararları. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  containsTargetScript,
  extractScript,
  isRtl,
  listSeparator,
  needsTranslit,
} from "../src/scripts.ts";

test("RTL yalnız Arap alfabesi ailesinde — Kiril soldan sağadır", () => {
  assert.equal(isRtl("arabic"), true);
  assert.equal(isRtl("persian"), true);
  assert.equal(isRtl("cyrillic"), false);
  assert.equal(isRtl("latin"), false);
});

test("okunuş Latin DIŞI her yazı sisteminde gerekli (Kiril dahil)", () => {
  // Eski tek-boole mimarisinin yanlış cevapladığı asıl soru buydu:
  // Rusça RTL değil ama öğrencinin Kiril klavyesi de yok.
  assert.equal(needsTranslit("cyrillic"), true);
  assert.equal(needsTranslit("arabic"), true);
  assert.equal(needsTranslit("persian"), true);
  assert.equal(needsTranslit("latin"), false);
});

test("liste ayracı: Arap alfabesinde Arapça virgül, diğerlerinde düz virgül", () => {
  assert.equal(listSeparator("arabic"), "، ");
  assert.equal(listSeparator("persian"), "، ");
  assert.equal(listSeparator("cyrillic"), ", ");
  assert.equal(listSeparator("latin"), ", ");
});

test("ayıklama: karışık metinden yalnız hedef alfabe çıkar", () => {
  const out = extractScript("Şimdi ne yapıyorsun? ماذا تفعل الآن؟ diye sor.", "arabic");
  assert.equal(out.includes("ماذا تفعل"), true);
  assert.equal(out.includes("Şimdi"), false);
});

test("ayıklama: aradaki boşluk parçayı bölmez — seslendirme kesik olmasın", () => {
  assert.equal(extractScript("مرحبا يا صديقي", "arabic"), "مرحبا يا صديقي");
  assert.equal(extractScript("Merhaba: Привет, как дела?", "cyrillic"), "Привет, как дела");
});

test("ayıklama: Latin dillerde her zaman boş — metin olduğu gibi okunur", () => {
  assert.equal(extractScript("Bonjour tout le monde", "latin"), "");
});

test("ayıklama: hedef alfabeden hiç harf yoksa boş", () => {
  assert.equal(extractScript("sadece Türkçe cümle", "arabic"), "");
  assert.equal(extractScript("sadece Türkçe cümle", "cyrillic"), "");
});

test("tespit: Latin dilde HER ZAMAN false (Türkçe ile ayırt edilemez)", () => {
  // Dürüst ölçüm: "bilmiyorum" demek, "evet" demekten iyidir — yoksa
  // öğrencinin Türkçe yazdığı her cümle 'üretim' sayılırdı.
  assert.equal(containsTargetScript("Bonjour", "latin"), false);
  assert.equal(containsTargetScript("سلام", "persian"), true);
  assert.equal(containsTargetScript("привет", "cyrillic"), true);
  assert.equal(containsTargetScript("privet", "cyrillic"), false);
});
