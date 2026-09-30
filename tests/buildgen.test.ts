/**
 * Cümle kurma üretimi — PLAN ve CÜMLE promptları (tasarım §2.2–§2.3, §9).
 *
 * Promptun kendisi test edilir çünkü yöntemin çoğu orada: bir kural
 * sessizce düşerse (ör. "yüklemden başla") model yine geçerli JSON döner,
 * hiçbir şey patlamaz — yalnız öğretim bozulur. Eski promptun çelişkili
 * kuralları ("son 2 cümle yeni taş getirmesin", "blocks BAŞLAMADAN
 * görecek") geri gelmesin diye yokluk da denetlenir.
 *
 * Önbellek sözleşmesi: bir setin bütün cümle isteklerinde sistem promptu
 * bayt bayt aynı; değişen her şey kullanıcı mesajında.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSentencePrompt,
  moreTransferSystem,
  planCompact,
  probeSystem,
  sentencePlanSystem,
  sentencePlanUser,
  sentenceStepSystem,
  sentenceStepUser,
  stepRange,
} from "../src/prompts.ts";
import { patternById, placeholderSentence, THEMES, validatePlan } from "../src/sentencebuilding.ts";
import type { Band, BuildSet, Pattern, SetPlan } from "../src/sentencebuilding.ts";
import type { LanguageId } from "../src/languages.ts";

const zaman = patternById("zaman-baglac") as Pattern;
const rica = patternById("rica") as Pattern;
const sevmek = patternById("sevmek") as Pattern;
const rutin = THEMES[0];

function planInput(lang: LanguageId, over: Partial<Parameters<typeof sentencePlanSystem>[0]> = {}) {
  return { lang, name: "Mehmet", band: "A2" as Band, focus: [zaman], theme: rutin, n: 8, ...over };
}

/** Videonun A2 setine benzeyen 8 cümlelik plan (cihazda doğrulanmış). */
function samplePlan(lang: LanguageId): SetPlan {
  const conn = (k: string, tr: string, t: string) => ({ k, tr, t });
  const raw = {
    intro: "Günlük rutinimi anlatıyorum.",
    ozet: "Sabahtan akşama bir gün.",
    s: [
      { tr: "Sabahları erken uyanmayı seviyorum.", r: "open", new: ["like to", "early", "in the morning"], focus: false },
      { tr: "Kahvaltı yapmadan önce duş alırım.", r: "build", conn: conn("sub", "-madan önce", lang === "ar" ? "قَبْلَ أَنْ" : "before"), new: ["take a shower"], focus: true, fn: true },
      { tr: "Duş aldıktan sonra kahvaltı yaparım.", r: "build", conn: conn("sub", "-dıktan sonra", lang === "ar" ? "بَعْدَ أَنْ" : "after"), new: ["have breakfast"], focus: true },
      { tr: "Bazen işe metroyla giderim ama otobüsle gitmeyi tercih ederim.", r: "peak", conn: conn("coord", "ama", lang === "ar" ? "لَكِنْ" : "but"), new: ["sometimes", "by metro", "prefer"] },
      { tr: "Akşam 7 gibi evden çıkarım.", r: "dip", new: ["leave home", "at around 7 PM"], rec: ["early"], sys: lang === "ar" ? "saat-sira" : "clock12" },
      { tr: "Eve vardığımda televizyonu açarım.", r: "build", conn: conn("sub", "-dığımda", lang === "ar" ? "عِنْدَمَا" : "when"), new: ["turn on the TV"], focus: true },
      { tr: "Çünkü haber izlemeyi seviyorum.", r: "extension", conn: conn("causal", "çünkü", lang === "ar" ? "لِأَنَّ" : "because"), new: ["watch the news"], rec: ["like to"] },
      { tr: "Yatmadan önce kitap okurum.", r: "synthesis", new: ["go to bed"], rec: ["before"], focus: true },
    ],
  };
  return validatePlan(raw, 8, { lang, band: "A2" }).plan;
}

