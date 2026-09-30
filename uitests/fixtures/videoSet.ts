/**
 * Videonun sekiz cümlesi (A2, İngilizce) — modelin plan ve cümle çıktısı
 * biçiminde. Ekran testleri ve önizleme, seti gerçek cihaz toparlamasından
 * (validatePlan + normalizeSentence) geçirerek kurar: test edilen kartlar,
 * üretim hattının ekrana vereceği kartların aynısıdır.
 */
import { normalizeSentence, placeholderSentence, validatePlan } from "../../src/sentencebuilding";
import type { BuildSentence, BuildSet, NormalizeStores } from "../../src/sentencebuilding";

export const EN_PLAN_RAW = {
  intro: "Günlük rutin",
  ozet: "Sabahtan geceye bir gün",
  tense: "habit",
  s: [
    { tr: "Sabahları erken uyanmayı seviyorum.", r: "open", new: ["like to", "wake up", "early", "in the morning"], focus: true, fn: true },
    { tr: "Kahvaltı yapmadan önce duş alırım.", r: "build", conn: { k: "sub", tr: "-madan önce", t: "before", p1: "kahvaltı yapmak", p2: "duş almak" }, new: ["before", "have breakfast", "take a shower"], focus: true },
    { tr: "Dişlerimi fırçaladıktan sonra evden çıkarım.", r: "build", conn: { k: "sub", tr: "-dıktan sonra", t: "after" }, new: ["after", "brush my teeth", "leave home"] },
    { tr: "Bazen işe metroyla giderim ama sıklıkla işe otobüsle gitmeyi tercih ediyorum.", r: "peak", conn: { k: "coord", tr: "ama", t: "but" }, new: ["sometimes", "go to work", "by metro", "but", "prefer going", "often"] },
    { tr: "Saat 7 gibi işten çıkıyorum.", r: "dip", new: ["at around 7 PM"], rec: ["leave"], sys: "clock12" },
    { tr: "Eve vardığımda televizyonu açıyorum.", r: "build", conn: { k: "sub", tr: "-dığımda", t: "when" }, new: ["when", "turn on the TV"] },
    { tr: "çünkü haber izlemeyi seviyorum", r: "extension", conn: { k: "causal", tr: "çünkü", t: "because" }, new: ["because", "like watching"] },
    { tr: "Saat 10 gibi yatağa girerim.", r: "synthesis", new: ["go to bed"], rec: ["at around"], focus: true },
  ],
};

