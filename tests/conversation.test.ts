/**
 * Konuşma Odası — saf mantık.
 *
 * Konuşma hissi üç şeyden gelir: ses önce, kısa sıralar, düzeltmeyi sona
 * bırakmak. Üçünün de burada ölçülebilir bir parçası var. En kritik olanı
 * cümle ayıklayıcı: bozulursa ekran çökmez, ses de gelir — yalnız cevabın
 * SONUNU bekler ve konuşma hissi sessizce ölür. Bunu ancak test yakalar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conversationRules,
  normalizeDebrief,
  SCENARIOS,
  sceneRules,
  scenariosFor,
  takeSentences,
  toBand,
  transcriptForDebrief,
  turkishPolicy,
} from "../src/conversation.ts";

// --- akıştan cümle ayıklama --------------------------------------------------

test("tamamlanan cümle hemen alınır, bitmemiş kuyruk bekler", () => {
  const r = takeSentences("Merhaba, nasılsın? Bugün hava çok gü");
  assert.deepEqual(r.sentences, ["Merhaba, nasılsın?"]);
  assert.equal(r.rest, "Bugün hava çok gü");
});

test("Arapça soru işareti de cümle sonudur", () => {
  const r = takeSentences("كيف حالك؟ أنا بخير.");
  assert.deepEqual(r.sentences, ["كيف حالك؟", "أنا بخير."]);
  assert.equal(r.rest, "");
});

test("bitmemiş metin hiç cümle vermez — yarım cümle sese gitmez", () => {
  // Yarım cümleyi okutmak, kelimenin ortasında susan bir hoca demek.
  const r = takeSentences("Bugün seninle");
  assert.deepEqual(r.sentences, []);
  assert.equal(r.rest, "Bugün seninle");
});

test("'1.' ve 'Dr.' gibi kesintiler cümle sanılmaz", () => {
  const r = takeSentences("1. madde şu. Dr. Ahmet geldi.");
  assert.deepEqual(r.sentences, ["1. madde şu.", "Dr. Ahmet geldi."]);
});

test("satır sonu da sıra sonudur", () => {
  const r = takeSentences("Merhaba\nNasılsın");
  assert.deepEqual(r.sentences, ["Merhaba"]);
  assert.equal(r.rest, "Nasılsın");
});

test("delta delta beslenince cümleler bir kez ve sırayla çıkar", () => {
  // Gerçek akışta metin harf harf gelir; kuyruk her seferinde geri
  // beslenir. Aynı cümle iki kez okunursa hoca kekeler.
  const deltas = ["Mer", "haba! Na", "sılsın? Ben ", "iyiyim."];
  let rest = "";
  const out: string[] = [];
  for (const d of deltas) {
    const r = takeSentences(rest + d);
    out.push(...r.sentences);
    rest = r.rest;
  }
  assert.deepEqual(out, ["Merhaba!", "Nasılsın?", "Ben iyiyim."]);
  assert.equal(rest, "");
});

// --- sahneler ----------------------------------------------------------------

test("her sahnenin kişisi, durumu ve hedefi var", () => {
  // Hedefsiz sahne değerlendirilemez; kişisiz sahne hoca monoloğuna döner.
  for (const s of SCENARIOS) {
    assert.ok(s.persona.length > 10, s.id);
    assert.ok(s.situation.length > 10, s.id);
    assert.ok(s.goal.length > 10, s.id);
  }
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
});

test("A1 öğrencisine iş görüşmesi sunulmaz", () => {
  // Cesaretlendirmek değil korkutmak olurdu.
  const ids = scenariosFor("A1").map((s) => s.id);
  assert.ok(ids.includes("kafe"));
  assert.ok(!ids.includes("is"));
  assert.ok(!ids.includes("tartisma"));
});

test("seviye yükseldikçe sahne listesi büyür, hiç küçülmez", () => {
  const a1 = scenariosFor("A1").length;
  const b1 = scenariosFor("B1").length;
  const c1 = scenariosFor("C1").length;
  assert.ok(a1 < b1 && b1 < c1);
  assert.equal(c1, SCENARIOS.length);
});

test("A0 ve bilinmeyen seviye A1 sayılır, C2 C1 sayılır", () => {
  assert.equal(toBand("A0"), "A1");
  assert.equal(toBand(undefined), "A1");
  assert.equal(toBand("saçma"), "A1");
  assert.equal(toBand("C2"), "C1");
});

// --- kurallar ----------------------------------------------------------------

test("konuşma kuralları kısa sıra ve soruyla bitirmeyi şart koşar", () => {
  const r = conversationRules();
  assert.match(r, /EN FAZLA 1-3 cümle/);
  assert.match(r, /soruyla ya da açık bir davetle bitsin/);
  assert.match(r, /okunuş \(transliterasyon\), emoji KULLANMA/); // sesli ortam
});

test("sahne kuralı düzeltmeyi YASAKLAR ve karakteri korur", () => {
  // Konuşma sırasında düzeltilen öğrenci konuşmayı bırakıp dinlemeye geçer.
  const r = sceneRules(SCENARIOS[0]);
  assert.match(r, /DÜZELTME YAPMA/);
  assert.match(r, /KARAKTERDEN ÇIKMA/);
  assert.match(r, new RegExp(SCENARIOS[0].goal.slice(0, 20)));
});

test("Türkçe politikası seviyeyle sertleşir", () => {
  assert.match(turkishPolicy("A1"), /TEK cümlelik Türkçe ipucu/);
  assert.match(turkishPolicy("B1"), /Türkçeye geçme/);
  assert.match(turkishPolicy("C1"), /Türkçe hiç kullanma/);
});

// --- değerlendirme -----------------------------------------------------------

test("bozuk model çıktısı ÇÖKERTMEZ, boş ama geçerli değerlendirme döner", () => {
  const d = normalizeDebrief(null);
  assert.equal(d.summary, "");
  assert.equal(d.goalReached, null);
  assert.deepEqual(d.corrections, []);
  assert.deepEqual(d.phrases, []);
});

test("eksik alanlı düzeltme ve kalıp elenir, sağlamlar kalır", () => {
  const d = normalizeDebrief({
    summary: " iyi ",
    goalReached: true,
    corrections: [
      { said: "x", better: "y", why: "z" },
      { said: "", better: "y", why: "z" }, // said yok
      { said: "a" }, // better yok
      null,
    ],
    phrases: [{ target: "t", translit: "", tr: "ç" }, { target: "", tr: "x" }, "saçma"],
    keep: ["iyi", "", 5],
  });
  assert.equal(d.summary, "iyi");
  assert.equal(d.goalReached, true);
  assert.equal(d.corrections.length, 1);
  assert.equal(d.phrases.length, 1);
  assert.deepEqual(d.keep, ["iyi"]);
});

test("düzeltme sayısı sınırlı — uzun liste öğrenciyi boğar", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ said: `s${i}`, better: `b${i}`, why: "w" }));
  assert.ok(normalizeDebrief({ corrections: many }).corrections.length <= 8);
});

test("goalReached yalnız boolean ise alınır", () => {
  assert.equal(normalizeDebrief({ goalReached: "evet" }).goalReached, null);
  assert.equal(normalizeDebrief({ goalReached: false }).goalReached, false);
});

test("transkript uygulama bildirimlerini ve [sesli] işaretini temizler", () => {
  const t = transcriptForDebrief([
    { role: "user", content: "[Uygulama bildirimi: sahne başlıyor]" },
    { role: "assistant", content: "أهلاً" },
    { role: "user", content: "[sesli] مرحبا" },
  ]);
  assert.equal(t, "MUHATAP: أهلاً\nÖĞRENCİ: مرحبا");
});
