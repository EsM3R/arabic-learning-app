/**
 * Cümle Kurma denetimi — saf mantık.
 *
 * Denetimin iki yönlü bir sorumluluğu var: hocanın uyardığı tuzağa düşen
 * öğrenciye "çok yakın" dememek (with/by, ago/before, Arapçada unutulan
 * أَنْ), ama ses tanımanın yuttuğu bir "the" yüzünden doğru konuşanı
 * cezalandırmamak. Buradaki her test bu dengenin bir kenarını tutuyor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addedTokens,
  alignTokens,
  canonicalTokens,
  checkAnswer,
  deriveSwaps,
  diffAdded,
  editDistance,
  expandSwaps,
  findConnector,
  locateTrPiece,
  MAX_FORMS,
  spanSwap,
} from "../src/buildcheck.ts";
import type { CheckCtx } from "../src/buildcheck.ts";
import type { Swap } from "../src/sentencebuilding.ts";

const en = (extra: Partial<CheckCtx> = {}): CheckCtx => ({ lang: "en", ...extra });
const ar = (extra: Partial<CheckCtx> = {}): CheckCtx => ({ lang: "ar", ...extra });
const check = (target: string, given: string | string[], ctx: CheckCtx) => checkAnswer(target, [], given, ctx);

// --- 4.1 karşılaştırma biçimi ----------------------------------------------------

test("saat yazımları aynı: 7 p.m. = 7pm = seven PM = at around 7 P.M.", () => {
  const t = "I leave work at around 7 PM.";
  for (const g of ["I leave work at around 7 p.m.", "I leave work at around 7pm", "I leave work at around seven PM", "i leave work at around 7 P.M"]) {
    assert.equal(check(t, g, en())?.verdict, "dogru", g);
  }
  assert.deepEqual(canonicalTokens("at 7 o'clock", "en"), ["at", "7", "oclock"]);
  assert.deepEqual(canonicalTokens("the T.V.", "en"), ["the", "tv"]);
});

test("kıvrık tırnak ve uzun tire katlanır; kısaltma açılır", () => {
  assert.deepEqual(canonicalTokens("I‘m tired", "en"), canonicalTokens("I am tired", "en"));
  assert.deepEqual(canonicalTokens("I’m tired", "en"), ["i", "am", "tired"]);
  assert.equal(check("Before I have breakfast, I take a shower.", "Before I have breakfast — I take a shower", en())?.verdict, "dogru");
});

test("Arapça: rakamlar, hareke, ayrı yazılan ön ek ve بال ayrımı", () => {
  assert.deepEqual(canonicalTokens("بِالمِتْرُو", "ar"), ["ب", "المترو"]);
  assert.deepEqual(canonicalTokens("بال مترو", "ar"), ["ب", "المترو"]);
  assert.deepEqual(canonicalTokens("لِلْعَمَلِ", "ar"), ["ل", "العمل"]);
  assert.deepEqual(canonicalTokens("السَّاعَةَ السَّابِعَةَ", "ar"), ["الساعه", "7"]);
  assert.deepEqual(canonicalTokens("الساعة ٧", "ar"), ["الساعه", "7"]);
  assert.deepEqual(canonicalTokens("السَّاعَةُ الحَادِيَةَ عَشْرَةَ", "ar"), ["الساعه", "11"]);
  // Asıl sayı kelimesi katlanmaz: o, tuzağın kendisi.
  assert.deepEqual(canonicalTokens("الساعه سبعه", "ar"), ["الساعه", "سبعه"]);
  assert.deepEqual(canonicalTokens("۷ ساعت", "fa"), ["7", "ساعت"]);
});

// --- hizalama ----------------------------------------------------------------------

test("kelime düzeyi hizalama geri izlemeyle eksik/fazla/değişeni ayırır", () => {
  const ops = alignTokens(["i", "go", "to", "work"], ["i", "go", "work", "now"]);
  assert.deepEqual(
    ops.filter((o) => o.op !== "eq").map((o) => [o.op, o.e ?? o.g]),
    [["del", "to"], ["ins", "now"]]
  );
  assert.equal(editDistance(["a", "b", "c"], ["a", "x", "c"]), 1);
  assert.equal(editDistance([], ["a"]), 1);
});

// --- 4.3 karar tablosu ---------------------------------------------------------------

const BEFORE = "Before I have breakfast, I take a shower.";

test("before yerine after: yanlış (bağlaç) — 'yakın' değil", () => {
  const r = check(BEFORE, "After I have breakfast, I take a shower", en())!;
  assert.equal(r.verdict, "yanlis");
  assert.ok(r.reason === "trap" || r.reason === "connector");
  assert.equal(r.credit, 0);
});

test("TUZAK: -la vasıta with değil by", () => {
  const r = check("I go to work by metro", "I go to work with metro", en())!;
  assert.equal(r.verdict, "yanlis");
  assert.equal(r.reason, "trap");
  assert.equal(r.trapId, "en-with-by");
  assert.match(r.feedback, /by/);
  assert.deepEqual(r.mini, ["by bus", "with my friend"]);
});

test("TUZAK: TV için open değil turn on; ago değil before", () => {
  const r = check("I turn on the TV", "I open the TV", en())!;
  assert.equal(r.reason, "trap");
  assert.equal(r.trapId, "en-open");
  const a = check(BEFORE, "Ago I have breakfast, I take a shower", en())!;
  assert.equal(a.trapId, "en-ago");
  // Bloğun ilk seferki karşıtlığı tuzak metninin yerine geçer.
  const o = check("I go to work by metro", "I go to work with metro", en({ trapText: { "en-with-by": "Kendi notum" } }))!;
  assert.match(o.feedback, /^Kendi notum/);
});

test("GÜRÜLTÜ: 5 kelimede yutulan 'the' yakın; seste kredi 1, yazıda 0.5", () => {
  const typed = check("I turn on the TV", "I turn on TV", en())!;
  assert.equal(typed.verdict, "yakin");
  assert.equal(typed.reason, "noise");
  assert.equal(typed.credit, 0.5);
  assert.match(typed.feedback, /Çok yakın: the eksik/);
  const spoken = check("I turn on the TV", "I turn on TV", en({ spoken: true }))!;
  assert.equal(spoken.verdict, "yakin");
  assert.equal(spoken.credit, 1);
  assert.match(spoken.feedback, /ses tanıma artikeli yutmuş olabilir/);
});

test("GÜRÜLTÜ sınırı: 6 kelimede en fazla 1 artikel farkı", () => {
  // 5 kelimede iki artikel eksik → yakın değil.
  assert.equal(check("I take the bus to the station", "I take bus to station", en())?.verdict, "yanlis");
  // 12 kelimede iki artikel farkı → yakın.
  const long = "I take the bus to the station and then I walk to work";
  assert.equal(check(long, "I take bus to station and then I walk to work", en())?.verdict, "yakin");
});

test("BU ADIMDA EKLENEN kelime düşerse yanlış (added)", () => {
  const r = check("I like to wake up early", "I like to wake up", en({ prev: "I like to wake up" }))!;
  assert.equal(r.verdict, "yanlis");
  assert.equal(r.reason, "added");
  assert.match(r.feedback, /Bu adımın parçası: early/);
  // Açıkça verilen eklenen parça da aynı işi görür.
  assert.equal(check("I like to wake up early", "I like to wake up", en({ added: ["early"] }))?.reason, "added");
  assert.deepEqual(addedTokens("I go to work", "I often go to work", "en"), ["often"]);
});

test("SIRA: zarf yanlış yerde → sıklık zarfı kuralı", () => {
  const r = check("I often go to work", "I go often to work", en())!;
  assert.equal(r.verdict, "yanlis");
  assert.equal(r.reason, "order");
  assert.equal(r.adverb, true);
  assert.match(r.feedback, /özneden hemen sonra/);
});

test("KALIP: 'in morning' bölünmüş kalıp — artikel olsa da yakın değil", () => {
  const r = check("I like to wake up early in the morning", "I like to wake up early in morning", en())!;
  assert.equal(r.verdict, "yanlis");
  assert.equal(r.reason, "chunk");
  assert.match(r.feedback, /in the morning/);
  assert.equal(check("I go to bed at 10 PM", "I go to the bed at 10 PM", en())?.reason, "chunk");
  // Bloktan gelen kalıp da tutulur.
  assert.equal(check("I watch the news", "I watch news", en({ chunks: ["watch the news"] }))?.reason, "chunk");
});

test("ZAMAN: alışkanlık setinde 'I am turning on' → geniş zaman notu", () => {
  const r = check("I turn on the TV", "I am turning on the TV", en({ tense: "habit" }))!;
  assert.equal(r.verdict, "yanlis");
  assert.equal(r.reason, "tense");
  assert.match(r.feedback, /alışkanlık → geniş zaman/);
});

test("sesteş: seste 'buy bus' = by bus; yazıda 'buy' yanlış", () => {
  const s = check("I go to work by bus", "I go to work buy bus", en({ spoken: true }))!;
  assert.equal(s.verdict, "dogru");
  assert.equal(s.reason, "homophone");
  const t = check("I go to work by bus", "I go to work buy bus", en())!;
  assert.equal(t.verdict, "yanlis");
  // Sesteş tuzak kelimeyi kurtarmaz.
  assert.equal(check("I go to work by bus", "I go to work with bus", en({ spoken: true }))?.reason, "trap");
});

test("n-best: yalnız artikel farkıyla daha iyi olan alternatif kazanır", () => {
  const r = check("I turn on the TV", ["I turn on TV", "I turn on the TV"], en({ spoken: true }))!;
  assert.equal(r.verdict, "dogru");
  assert.equal(r.heardIndex, 1);
  assert.equal(r.heard, "I turn on the TV");
});

test("n-best: tuzak kelimeyi düzelten alternatif KAZANMAZ", () => {
  const r = check("I go to work by metro", ["I go to work with metro", "I go to work by metro"], en({ spoken: true }))!;
  assert.equal(r.verdict, "yanlis");
  assert.equal(r.trapId, "en-with-by");
  assert.equal(r.heardIndex, 0);
  // Bu adımda eklenen kelimeyi getiren alternatif de kazanmaz.
  const a = check("I like to wake up early", ["I like to wake up", "I like to wake up early"], en({ spoken: true, prev: "I like to wake up" }))!;
  assert.equal(a.heardIndex, 0);
  assert.equal(a.reason, "added");
  // Çok farklı alternatif (6 kelimede 1'den fazla) kazanmaz.
  const far = check("I turn on the TV", ["I turn TV", "I turn on the TV"], en({ spoken: true }))!;
  assert.equal(far.heardIndex, 0);
});

test("prefer + to V: doğru, geri bildirimde videodaki biçim", () => {
  const r = check("I often prefer going to work by bus", "I often prefer to go to work by bus", en())!;
  assert.equal(r.verdict, "dogru");
  assert.equal(r.reason, "prefer");
  assert.equal(r.viaAlt, true);
  assert.match(r.feedback, /prefer going/);
  assert.match(r.feedback, /-ing/);
});

test("boş ya da yalnız noktalamalı cevap null — deneme sayılmaz", () => {
  assert.equal(check("I go", "", en()), null);
  assert.equal(check("I go", "   ", en()), null);
  assert.equal(check("I go", "...!?", en()), null);
  assert.equal(check("أَذْهَبُ", "،؟", ar()), null);
  assert.equal(check("I go", ["", " . "], en()), null);
});

test("eski adım alternatifleri kabul kümesinde kalır", () => {
  const r = checkAnswer("I take a shower", ["I have a shower"], "I have a shower", en())!;
  assert.equal(r.verdict, "dogru");
  assert.equal(r.reason, "alt");
  assert.match(r.feedback, /Kalıptaki: I take a shower/);
});

// --- Arapça ---------------------------------------------------------------------------

test("Arapça: harekesiz cevap doğru", () => {
  assert.equal(check("أُحِبُّ أَنْ أَسْتَيْقِظَ مُبَكِّرًا فِي الصَّبَاحِ", "احب ان استيقظ مبكرا في الصباح", ar())?.verdict, "dogru");
});

test("Arapça: 'بال مترو' = 'بِالمِتْرُو'", () => {
  assert.equal(check("أَذْهَبُ إِلَى العَمَلِ بِالمِتْرُو", "اذهب الى العمل بال مترو", ar())?.verdict, "dogru");
});

test("Arapça tuzak: araçta مَعَ → ar-maa-bi", () => {
  const r = check("أَذْهَبُ إِلَى العَمَلِ بِالمِتْرُو", "اذهب الى العمل مع المترو", ar())!;
  assert.equal(r.verdict, "yanlis");
  assert.equal(r.trapId, "ar-maa-bi");
  // Ses tanıma bitişik yazdıysa da aynı tuzak.
  assert.equal(check("أَذْهَبُ بِسَيَّارَةٍ", "اذهب مع سياره", ar())?.trapId, "ar-maa-bi");
});

test("Arapça tuzak: قبل'den sonra أَنْ unutuldu → ar-an", () => {
  const r = check("قَبْلَ أَنْ أَتَنَاوَلَ الفُطُورَ", "قبل اتناول الفطور", ar())!;
  assert.equal(r.trapId, "ar-an");
  assert.match(r.feedback, /أَنْ/);
  assert.doesNotMatch(r.feedback, /\bago\b.*before\b.*tuzağı var/);
  assert.equal(check("أُحِبُّ أَنْ أَسْتَيْقِظَ", "احب استيقظ", ar())?.trapId, "ar-an");
});

test("Arapça tuzak: خرجت البيت → ar-khuruj", () => {
  assert.equal(check("خَرَجْتُ مِنَ البَيْتِ", "خرجت البيت", ar())?.trapId, "ar-khuruj");
  assert.equal(check("أَخْرُجُ مِنَ البَيْتِ", "اخرج البيت", ar())?.trapId, "ar-khuruj");
});

test("Arapça tuzak: لكن + ayrı zamir → ar-lakin", () => {
  assert.equal(check("لَكِنَّنِي أُفَضِّلُ الذَّهَابَ", "لكن انا افضل الذهاب", ar())?.trapId, "ar-lakin");
});

test("Arapça tuzak: TV için أَفْتَحُ, 'sonra' için لَاحِقًا", () => {
  assert.equal(check("أُشَغِّلُ التِّلْفَازَ", "افتح التلفاز", ar())?.trapId, "ar-shaghghala");
  assert.equal(check("بَعْدَ أَنْ أُنَظِّفَ أَسْنَانِي", "لاحقا ان انظف اسناني", ar())?.trapId, "ar-lahiqan");
});

test("Arapça saat: 'الساعة ٧ مساء' doğru, 'الساعه سبعه' sıra sayısı tuzağı", () => {
  assert.equal(check("السَّاعَةَ السَّابِعَةَ مَسَاءً", "الساعة ٧ مساء", ar())?.verdict, "dogru");
  const r = check("أَخْرُجُ فِي السَّاعَةِ السَّابِعَةِ", "اخرج في الساعه سبعه", ar())!;
  assert.equal(r.verdict, "yanlis");
  assert.equal(r.trapId, "ar-ordinal");
});

test("Arapça gürültü: eksik ال ve gereksiz أنا yakın; مع yerine ب asla", () => {
  const al = check("أُحِبُّ القَهْوَةَ", "احب قهوه", ar())!;
  assert.equal(al.verdict, "yakin");
  assert.equal(al.reason, "noise");
  const ana = check("أَذْهَبُ إِلَى العَمَلِ", "انا اذهب الى العمل", ar())!;
  assert.equal(ana.verdict, "yakin");
  // Bitişik yazılmış ön ekte eksik ال de "ب eksik" sanılmaz.
  assert.equal(check("أَذْهَبُ إِلَى العَمَلِ بِالمِتْرُو", "اذهب الى العمل بمترو", ar())?.verdict, "yakin");
  // Ek karşılığı (إِلَى) eksikse yanlış.
  assert.equal(check("أَذْهَبُ إِلَى العَمَلِ", "اذهب العمل", ar())?.reason, "marker");
});

test("Arapça: İngilizce tuzak kimliği hiç çıkmaz", () => {
  const r = check("أَذْهَبُ إِلَى العَمَلِ بِالمِتْرُو", "اذهب الى العمل مع المترو", ar())!;
  assert.ok(!r.trapId?.startsWith("en-"));
});

// --- swap -----------------------------------------------------------------------------

test("have a shower bir adımda seçilince sonraki adımlarda ve sıralamada da kabul", () => {
  const final = "Before I have breakfast, I take a shower.";
  const swaps = deriveSwaps(final, { blocks: [{ target: "take a shower", alts: ["have a shower"] }] }, "en");
  assert.equal(swaps.length, 1);
  // Adım 2: öğrenci alternatifi kullandı.
  const s2 = checkAnswer(final, [], "Before I have breakfast, I have a shower", en({ swaps }))!;
  assert.equal(s2.verdict, "dogru");
  assert.equal(s2.viaAlt, true);
  assert.match(s2.feedback, /bu da olur/);
  const choices: Swap[] = s2.used;
  assert.equal(choices.length, 1);
  // Adım 3 (hemen vurgu eklendi): öğrencinin varyantı hem kabul hem gösterilen biçim.
  const t3 = "Before I have breakfast, I always take a shower.";
  const f3 = expandSwaps(t3, [], "en", choices);
  assert.equal(f3[0].text, "Before I have breakfast, I always have a shower.");
  assert.equal(checkAnswer(t3, [], "Before I have breakfast I always have a shower", en({ swaps, choices }))?.verdict, "dogru");
  // Kalıptaki asıl hâl de hâlâ doğru.
  assert.equal(checkAnswer(t3, [], "Before I have breakfast I always take a shower", en({ swaps, choices }))?.verdict, "dogru");
  // Adım 4: sıralama.
  const re = "I always take a shower before I have breakfast.";
  assert.equal(checkAnswer(re, [], "I always have a shower before I have breakfast", en({ swaps, choices }))?.verdict, "dogru");
});

test("üç swap birlikte: sometimes → from time to time, but → However, often → frequently", () => {
  const final = "I sometimes go to work by metro, but I often prefer going to work by bus.";
  const swaps = deriveSwaps(
    final,
    {
      blocks: [
        { target: "sometimes", alts: ["from time to time"] },
        { target: "often", alts: ["frequently"] },
      ],
      sw: [["but", "However,"]],
    },
    "en"
  );
  assert.equal(swaps.length, 3);
  const r = checkAnswer(final, [], "I from time to time go to work by metro. However, I frequently prefer going to work by bus", en({ swaps }))!;
  assert.equal(r.verdict, "dogru");
  assert.equal(r.used.length, 3);
});

test("swap sınırları: 32 biçim, cümle başına 3 swap, yan başına 6 token, kalıpta olmayan atılır", () => {
  const target = "a b c d e f g h i j";
  const many: Swap[] = "abcdefghij".split("").map((x) => ({ from: [x], to: [x + x] }));
  const forms = expandSwaps(target, many, "en");
  assert.ok(forms.length <= MAX_FORMS);
  assert.equal(forms.length, MAX_FORMS);
  assert.equal(new Set(forms.map((f) => f.tokens.join(" "))).size, forms.length);
  assert.ok(forms.every((f) => f.used.length <= 3));
  const d = deriveSwaps(
    "I often go to work by bus",
    {
      blocks: [
        { target: "often", alts: ["frequently"] },
        { target: "never here", alts: ["x"] }, // son hedefte yok
        { target: "go", alts: ["a b c d e f g"] }, // 6 tokendan uzun
      ],
      sw: [
        ["by bus", "on the bus"],
        ["work", "the office"],
        ["I", "we"],
      ],
    },
    "en"
  );
  assert.equal(d.length, 3);
  assert.deepEqual(d.map((s) => s.to.join(" ")), ["frequently", "on the bus", "the office"]);
});

test("swap etiketi, cinsiyet ve günlük dil yalnız istenince", () => {
  const t = "أُشَغِّلُ التِّلْفَازَ";
  assert.equal(deriveSwaps(t, {}, "ar").length, 0);
  const d = deriveSwaps(t, { dialect: true }, "ar");
  assert.equal(d[0]?.label, "günlük");
  assert.equal(checkAnswer(t, [], "افتح التلفاز", ar({ swaps: d }))?.verdict, "dogru");
  const g = deriveSwaps("أَنْتَ تَذْهَبُ", { gender: [["تَذْهَبُ", "تَذْهَبِينَ"]] }, "ar");
  assert.equal(g[0]?.label, "dişil");
  assert.deepEqual(spanSwap("I take a shower", "I have a shower", "en"), { from: ["take"], to: ["have"] });
  assert.equal(spanSwap("I go", "I go", "en"), null);
});

// --- gösterim yardımcıları -------------------------------------------------------------

test("diffAdded: araya giren 'often' tek başına vurgulanır ve 'araya girdi' işaretlenir", () => {
  const d = diffAdded("I go to work", "I often go to work", "en");
  assert.deepEqual(d.words.filter((w) => w.added).map((w) => w.text), ["often"]);
  assert.deepEqual(d.added, [1]);
  assert.equal(d.inserted, true);
  const tail = diffAdded("I sometimes go", "I sometimes go to work.", "en");
  assert.deepEqual(tail.words.filter((w) => w.added).map((w) => w.text), ["to", "work."]);
  assert.equal(tail.inserted, false);
});

test("diffAdded: yalnız harekesi değişen kelime eklenmiş sayılmaz", () => {
  const d = diffAdded("أذهب إلى العمل", "أَذْهَبُ إِلَى العَمَلِ", "ar");
  assert.equal(d.added.length, 0);
  const d2 = diffAdded("أَذْهَبُ إِلَى العَمَلِ", "أَذْهَبُ إِلَى العَمَلِ بِالمِتْرُو", "ar");
  assert.deepEqual(d2.words.filter((w) => w.added).map((w) => w.text), ["بِالمِتْرُو"]);
});

test("locateTrPiece: büyük/küçük harf, ek parçası ve ikinci 'işe'", () => {
  const s1 = "Sabahları erken uyanmayı seviyorum.";
  assert.deepEqual(locateTrPiece(s1, "sabahları"), [0, 9]);
  assert.deepEqual(locateTrPiece(s1, "Sabahları"), [0, 9]);
  const s2 = "Kahvaltı yapmadan önce duş alırım.";
  const span = locateTrPiece(s2, "‑madan önce")!;
  assert.equal(s2.slice(span[0], span[1]), "yapmadan önce");
  const direct = locateTrPiece(s2, "yapmadan önce")!;
  assert.equal(s2.slice(direct[0], direct[1]), "yapmadan önce");
  const s4 = "Bazen işe metroyla giderim ama sıklıkla işe otobüsle gitmeyi tercih ediyorum.";
  const first = locateTrPiece(s4, "işe")!;
  assert.equal(first[0], s4.indexOf("işe"));
  const second = locateTrPiece(s4, "işe", [first])!;
  assert.equal(second[0], s4.lastIndexOf("işe"));
  const la = locateTrPiece(s4, "-la")!;
  assert.equal(s4.slice(la[0], la[1]), "metroyla");
  assert.equal(locateTrPiece(s4, "yok"), null);
  assert.equal(locateTrPiece("İşe gittim", "işe")?.[0], 0); // Türkçe İ → i
});

test("bağlaç tablosundan hedefe göre kayıt: harekesiz de bulunur", () => {
  assert.equal(findConnector("ar", "قبل ان")?.trapId, "ar-an");
  assert.equal(findConnector("en", "Before")?.kind, "sub");
  assert.equal(findConnector("en", "because")?.kind, "causal");
  assert.equal(findConnector("en", "yok"), null);
});