export const EN_RAW: unknown[] = [
  {
    steps: [
      { q: "Kim seviyor?", p: "seviyorum", t: "I like" },
      { q: "Neyi seviyorum?", p: "uyanmayı", t: "I like to wake up", n: "-mayı ekini to ile veririz." },
      { q: "Nasıl uyanmayı seviyorum?", p: "erken", t: "I like to wake up early" },
      { q: "Ne zaman?", p: "Sabahları", t: "I like to wake up early in the morning.", n: "Kalıp: in the morning, hep böyle." },
    ],
    blocks: [
      { t: "to wake up", tr: "uyanmayı", k: "suffix", s: 1, n: "-mayı → to", a: ["waking up"] },
      { t: "early", tr: "erken", k: "adverb", s: 2, pair: { t: "late", tr: "geç" } },
      { t: "in the morning", tr: "sabahları", k: "chunk", s: 3, n: "kalıp", c: "on the morning değil" },
    ],
  },
  {
    steps: [
      { p: "yapmadan önce", t: "Before" },
      { q: "Kim kahvaltı yapacak?", p: "Kahvaltı", t: "Before I have breakfast", e: 1 },
      { q: "Ne yaparım?", p: "duş alırım", t: "Before I have breakfast, I take a shower." },
    ],
    blocks: [
      { t: "before", tr: "-madan önce", k: "connector", s: 0 },
      { t: "have breakfast", tr: "kahvaltı yapmak", k: "chunk", s: 1 },
      { t: "take a shower", tr: "duş almak", k: "chunk", s: 2, a: ["have a shower"] },
    ],
  },
  {
    steps: [
      { p: "fırçaladıktan sonra", t: "After" },
      { q: "Kim fırçalayacak?", p: "Dişlerimi", t: "After I brush my teeth", e: 1 },
      { q: "Ne yaparım?", p: "evden çıkarım", t: "After I brush my teeth, I leave home.", n: "çıkmak = ayrılmak → leave" },
    ],
    blocks: [
      { t: "after", tr: "-dıktan sonra", k: "connector", s: 0 },
      { t: "brush my teeth", tr: "dişlerimi fırçalamak", k: "chunk", s: 1 },
      { t: "leave home", tr: "evden çıkmak", k: "chunk", s: 2, x: { t: "I leave the hospital", tr: "Hastaneden çıkarım" } },
    ],
    reorder: "I leave home after I brush my teeth.",
  },
  {
    steps: [
      { q: "Kim, ne sıklıkla?", p: "Bazen … giderim", t: "I sometimes go" },
      { q: "Nereye?", p: "işe", t: "I sometimes go to work" },
      { q: "Nasıl?", p: "metroyla", t: "I sometimes go to work by metro", e: 1 },
      { p: "ama", t: "I sometimes go to work by metro, but" },
      { q: "Kim tercih ediyor?", p: "tercih ediyorum", t: "I sometimes go to work by metro, but I prefer" },
      { q: "Neyi?", p: "gitmeyi", t: "I sometimes go to work by metro, but I prefer going" },
      { q: "Nereye?", p: "işe", t: "I sometimes go to work by metro, but I prefer going to work" },
      { q: "Nasıl?", p: "otobüsle", t: "I sometimes go to work by metro, but I prefer going to work by bus" },
      { q: "Ne sıklıkla?", p: "sıklıkla", t: "I sometimes go to work by metro, but I often prefer going to work by bus." },
    ],
    blocks: [
      { t: "sometimes", tr: "bazen", k: "adverb", s: 0, a: ["from time to time"] },
      { t: "by metro", tr: "metroyla", k: "caseSplit", s: 2 },
      { t: "but", tr: "ama", k: "connector", s: 3 },
      { t: "prefer going", tr: "gitmeyi tercih etmek", k: "complement", s: 5 },
      { t: "often", tr: "sıklıkla", k: "adverb", s: 8, a: ["frequently"] },
    ],
    sw: [[", but", ". However,"]],
    reorder: "But I often prefer going to work by bus, I sometimes go to work by metro.",
  },
  {
    steps: [
      { q: "Kim çıkıyor?", p: "çıkıyorum", t: "I leave", n: "çıkmak = ayrılmak, terk etmek → leave" },
      { q: "Nereden?", p: "işten", t: "I leave work" },
      { q: "Ne zaman?", p: "Saat 7 gibi", t: "I leave work at around 7 PM.", n: "gibi = civarında → around" },
    ],
    blocks: [{ t: "at around 7 PM", tr: "saat 7 gibi", k: "rule", s: 2, a: ["at about 7 PM"] }],
  },
  {
    steps: [
      { p: "vardığımda", t: "When" },
      { q: "Kim varıyor?", p: "Eve", t: "When I arrive at home", e: 1 },
      { q: "Ne yaparım?", p: "televizyonu açıyorum", t: "When I arrive at home, I turn on the TV." },
    ],
    blocks: [
      { t: "when", tr: "-dığımda", k: "connector", s: 0 },
      { t: "turn on the TV", tr: "televizyonu açmak", k: "chunk", s: 2, pair: { t: "turn off the TV", tr: "televizyonu kapatmak" } },
    ],
    reorder: "I turn on the TV when I arrive at home.",
  },
  {
    steps: [
      { p: "çünkü", t: "because" },
      { q: "Kim seviyor?", p: "seviyorum", t: "because I like" },
      // Model önceki cümleyi yine de yazdı: cihaz öneki bir kez tutar.
      { q: "Neyi seviyorum?", p: "izlemeyi", t: "When I arrive at home, I turn on the TV because I like watching" },
      { q: "Neyi izlemeyi?", p: "haber", t: "because I like watching news." },
    ],
    blocks: [
      { t: "because", tr: "çünkü", k: "connector", s: 0 },
      { t: "like watching", tr: "izlemeyi sevmek", k: "complement", s: 2, a: ["like to watch"] },
    ],
    reorder: "Because I like watching news, when I arrive at home I turn on the TV.",
  },
  {
    steps: [
      { q: "Kim gider?", p: "girerim", t: "I go to bed" },
      { q: "Ne zaman?", p: "Saat 10 gibi", t: "I go to bed at around 10 PM." },
    ],
    blocks: [{ t: "go to bed", tr: "yatağa girmek", k: "chunk", s: 0 }],
  },
];

/**
 * Video seti. pendingFrom: bu sıradan itibaren cümleler "pending" (üretim
 * sürüyor). stores: bağlaç geçmişi gibi cihaz depoları.
 */
export function videoSet(
  opts: {
    id?: string;
    patternId?: string;
    themeId?: string;
    pendingFrom?: number;
    stores?: Partial<NormalizeStores>;
    level?: BuildSet["level"];
    /** Yalnız bu cümleler (sırasıyla) — uzun seti baştan yürümeden bir karta varmak için. */
    only?: number[];
  } = {}
): BuildSet {
  const level = opts.level ?? "A2";
  const plan = validatePlan(EN_PLAN_RAW, 8, { lang: "en", band: level }).plan;
  const stores: NormalizeStores = { band: level, ...(opts.stores ?? {}) };
  const built: BuildSentence[] = [];
  plan.sentences.forEach((sp, k) => {
    built.push(
      opts.pendingFrom !== undefined && k >= opts.pendingFrom ? placeholderSentence(sp) : normalizeSentence(EN_RAW[k], plan, k, built, "en", stores)
    );
  });
  const pick = opts.only;
  const sentences = pick ? pick.map((k) => built[k]) : built;
  const planOut = pick ? { ...plan, sentences: pick.map((k) => plan.sentences[k]) } : plan;
  return {
    v: 2,
    id: opts.id ?? "2026-09-29T00:00:00.000Z-set",
    patternId: opts.patternId ?? "olmak",
    themeId: opts.themeId ?? "rutin",
    lang: "en",
    level,
    tense: "habit",
    episode: 1,
    intro: plan.intro,
    plan: planOut,
    sentences,
    createdAt: "2026-09-29T00:00:00.000Z",
  };
}

/** Cümlenin tamamlanmış hâli (bekleyen cümleyi "hazır" yapmak için). */
export function readySentence(set: BuildSet, k: number): BuildSentence {
  return normalizeSentence(EN_RAW[k], set.plan, k, set.sentences.slice(0, k), "en", { band: set.level });
}