function sampleSet(lang: LanguageId): BuildSet {
  const plan = samplePlan(lang);
  return {
    v: 2,
    id: "s1",
    patternId: zaman.id,
    themeId: rutin.id,
    lang,
    level: "A2",
    tense: plan.tense,
    episode: 1,
    intro: plan.intro,
    plan,
    sentences: plan.sentences.map((sp) => placeholderSentence(sp)),
    createdAt: "2026-09-30T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// PLAN
// ---------------------------------------------------------------------------

for (const lang of ["en", "ar"] as LanguageId[]) {
  test(`PLAN (${lang}): tek bağlaç, roller, odak kuralı çelişkisiz`, () => {
    const p = sentencePlanSystem(planInput(lang, { recycle: ["by bus", "leave home"] }));
    assert.match(p, /EN FAZLA BİR bağlaç/);
    assert.match(p, /8 CÜMLE, bu ROLLERLE ve bu sırayla:/);
    for (const line of ["1. açılış:", "4. zirve:", "5. çukur:", "7. uzatma:", "8. sentez:"]) assert.ok(p.includes(line), line);
    assert.match(p, /ÖĞRENİLMİŞ TAŞLAR \(2-4 tanesini YENİ bir dolguyla geri getir; yeniden öğretme\): by bus · leave home/);
    // Kural 5: odak kalıp bir kez new, sonra rec — "en az iki cümlede new" gibi çelişki yok.
    assert.match(p, /bir cümlede new olarak girer \(yalnız bir kez\); sonra en az 2 cümlede \(sentez dahil\) rec olarak/);
    assert.doesNotMatch(p, /new\s*≥\s*2|en az (iki|2) cümlede new/);
    assert.match(p, /Boş alanı HİÇ yazma/);
    assert.match(p, /Yalnız JSON döndür\.$/);
  });
}

test("PLAN: öğrenilmiş taş yoksa satır da yok; bölüm 1'de devam satırı yok", () => {
  const p = sentencePlanSystem(planInput("en"));
  assert.doesNotMatch(p, /ÖĞRENİLMİŞ TAŞLAR \(/);
  assert.doesNotMatch(p, /BÖLÜM \d/);
  assert.doesNotMatch(p, /KARMA SET|YERLEŞİM:/);
  // Koşulu tutmayan satırlar boş satır bırakmaz.
  assert.doesNotMatch(p, /\n\n\n/);
});

test("PLAN: devam bölümü özet ve son 20 Türkçe cümleyi taşır", () => {
  const lastTr = Array.from({ length: 25 }, (_, i) => `Cümle ${i}.`);
  const p = sentencePlanSystem(planInput("en", { episode: 3, ozet: "Sabah rutini bitti.", lastTr }));
  assert.match(p, /BÖLÜM 3\. Önceki bölümün özeti: Sabah rutini bitti\./);
  assert.ok(p.includes("- Cümle 24."));
  assert.ok(p.includes("- Cümle 5."));
  assert.ok(!p.includes("- Cümle 4."), "yalnız son 20");
});

test("PLAN: sistem dersleri dile göre; Arapçada İngilizce ders yok", () => {
  const en = sentencePlanSystem(planInput("en"));
  const ar = sentencePlanSystem(planInput("ar"));
  assert.match(en, /yalnız şu kimliklerden: clock12\./);
  assert.match(ar, /yalnız şu kimliklerden: saat-sira, ikil/);
  assert.doesNotMatch(ar, /clock12/);
  assert.match(ar, /Arapça öğreten/);
});

test("PLAN: karma ve diyalog yerleşimi satırları", () => {
  const p = sentencePlanSystem(planInput("en", { focus: [rica, sevmek] }));
  assert.match(p, /KARMA SET/);
  assert.match(p, /YERLEŞİM: odak kalıp/);
  assert.ok(p.includes(`tetikleyici "${rica.trigger}"`));
  assert.ok(p.includes(`tetikleyici "${sevmek.trigger}"`));
});

test("PLAN: 6 cümlelik sette roller ve bağlaç dizisi", () => {
  const p = sentencePlanSystem(planInput("en", { band: "A1", n: 6, focus: [sevmek] }));
  assert.match(p, /6 CÜMLE, bu ROLLERLE/);
  assert.ok(p.includes("6. sentez:"));
  assert.ok(p.includes("4. çukur:"));
  assert.ok(p.includes("5. uzatma:"));
});

test("PLAN kullanıcı mesajı: yeniden denemede KISA DÜŞÜN, tekrar listesi", () => {
  assert.doesNotMatch(sentencePlanUser(), /KISA DÜŞÜN/);
  const u = sentencePlanUser({ short: true, avoidTr: ["Erken uyanırım."] });
  assert.match(u, /KISA DÜŞÜN/);
  assert.match(u, /- Erken uyanırım\./);
});

// ---------------------------------------------------------------------------
// CÜMLE
// ---------------------------------------------------------------------------

for (const lang of ["en", "ar"] as LanguageId[]) {
  test(`CÜMLE (${lang}): yöntemin kuralları var, eski çelişkiler yok`, () => {
    const s = sentenceStepSystem({ lang, band: "A2", plan: samplePlan(lang) });
    for (const need of ["PARAFRAZ", "KALIP tek adımda", "YUVA SIRASIYLA", "NOT KURALI", "Boş alanı HİÇ yazma", "BAĞLAÇLA BAŞLA", "reorder YAZMA", "PLAN:"]) {
      assert.ok(s.includes(need), need);
    }
    for (const bad of ["yeni taş getirmesin", "BAŞLAMADAN görecek", "bir öncekini İÇERSİN"]) {
      assert.ok(!s.includes(bad), bad);
    }
  });
}

test("CÜMLE: dil bloğu yalnız aktif dilin; Arapçada İngilizce tuzak yok", () => {
  const ar = sentenceStepSystem({ lang: "ar", band: "A2", plan: samplePlan("ar") });
  const en = sentenceStepSystem({ lang: "en", band: "A2", plan: samplePlan("en") });
  assert.ok(ar.includes("أَنْ"));
  assert.ok(ar.includes("DİL: Arapça"));
  assert.ok(!ar.includes("DİL: İngilizce"));
  // Plan örnek verisi hariç (o, modelin yazdığı içerik): kurallar ve dil bloğu.
  assert.doesNotMatch(ar.slice(0, ar.indexOf("PLAN:")), /\bago\b|AM\/PM|turn on/);
  assert.ok(en.includes("DİL: İngilizce"));
  assert.ok(!en.includes("DİL: Arapça"));
});

test("İngilizce olmayan dilde örnek uyarısı: plan ve cümle promptunda var, İngilizcede yok", () => {
  // Kurallardaki örnekler (by bus, ", but" → ". However,") İngilizce; Arapça
  // sette model bunları kalıp sanıp İngilizce taş yazmasın.
  const note = /ÖRNEKLER: kurallardaki İngilizce örnekler yalnız YÖNTEMİ gösterir/;
  assert.match(sentencePlanSystem(planInput("ar")), note);
  assert.match(sentenceStepSystem({ lang: "ar", band: "A2", plan: samplePlan("ar") }), note);
  assert.doesNotMatch(sentencePlanSystem(planInput("en")), note);
  assert.doesNotMatch(sentenceStepSystem({ lang: "en", band: "A2", plan: samplePlan("en") }), note);
});

test("CÜMLE: okunuş kuralı yazıya göre, adım aralığı banda göre", () => {
  const ar = sentenceStepSystem({ lang: "ar", band: "A2", plan: samplePlan("ar") });
  const en = sentenceStepSystem({ lang: "en", band: "A2", plan: samplePlan("en") });
  assert.match(ar, /tw: son hâlin kelime kelime Türkçe okunuşu/);
  assert.match(en, /tw, tx, rtl YAZMA\./);
  assert.equal(stepRange("A1"), "2-6; zirve 8'e kadar");
  assert.equal(stepRange("B1"), "2-5; zirve 7");
  assert.equal(stepRange("C2"), "2-4");
  assert.match(en, /Adım sayısı: 2-6; zirve 8'e kadar\./);
});

test("CÜMLE: C1+ üslup etiketi ve video sırası yalnız istenince", () => {
  const plan = samplePlan("en");
  const a2 = sentenceStepSystem({ lang: "en", band: "A2", plan });
  const c1 = sentenceStepSystem({ lang: "en", band: "C1", plan });
  assert.ok(!a2.includes("üslup etiketi"));
  assert.ok(c1.includes("üslup etiketi: [biçim, resmî|günlük|edebî]"));
  assert.ok(!a2.includes("VİDEO SIRASI"));
  assert.ok(sentenceStepSystem({ lang: "en", band: "A2", plan, videoOrder: true }).includes("VİDEO SIRASI"));
});

test("CÜMLE: plan sıkıştırılmış gider — boş alan yok", () => {
  const c = planCompact(samplePlan("en")) as { s: Record<string, unknown>[] };
  assert.equal(c.s.length, 8);
  assert.equal(c.s[0].conn, undefined);
  assert.equal(c.s[0].rec, undefined);
  assert.equal(c.s[0].focus, undefined);
  assert.deepEqual(c.s[1].conn, { k: "sub", tr: "-madan önce", t: "before" });
  assert.equal(c.s[1].fn, true);
  assert.equal(c.s[4].sys, "clock12");
});

for (const lang of ["en", "ar"] as LanguageId[]) {
  test(`CÜMLE (${lang}): sistem promptu setin bütün cümlelerinde bayt bayt aynı`, () => {
    const set = sampleSet(lang);
    const systems = new Set<string>();
    const users = new Set<string>();
    for (let k = 0; k < set.plan.sentences.length; k += 1) {
      for (const short of [false, true]) {
        // Önceki cümleler "hazır" olunca da sistem değişmez.
        if (k > 0) set.sentences[k - 1] = { ...set.sentences[k - 1], status: "ready", target: `T${k - 1}` };
        const p = buildSentencePrompt(set, k, { short, contrastShown: k > 2 ? ["before"] : [], carry: k === 3 ? ["x"] : [] });
        systems.add(p.system);
        users.add(p.userMessage);
      }
    }
    assert.equal(systems.size, 1);
    assert.equal(users.size, 16, "değişen her şey kullanıcı mesajında");
  });
}

test("CÜMLE: sistem promptu karakter bütçesinde (8 cümlelik plan dahil)", () => {
  for (const lang of ["en", "ar"] as LanguageId[]) {
    const plan = samplePlan(lang);
    const full = sentenceStepSystem({ lang, band: "A2", plan });
    const rules = full.slice(0, full.indexOf("PLAN:"));
    assert.ok(rules.length <= 6000, `${lang} kurallar ${rules.length}`);
    assert.ok(full.length <= 8000, `${lang} tam ${full.length}`);
  }
  const plan = sentencePlanSystem(planInput("ar", { recycle: ["a", "b"], known: ["x"] }));
  assert.ok(plan.length <= 4500, `plan ${plan.length}`);
});

test("CÜMLE kullanıcı mesajı: rol, bağlaç, önceki hedefler, KISA MOD, sistem dersi", () => {
  const set = sampleSet("en");
  set.sentences[0] = { ...set.sentences[0], status: "ready", target: "I like to wake up early in the morning." };
  set.sentences[1] = { ...set.sentences[1], status: "failed" };
  const u = sentenceStepUser({
    k: 4,
    plan: set.plan,
    builtTargets: set.sentences.slice(0, 4).map((s) => (s.status === "ready" ? s.target : "")),
    contrastShown: ["before", "by"],
    short: true,
  });
  assert.match(u, /^Cümle 5\/8 — rol: dip\n/);
  assert.match(u, /Türkçe: "Akşam 7 gibi evden çıkarım\."/);
  assert.match(u, /Yeni taşlar: leave home · at around 7 PM/);
  assert.match(u, /Geri gelen \(Bunu öğrendik — yeniden öğretme\): early/);
  assert.match(u, /1\) I like to wake up early in the morning\.\n2\) —/);
  assert.match(u, /Karşıtlığı verilmiş: before, by/);
  assert.match(u, /Sistem dersi \(clock12\) bu cümlede; sd alanına/);
  assert.match(u, /KISA MOD\.$/);
  const b = sentenceStepUser({ k: 1, plan: set.plan, builtTargets: ["x"] });
  assert.match(b, /bağlaç: sub \(-madan önce → before\)/);
  assert.doesNotMatch(b, /KISA MOD/);
  assert.doesNotMatch(b, /Sistem dersi/);
});

test("CÜMLE kullanıcı mesajı: taşınan taş geri gelenden çıkıp yeni olur", () => {
  const set = sampleSet("en");
  const u = sentenceStepUser({ k: 4, plan: set.plan, builtTargets: [], carry: ["early", "take a shower"] });
  assert.match(u, /Yeni taşlar: leave home · at around 7 PM · early · take a shower/);
  assert.match(u, /Geri gelen \(Bunu öğrendik — yeniden öğretme\): —/);
});

// ---------------------------------------------------------------------------
// Yoklama ve "Başka örnek"
// ---------------------------------------------------------------------------

test("Yoklama: kalıp kimlikleri, en fazla 8 kalıp, dil bloğu", () => {
  const pats = ["olmak", "var-yok", "sahip", "genis-zaman", "belirtme", "yon-yer", "vasita", "iyelik", "siklik"].map((id) => patternById(id) as Pattern);
  const p = probeSystem({ lang: "ar", band: "A2", patterns: pats, perPattern: 3 });
  assert.ok(p.includes("- olmak —"));
  assert.ok(p.includes("- iyelik —"));
  assert.ok(!p.includes("- siklik —"), "en fazla 8 kalıp");
  assert.match(p, /Her kalıp için 3 kısa/);
  assert.match(p, /TEK SEFERDE/);
  assert.ok(p.includes("DİL: Arapça"));
  assert.match(probeSystem({ lang: "en", band: "A1", patterns: pats.slice(0, 1), perPattern: 9 }), /Her kalıp için 4 kısa/);
});

test("Başka örnek: taş, yeni dolgu, tekrar edilmeyecekler", () => {
  const p = moreTransferSystem({ lang: "en", band: "A2", block: { target: "leave home", tr: "evden çıkmak" }, avoid: ["I leave work."] });
  assert.match(p, /"leave home" \(evden çıkmak\)/);
  assert.match(p, /3 kısa cümle/);
  assert.match(p, /Şunları TEKRARLAMA: I leave work\./);
  const ar = moreTransferSystem({ lang: "ar", band: "A1", block: { target: "خَرَجَ مِنْ", tr: "-den çıkmak" } });
  assert.match(ar, /TAM harekeli/);
  assert.doesNotMatch(ar, /TEKRARLAMA/);
});
