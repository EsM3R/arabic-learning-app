/**
 * Cümle Kurma yöntem tablosu — saf veri.
 *
 * Bu tablonun bozulması sessizdir: İngilizce bir tuzak Arapça prompt'a
 * sızarsa model "ago/before" farkını Arapça cümleye yazar ve öğrenci
 * olmayan bir tuzakla uğraşır; sistem kimliği koddaki derse çözülmezse
 * 4 parçalı ders hiç gösterilmez. Testler bu sızıntıları ve boşlukları tutar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { connectorReorder, METHOD, methodFor, promptSystemIds, systemById, trapById } from "../src/buildmethod.ts";
import { LANGUAGE_PACKS } from "../src/languages.ts";
import type { LanguageId } from "../src/languages.ts";
import type { Band } from "../src/sentencebuilding.ts";

const LANGS = Object.keys(LANGUAGE_PACKS) as LanguageId[];
const BANDS: Band[] = ["A1", "A2", "B1", "B2", "C1"];

test("her dilin yöntem tablosu var; bilinmeyen dil İngilizceye düşer", () => {
  for (const id of LANGS) {
    assert.ok(METHOD[id], id);
    assert.equal(METHOD[id].id, id);
    assert.ok(METHOD[id].questionOrder.length >= 3, id);
    assert.ok(METHOD[id].slotOrder && METHOD[id].subjectRule && METHOD[id].adverbRule, id);
  }
  assert.equal(methodFor("xx").id, "en");
  assert.equal(methodFor(undefined).id, "en");
});

test("her promptBlock her bantta 1200 karakteri aşmaz ve Türkçe başlıklı", () => {
  for (const id of LANGS) {
    for (const band of [...BANDS, "C2" as Band]) {
      const b = METHOD[id].promptBlock(band);
      assert.ok(b.length <= 1200, `${id} ${band}: ${b.length}`);
      assert.match(b, /^DİL: /);
      assert.match(b, /KAYITLI TUZAKLAR/);
      assert.match(b, /SİSTEM DERSLERİ:/);
    }
  }
});

test("Arapça blok أَنْ ve بِـ'yi anlatır; İngilizce tuzak ve AM/PM İÇERMEZ", () => {
  for (const band of BANDS) {
    const b = METHOD.ar.promptBlock(band);
    assert.ok(b.includes("أَنْ"), band);
    assert.ok(b.includes("بِـ"), band);
    for (const bad of ["ago", "turn on", "AM/PM", "with değil"]) assert.ok(!b.includes(bad), `${band}: ${bad}`);
  }
  // Hareke politikası: A1–B1 tam, B2+ yalnız öğretilen kelimelerde.
  assert.match(METHOD.ar.promptBlock("A2"), /TAM harekeli/);
  assert.doesNotMatch(METHOD.ar.promptBlock("B2"), /TAM harekeli/);
});

test("Arapça geri çağırma seçenekleri asla ago ya da AM/PM değildir", () => {
  const options: string[] = [];
  for (const t of METHOD.ar.traps) if (t.pair) options.push(...t.pair);
  for (const s of METHOD.ar.systems) if (s.retrieval) options.push(...s.retrieval.options);
  assert.ok(options.length >= 6);
  for (const o of options) {
    assert.doesNotMatch(o, /\bago\b/i, o);
    assert.doesNotMatch(o, /\b(am|pm)\b/i, o);
  }
  // Tasarımdaki çiftler yerinde.
  assert.deepEqual(trapById("ar", "ar-maa-bi")?.pair, ["بِـ", "مَعَ"]);
  assert.deepEqual(trapById("ar", "ar-an")?.pair, ["قَبْلَ أَنْ", "قَبْلَ"]);
  assert.deepEqual(trapById("ar", "ar-shaghghala")?.pair, ["أُشَغِّلُ", "أَفْتَحُ"]);
  assert.deepEqual(trapById("ar", "ar-ordinal")?.pair, ["السَّابِعَة", "سَبْعَة"]);
});

test("Arapça tuzak listesi Türklere özgü dokuz tuzak; İngilizce tuzak kimliği yok", () => {
  const ids = METHOD.ar.traps.map((t) => t.id).sort();
  assert.deepEqual(ids, ["ar-an", "ar-an-verb", "ar-idha-law", "ar-khuruj", "ar-lahiqan", "ar-lakin", "ar-maa-bi", "ar-ordinal", "ar-shaghghala"]);
  for (const id of LANGS.filter((l) => l !== "en")) {
    for (const t of METHOD[id].traps) assert.ok(!t.id.startsWith("en-"), `${id}: ${t.id}`);
  }
});

test("Farsçada with/by tuzağı yok; Almancada sıralama fiil yer değiştirerek (inversion)", () => {
  for (const t of METHOD.fa.traps) {
    assert.ok(!/with|by|vasıta/.test(t.tr), t.id);
    assert.ok(!t.wrong.includes("با") || !t.right.includes("به"), t.id);
  }
  assert.doesNotMatch(METHOD.fa.promptBlock("A2"), /with\/by/);
  assert.equal(METHOD.de.reorder, "inversion");
  assert.equal(METHOD.de.autoReorder, false); // fiil yer değiştirdiği için cihaz kendisi kuramaz
  assert.equal(METHOD.fa.reorder, "lessNatural");
});

test("her sistem kimliği 4 parçalı bir derse çözülür (prompt listesi dahil)", () => {
  for (const id of LANGS) {
    const m = METHOD[id];
    assert.ok(m.systems.length >= 1, id);
    const listed = promptSystemIds(m);
    assert.ok(listed.length >= 1, id);
    for (const sid of listed) assert.ok(systemById(id, sid), `${id}: ${sid}`);
    for (const s of m.systems) {
      assert.ok(s.title && s.a && s.b && s.c, `${id}/${s.id}`);
      assert.ok(s.d("x").length > 0, `${id}/${s.id} d`);
      assert.ok(s.trigger instanceof RegExp);
      if (s.retrieval) {
        assert.equal(s.retrieval.options.length, 2);
        assert.ok([0, 1].includes(s.retrieval.pick("x")));
        assert.ok(s.retrieval.why("x").length > 0);
      }
    }
  }
  // Tasarımdaki listeler.
  assert.deepEqual(promptSystemIds(METHOD.ar), ["saat-sira", "ikil", "sayi-cinsiyet", "olumsuzluk", "irab", "fiil-kaliplari"]);
  assert.deepEqual(promptSystemIds(METHOD.en), ["clock12"]);
  assert.ok(systemById("de", "v2-fiil-sonda"));
  assert.ok(systemById("ru", "hareket-gorunus"));
  assert.ok(systemById("fa", "ezafe-ra"));
  assert.ok(systemById("es", "ser-estar"));
  assert.ok(systemById("fr", "artikel-birlesme") && systemById("it", "artikel-birlesme"));
});

test("sistem dersleri cümleye uygulanır: AM/PM ve صَبَاحًا/مَسَاءً seçimi hikâyeden", () => {
  const clock = systemById("en", "clock12")!;
  assert.equal(clock.retrieval!.pick("I go to bed at around 10 PM"), 1);
  assert.equal(clock.retrieval!.pick("I wake up at 7 a.m."), 0);
  assert.match(clock.d("I leave work at around 7 pm"), /7 PM/);
  assert.match(clock.retrieval!.why("at 10 PM"), /yatağa/);
  const saat = systemById("ar", "saat-sira")!;
  assert.deepEqual(saat.retrieval!.options, ["صَبَاحًا", "مَسَاءً"]);
  assert.equal(saat.retrieval!.pick("أَخْرُجُ مِنَ العَمَلِ حَوَالَيِ السَّاعَةِ السَّابِعَةِ مَسَاءً"), 1);
  assert.equal(saat.retrieval!.pick("أَسْتَيْقِظُ فِي السَّاعَةِ السَّابِعَةِ صَبَاحًا"), 0);
});

test("her tuzak tespit edilebilir: wrong/right tokenları ya da detect; metni ve kimliği tekil", () => {
  for (const id of LANGS) {
    const ids = new Set<string>();
    for (const t of METHOD[id].traps) {
      assert.ok(!ids.has(t.id), `${id}: ${t.id} tekrar`);
      ids.add(t.id);
      assert.ok(typeof t.detect === "function" || (t.wrong.length > 0 && t.right.length > 0), `${id}: ${t.id}`);
      assert.ok(t.text.length > 10 && t.text.length <= 200, `${id}: ${t.id} metin`);
      assert.ok(t.tr, t.id);
      if (t.pair) assert.equal(t.pair.length, 2);
    }
    // Bağlacın tuzak kimliği gerçekten var.
    for (const c of Object.values(METHOD[id].connectors)) {
      if (c.trapId) assert.ok(trapById(id, c.trapId), `${id}: ${c.trapId}`);
    }
  }
});

test("yalnız yan cümle bağlacı yer değiştirir; ama/çünkü hiçbir dilde", () => {
  for (const id of LANGS) {
    const m = METHOD[id];
    for (const [tr, c] of Object.entries(m.connectors)) {
      const r = connectorReorder(m, tr);
      if (c.kind !== "sub") assert.equal(r, "none", `${id}: ${tr}`);
      else assert.equal(r, m.reorder, `${id}: ${tr}`);
    }
    assert.equal(m.connectors["ama"]?.kind, "coord", id);
    assert.equal(m.connectors["çünkü"]?.kind, "causal", id);
    assert.equal(m.connectors["-madan önce"]?.kind, "sub", id);
  }
  assert.equal(connectorReorder(METHOD.en, "yok-böyle"), "none");
});

test("gürültü listeleri ile asla-yakın listeleri çakışmaz", () => {
  for (const id of LANGS) {
    const m = METHOD[id];
    const markers = new Set(m.markers);
    for (const a of m.articles) assert.ok(!markers.has(a), `${id}: ${a}`);
  }
  // Videodaki ek karşılıkları İngilizcede asla yakın sayılmaz.
  for (const t of ["to", "by", "at"]) assert.ok(METHOD.en.markers.includes(t), t);
  assert.deepEqual(METHOD.en.articles, ["a", "an", "the"]);
});
