/**
 * Dil paketi bütünlüğü. Paketler elle yazılıyor ve sayıları arttıkça bir
 * alanı unutmak kolaylaşıyor — eksik alan telefonda "undefined" olarak
 * prompt'a girer ve hoca bozuk talimat alır. Burada sekiz paket de tek tek
 * denetleniyor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isLanguageId, LANGUAGE_LIST, LANGUAGE_PACKS } from "../src/languages.ts";
import { needsTranslit } from "../src/scripts.ts";
import { speechLocale, SPEECH_LOCALES } from "../src/speechinput.ts";

const SCRIPTS = ["latin", "arabic", "persian", "cyrillic"];
const LEVELS = ["A0", "A1", "A2", "B1", "B2", "C1"];

test("liste paketlerden türetilir; her paketin id'si anahtarıyla aynı", () => {
  assert.equal(LANGUAGE_LIST.length, Object.keys(LANGUAGE_PACKS).length);
  for (const [key, pack] of Object.entries(LANGUAGE_PACKS)) {
    assert.equal(pack.id, key, `${key} paketinin id'si tutmuyor`);
    assert.ok(isLanguageId(key));
  }
});

test("her pakette metin alanları dolu ve yazı sistemi geçerli", () => {
  const required = [
    "label",
    "flag",
    "greeting",
    "teacherName",
    "avatarLetter",
    "ttsLocale",
    "targetAccusative",
    "persona",
    "contentFormat",
    "rolePartner",
    "scenarios",
    "readingVariant",
    "readingFunctionWords",
    "pronunciationFocus",
    "freeChatTask",
    "chatPlaceholderFree",
  ] as const;
  for (const pack of LANGUAGE_LIST) {
    assert.ok(SCRIPTS.includes(pack.script), `${pack.id}: bilinmeyen yazı sistemi`);
    for (const field of required) {
      const v = pack[field];
      assert.equal(typeof v, "string", `${pack.id}.${field} string değil`);
      assert.ok((v as string).trim().length > 0, `${pack.id}.${field} boş`);
    }
    for (const track of [pack.tracks.konusma, pack.tracks.okuma]) {
      for (const field of ["title", "subtitle", "icon", "short"] as const) {
        assert.ok(track[field].trim().length > 0, `${pack.id}: parkur ${field} boş`);
      }
    }
  }
});

test("yazı politikası kuralı her seviye için bir talimat üretir", () => {
  for (const pack of LANGUAGE_LIST) {
    for (const level of LEVELS) {
      const rule = pack.readingScriptRule(level);
      assert.ok(rule.trim().length > 0, `${pack.id}/${level}: yazı kuralı boş`);
    }
  }
});

test("Latin dışı her pakette yeni kelime yazım notu var, Latin paketlerde yok", () => {
  // Not prompt'a aynen giriyor: Arapçada tam hareke, Rusçada vurgu işareti,
  // Farsçada ZWNJ. Latin dilde boş kalmalı, yoksa cümle ortasında sarkar.
  for (const pack of LANGUAGE_LIST) {
    if (needsTranslit(pack.script)) {
      assert.ok(pack.newWordNote.trim().length > 0, `${pack.id}: yazım notu eksik`);
      assert.ok(pack.newWordNote.startsWith(","), `${pack.id}: not virgülle başlamalı`);
    } else {
      assert.equal(pack.newWordNote, "", `${pack.id}: Latin dilde not olmamalı`);
    }
  }
});

test("her dilin ses tanıma yerel kodu var ve TTS diliyle aynı dili gösteriyor", () => {
  // Ayrılırlarsa öğrenci bir dilde dinleyip başka bir dilde konuşmuş olur —
  // mikrofon sessizce hep "uzak" verirdi.
  for (const pack of LANGUAGE_LIST) {
    const asr = SPEECH_LOCALES[pack.id];
    assert.ok(asr, `${pack.id}: ses tanıma yerel kodu tanımsız`);
    assert.equal(speechLocale(pack.id), asr);
    assert.equal(
      asr.split("-")[0].toLowerCase(),
      pack.ttsLocale.split("-")[0].toLowerCase(),
      `${pack.id}: tanıma ve seslendirme dilleri farklı`
    );
  }
});

test("Arapça hâlâ diglossik değil, Farsça diglossik", () => {
  // Arapça paketi fusha-only'ye çevrildi (tek register); Farsçada yazılı
  // (می‌روم) ve konuşulan (می‌رم) gerçekten ayrı registerlar.
  assert.equal(LANGUAGE_PACKS.ar.diglossic, false);
  assert.equal(LANGUAGE_PACKS.fa.diglossic, true);
});
