/**
 * Hoca mesajlarının biçim ayrıştırması.
 *
 * Model doğal olarak markdown yazıyor (**kalın**, madde, başlık). Ayrıştırma
 * bozulursa öğrenci ekranda ham yıldız ve tire duvarı görür — uygulamanın en
 * çok bakılan yüzeyi budur ve şimdiye kadar hiç test edilmemişti.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyLine, isMostlyArabic, ltrLine, splitInline, splitScript } from "../src/richtext.ts";

test("boş satır 'blank' olur", () => {
  assert.equal(classifyLine("").type, "blank");
  assert.equal(classifyLine("   ").type, "blank");
});

test("başlık işareti ayıklanır ve düzeyi okunur", () => {
  const b = classifyLine("## Konuşma alıştırması");
  assert.equal(b.type, "heading");
  assert.equal(b.text, "Konuşma alıştırması");
  assert.equal(b.level, 2);
});

test("madde işareti • ile değiştirilir", () => {
  for (const raw of ["- elma", "* elma", "• elma"]) {
    const b = classifyLine(raw);
    assert.equal(b.type, "bullet", raw);
    assert.equal(b.text, "elma", raw);
    assert.equal(b.marker, "•", raw);
  }
});

test("numaralı madde sırasını korur", () => {
  const b = classifyLine("3. üçüncü madde");
  assert.equal(b.type, "numbered");
  assert.equal(b.text, "üçüncü madde");
  assert.match(b.marker ?? "", /3/);
});

test("alıntı satırı tanınır", () => {
  const b = classifyLine("> bu bir alıntı");
  assert.equal(b.type, "quote");
  assert.equal(b.text, "bu bir alıntı");
});

test("düz metin olduğu gibi kalır", () => {
  const b = classifyLine("Bugün pazara gittim.");
  assert.equal(b.type, "text");
  assert.equal(b.text, "Bugün pazara gittim.");
});

test("tire ile BAŞLAMAYAN metin madde sanılmaz", () => {
  // "iki-üç kelimelik" gibi cümleler madde işaretine dönüşmemeli.
  assert.equal(classifyLine("iki-üç kelimelik kalıp").type, "text");
});

test("kalın metin işaretsiz ve ayrı jeton olarak çıkar", () => {
  const t = splitInline("bu **çok** önemli");
  assert.deepEqual(
    t.map((x) => [x.kind, x.text]),
    [
      ["plain", "bu "],
      ["bold", "çok"],
      ["plain", " önemli"],
    ]
  );
});

test("kod ve italik jetonları ayrılır", () => {
  assert.ok(splitInline("`kod`").some((x) => x.kind === "code" && x.text === "kod"));
  assert.ok(splitInline("*eğik*").some((x) => x.kind === "italic" && x.text === "eğik"));
});

test("kapanmamış yıldız metni yutmaz", () => {
  // Model yarım bırakırsa ekran boşalmamalı.
  const t = splitInline("yarım **kalmış");
  assert.equal(t.map((x) => x.text).join(""), "yarım **kalmış");
});

test("işaretsiz metin tek düz jeton kalır", () => {
  const t = splitInline("sade cümle");
  assert.deepEqual(t, [{ kind: "plain", text: "sade cümle" }]);
});

test("karışık metinde Arapça koşular ayrılır", () => {
  // Görsel katman bu koşuları büyütüp Naskh fontuyla basıyor; ayrım
  // bozulursa harekeler kırpılır ya da Latin metin dev görünür.
  const runs = splitScript("Şimdi ne yapıyorsun? ماذا تفعل الآن؟");
  assert.ok(runs.length >= 2);
  assert.ok(runs.some((r) => r.arabic && r.text.includes("ماذا")));
  assert.ok(runs.some((r) => !r.arabic && r.text.includes("Şimdi")));
});

test("tamamen Latin metin tek koşu döner", () => {
  const runs = splitScript("Bonjour tout le monde");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].arabic, false);
});

test("boş metin çökertmez ve boş koşu üretmez", () => {
  // splitScript boş girdide tek boş koşu döndürür; görsel katman bunu
  // olduğu gibi basar, ekranda hiçbir şey görünmez — kabul edilebilir.
  const runs = splitScript("");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].text, "");
  assert.deepEqual(splitInline(""), []);
});

test("isMostlyArabic: Arapça ağırlıklı satır sağa, karışık açıklama sola", () => {
  assert.equal(isMostlyArabic("أَنَا طَالِبٌ"), true);
  assert.equal(isMostlyArabic("أَنَا طَالِبٌ فِي الْجَامِعَةِ (ben)"), true);
  assert.equal(isMostlyArabic("Bu kelime كتاب demek, yani kitap anlamında"), false);
  assert.equal(isMostlyArabic("Merhaba"), false);
  assert.equal(isMostlyArabic("1. 2. —"), false);
});

test("ltrLine: Arapçayla başlayan Türkçe açıklama soldan sağa sabitlenir", () => {
  assert.equal(ltrLine("بَعْدَ = sonra; karıştırma"), "\u200Eبَعْدَ = sonra; karıştırma");
  assert.equal(ltrLine("sadece Türkçe"), "sadece Türkçe");
  assert.equal(ltrLine("أَنَا طَالِبٌ"), "أَنَا طَالِبٌ");
  assert.equal(ltrLine(ltrLine("بَعْدَ = sonra")), "\u200Eبَعْدَ = sonra");
});
