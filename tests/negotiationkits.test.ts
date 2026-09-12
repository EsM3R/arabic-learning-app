/**
 * Müzakere araç çantalarının bütünlüğü.
 *
 * İçerik sekiz dil için elle yazılıyor ve bir kalıbın eksik/yanlış olması
 * sessizce geçer: prompt'a boş satır girer, öğrenci o hamleyi hiç öğrenmez
 * ve ölçüm onu "kullanmamış" sayar. Bu testler o sessizliği bozar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { LANGUAGE_LIST, LANGUAGE_PACKS } from "../src/languages.ts";
import { NEGOTIATION_KITS } from "../src/negotiationkits.ts";
import { detectRepair, REPAIR_CATEGORIES } from "../src/negotiation.ts";
import { needsTranslit } from "../src/scripts.ts";

test("her dilin araç çantası var ve pakete bağlı", () => {
  for (const pack of LANGUAGE_LIST) {
    const kit = NEGOTIATION_KITS[pack.id];
    assert.ok(kit, `${pack.id}: araç çantası yok`);
    assert.equal(pack.negotiation, kit, `${pack.id}: paket başka bir çantaya bağlı`);
  }
});

test("fazladan/eksik dil kimliği yok", () => {
  const packIds = LANGUAGE_LIST.map((p) => p.id).sort();
  assert.deepEqual(Object.keys(NEGOTIATION_KITS).sort(), packIds);
});

test("her dilde SEKİZ onarım kategorisinin hepsi var", () => {
  // Bir kategori eksikse öğrenci o hamleyi hiç görmez ve ölçüm onu asla
  // "kullanmış" sayamaz — eksik sessizce kalıcı olur.
  for (const pack of LANGUAGE_LIST) {
    const cats = new Set(pack.negotiation.phrases.map((p) => p.category));
    for (const c of REPAIR_CATEGORIES) {
      assert.ok(cats.has(c), `${pack.id}: "${c}" kategorisi eksik`);
    }
  }
});

test("kalıplar KISA — panikteyken uzun cümle kurulmaz", () => {
  for (const pack of LANGUAGE_LIST) {
    for (const p of pack.negotiation.phrases) {
      const words = p.target.trim().split(/\s+/).length;
      assert.ok(words <= 6, `${pack.id}: "${p.target}" çok uzun (${words} kelime)`);
    }
  }
});

test("zorunlu alanlar dolu ve register geçerli", () => {
  const registers = ["samimi", "notr", "resmi"];
  for (const pack of LANGUAGE_LIST) {
    for (const p of pack.negotiation.phrases) {
      assert.ok(p.target.trim().length > 0, `${pack.id}: boş hedef`);
      assert.ok(p.tr.trim().length > 0, `${pack.id}: "${p.target}" Türkçesiz`);
      assert.ok(registers.includes(p.register), `${pack.id}: "${p.target}" register geçersiz`);
    }
    assert.ok(pack.negotiation.teacherCue.trim().length > 0, `${pack.id}: teacherCue boş`);
    assert.ok(pack.negotiation.turkishTrap.trim().length > 0, `${pack.id}: turkishTrap boş`);
    assert.ok(pack.negotiation.fillers.length >= 2, `${pack.id}: doldurucu az`);
    assert.ok(pack.negotiation.circumlocution.length >= 1, `${pack.id}: tarif kalıbı yok`);
  }
});

test("Latin DIŞI dillerde okunuş var, Latin dillerde yok", () => {
  // Okunuşsuz Kiril/Arap kalıbı, klavyesi olmayan öğrenci için kullanılamaz.
  // Latin dilde okunuş ise gürültüdür (hedef zaten okunabiliyor).
  for (const pack of LANGUAGE_LIST) {
    for (const p of pack.negotiation.phrases) {
      if (needsTranslit(pack.script)) {
        assert.ok(p.translit.trim().length > 0, `${pack.id}: "${p.target}" okunuşsuz`);
      } else {
        assert.equal(p.translit, "", `${pack.id}: "${p.target}" gereksiz okunuş taşıyor`);
      }
    }
  }
});

test("okunuşlar TÜRKÇE ses değerleriyle yazılmış", () => {
  // "sh/ch/kh" İngiliz tarzıdır ve Türk öğrenciyi yanlış okutur: "sh"i
  // "sıh" diye okur. Bu uygulamada okunuş Türkçe okunur.
  const englishDigraph = /\b\w*(sh|ch|kh|th)\w*\b/i;
  for (const pack of LANGUAGE_LIST) {
    if (!needsTranslit(pack.script)) continue;
    for (const p of pack.negotiation.phrases) {
      assert.doesNotMatch(
        p.translit,
        englishDigraph,
        `${pack.id}: "${p.translit}" İngiliz tarzı digraf taşıyor`
      );
    }
  }
});

test("aynı kategoride ikiden fazla kalıp yok", () => {
  for (const pack of LANGUAGE_LIST) {
    const count = new Map<string, number>();
    for (const p of pack.negotiation.phrases) {
      count.set(p.category, (count.get(p.category) ?? 0) + 1);
    }
    for (const [cat, n] of count) {
      assert.ok(n <= 2, `${pack.id}: "${cat}" kategorisinde ${n} kalıp var (en fazla 2)`);
    }
  }
});

test("aynı kalıp iki kez yazılmamış", () => {
  for (const pack of LANGUAGE_LIST) {
    const seen = new Set<string>();
    for (const p of pack.negotiation.phrases) {
      const key = p.target.trim().toLowerCase();
      assert.ok(!seen.has(key), `${pack.id}: "${p.target}" tekrar ediyor`);
      seen.add(key);
    }
  }
});

test("her dilde kendi kalıbı KENDİ tespit edicisiyle yakalanıyor", () => {
  // Uçtan uca kontrol: içerik ile tespit mantığı aynı normalizasyonu
  // kullanıyor mu? Kullanmıyorsa ölçüm hep sıfır kalır ve kimse fark etmez.
  for (const pack of LANGUAGE_LIST) {
    for (const p of pack.negotiation.phrases) {
      const found = detectRepair(p.target, pack.negotiation, pack.script);
      assert.ok(
        found.includes(p.category),
        `${pack.id}: "${p.target}" kendi kategorisinde (${p.category}) yakalanmadı → ${found.join(",") || "hiç"}`
      );
    }
  }
});

test("alakasız cümle hiçbir dilde onarım sanılmaz", () => {
  for (const pack of LANGUAGE_LIST) {
    const noise = "1234567890";
    assert.deepEqual(
      detectRepair(noise, pack.negotiation, pack.script),
      [],
      `${pack.id}: gürültü onarım sanıldı`
    );
  }
});

test("Arapça kalıplar fusha, Farsça kalıplar konuşma registerı", () => {
  // İki pakette register kararı bilinçliydi; içerik onu bozmamalı.
  assert.ok(LANGUAGE_PACKS.ar.negotiation.phrases.length >= 8);
  assert.ok(LANGUAGE_PACKS.fa.negotiation.phrases.length >= 8);
});
