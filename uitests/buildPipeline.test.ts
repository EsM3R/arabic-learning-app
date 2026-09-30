/**
 * Cümle kurma üretim hattı — sağlayıcı taklitli (tasarım §2.1, §9).
 *
 * Ölçülen: plan + cümle cümle üretimin HATALI cevaplarda ne yaptığı. Gerçek
 * modeller cevabı yarıda keser, eksik adım yazar, ağ kopar; bunların her biri
 * ya öğrenciyi "Set hazırlanamadı" ile bırakır ya da parası ödenmiş bir seti
 * çöpe atar. Hat ikisini de yapmamalı: kesilen cümle KISA MOD'da bir kez
 * denenir, yine olmazsa set onsuz sürer; ağ koparsa cümle bekler ve ekran
 * açılınca kaldığı yerden devam eder.
 */
import { isBudgetError } from "../src/budget";
import {
  generateMoreTransfer,
  generateProbe,
  MIN_SET_SIZE,
  MORE_TRANSFER_SCHEMA,
  PLAN_SCHEMA,
  PLAN_SCHEMA_HINT,
  PROBE_SCHEMA,
  PROBE_SCHEMA_HINT,
  SENTENCE_SCHEMA,
  SENTENCE_SCHEMA_HINT,
} from "../src/claude";
import { deepseekProvider, structuredSystem } from "../src/providers/deepseek";
import { carriedNew, continueSet, resumePending, setBand, startSet, whenIdle } from "../src/buildpipeline";
import { setActiveLanguage } from "../src/languages";
import { TRUNCATED_TEXT } from "../src/providers/types";
import { patternById, placeholderSentence, THEMES, validatePlan } from "../src/sentencebuilding";
import type { BuildSet } from "../src/sentencebuilding";
import type { Pattern } from "../src/sentencebuilding";
import { loadBuildHistory, loadBuildSets2 } from "../src/storage";
import { recordUsage } from "../src/usage";
import type { Profile } from "../src/types";

interface Req {
  system: string;
  userMessage: string;
  schema: unknown;
  schemaHint?: string;
}

const mockStructured = jest.fn();
jest.mock("../src/providers", () => {
  const actual = jest.requireActual("../src/providers");
  const fake = {
    meta: { id: "anthropic", label: "A", keyPrefix: "sk-ant-", defaultModel: "m", models: ["m"], keyHint: "", costNote: "" },
    chat: jest.fn(),
    structured: (...a: unknown[]) => mockStructured(...a),
  };
  return {
    ...actual,
    PROVIDERS: { anthropic: fake },
    PROVIDER_LIST: [fake],
    activeSetup: () => ({ provider: fake, model: "m", apiKey: "sk-ant-x" }),
  };
});

/** DeepSeek'in OpenAI uyumlu istemcisi: gönderilen mesajları yakalar. */
const mockCreate = jest.fn();
jest.mock("openai", () => ({
  __esModule: true,
  default: function MockOpenAI() {
    return { chat: { completions: { create: (...a: unknown[]) => mockCreate(...a) } } };
  },
}));

function profile(level = "A1", over: Record<string, unknown> = {}): Profile {
  return {
    name: "Mehmet",
    apiKey: "sk-ant-x",
    provider: "anthropic",
    apiKeys: { anthropic: "sk-ant-x" },
    completedModuleIds: [],
    assessment: { speakingLevel: level, readingLevel: level, strengths: [], weaknesses: [], summary: "" },
    ...over,
  } as unknown as Profile;
}

const olmak = patternById("olmak") as Pattern;
const rutin = THEMES[0];

/** 6 cümlelik plan (A1; "olmak" A1 kalıbı, öğrenci A1 → set 6 cümle). Çukur "early"yi geri getirir: taşınma testi için. */
const PLAN6 = {
  intro: "Günlük rutinim.",
  ozet: "Sabahtan akşama.",
  s: [
    { tr: "Sabahları erken uyanırım.", r: "open", new: ["early"] },
    { tr: "Kahvaltı yapmadan önce duş alırım.", r: "build", conn: { k: "sub", tr: "-madan önce", t: "before" }, new: ["take a shower"], focus: true, fn: true },
    { tr: "İşe giderim ama otobüsle gitmem.", r: "peak", conn: { k: "coord", tr: "ama", t: "but" }, new: ["by bus"], focus: true },
    { tr: "Öğlen yemek yerim.", r: "dip", new: ["have lunch"], rec: ["early"] },
    { tr: "Çünkü acıkırım.", r: "extension", conn: { k: "causal", tr: "çünkü", t: "because" }, new: ["get hungry"] },
    { tr: "Akşam erken yatarım.", r: "synthesis", new: [], rec: ["early"], focus: true },
  ],
};

function plan(n: number) {
  const base = PLAN6.s;
  const s = Array.from({ length: n }, (_, i) => (i < 5 ? base[i] : i === n - 1 ? base[5] : { tr: `Ara cümle ${i}.`, r: "build", new: [`piece ${i}`] }));
  if (n > 6) s[n - 2] = base[4];
  return { ...PLAN6, s };
}

const good = (k: number) => ({
  steps: [
    { q: "", p: "yaparım", t: `I do ${k}` },
    { q: "Ne?", p: "şunu", t: `I do ${k} it` },
  ],
});

type Handler = (k: number, short: boolean, req: Req) => unknown;

/** Plan ve cümle isteklerini ayırıp yönlendirir; eşzamanlı istek sayısını ölçer. */
let inFlight = 0;
let maxInFlight = 0;
function route(planFn: (req: Req, call: number) => unknown, sentFn: Handler = (k) => good(k)) {
  let planCalls = 0;
  mockStructured.mockImplementation(async (req: Req) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((r) => setTimeout(r, 1));
      const m = req.userMessage.match(/^Cümle (\d+)\/(\d+)/);
      if (!m) {
        planCalls += 1;
        const out = planFn(req, planCalls);
        if (out instanceof Error) throw out;
        return out;
      }
      const out = sentFn(Number(m[1]) - 1, req.userMessage.includes("KISA MOD."), req);
      if (out instanceof Error) throw out;
      return out;
    } finally {
      inFlight -= 1;
    }
  });
}

const calls = () => mockStructured.mock.calls.map((c) => c[0] as Req);
const sentenceCalls = () => calls().filter((r) => /^Cümle \d/.test(r.userMessage));
const planCalls = () => calls().filter((r) => !/^Cümle \d/.test(r.userMessage));

async function startAndFinish(p = profile(), focus = [olmak], confirm?: () => boolean) {
  const set = await startSet({ profile: p, focus, theme: rutin, confirm });
  if (!set) return null;
  await whenIdle(set.id);
  return (await loadBuildSets2()).find((s) => s.id === set.id) ?? null;
}

beforeEach(async () => {
  mockStructured.mockReset();
  mockCreate.mockReset();
  inFlight = 0;
  maxInFlight = 0;
  setActiveLanguage("en");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
});

test("plan + 1. cümle hazır olunca döner; gerisi arka planda, tek istek hâlinde", async () => {
  route(() => PLAN6);
  const confirm = jest.fn(() => true);
  const first = await startSet({ profile: profile(), focus: [olmak], theme: rutin, confirm });
  expect(first).not.toBeNull();
  expect(first!.sentences[0].status).toBe("ready");
  expect(first!.plan.sentences).toHaveLength(6);
  await whenIdle(first!.id);
  const saved = (await loadBuildSets2()).find((s) => s.id === first!.id)!;
  expect(saved.sentences.map((s) => s.status)).toEqual(Array(6).fill("ready"));
  // Tek bütçe onayı, set başına bir kez; metin istek sayısını söyler.
  expect(confirm).toHaveBeenCalledTimes(1);
  expect((confirm.mock.calls[0] as unknown[])[0]).toMatch(/1 plan \+ 6 cümle/);
  expect(planCalls()).toHaveLength(1);
  expect(sentenceCalls()).toHaveLength(6);
  expect(maxInFlight).toBe(1);
  // Önbellek sözleşmesi: bütün cümle isteklerinde sistem bayt bayt aynı.
  expect(new Set(sentenceCalls().map((r) => r.system)).size).toBe(1);
  // Bağlantılı (çünkü) cümle önceki cümleyi 0. adım olarak taşır.
  expect(saved.sentences[4].linkPrev).toBe(true);
  expect(saved.sentences[4].steps[0].move).toBe("linked");
});

test("şema ipucu her istekte gider", async () => {
  route(() => PLAN6);
  await startAndFinish();
  expect(planCalls()[0].schemaHint).toBe(PLAN_SCHEMA_HINT);
  expect(planCalls()[0].schema).toBe(PLAN_SCHEMA);
  for (const r of sentenceCalls()) expect(r.schemaHint).toBe(SENTENCE_SCHEMA_HINT);
});

test("3. cümle kesilirse YALNIZ o cümle KISA MOD'da bir kez daha istenir", async () => {
  let cut = true;
  route(
    () => PLAN6,
    (k, short) => {
      if (k === 2 && !short && cut) {
        cut = false;
        return new Error(TRUNCATED_TEXT);
      }
      return good(k);
    }
  );
  const set = await startAndFinish();
  const shorts = sentenceCalls().filter((r) => r.userMessage.includes("KISA MOD."));
  expect(shorts).toHaveLength(1);
  expect(shorts[0].userMessage).toMatch(/^Cümle 3\/6/);
  expect(set!.sentences.every((s) => s.status === "ready")).toBe(true);
  expect(sentenceCalls()).toHaveLength(7);
  // KISA MOD sistem promptunu değiştirmez (önbellek bozulmaz).
  expect(new Set(sentenceCalls().map((r) => r.system)).size).toBe(1);
});

test("ikinci başarısızlık: cümle 'failed', set devam eder, yeni taşı sonrakine taşınır", async () => {
  route(
    () => PLAN6,
    (k) => (k === 2 ? new Error(TRUNCATED_TEXT) : good(k))
  );
  const set = await startAndFinish();
  expect(set!.sentences.map((s) => s.status)).toEqual(["ready", "ready", "failed", "ready", "ready", "ready"]);
  // "by bus" hiç öğretilmedi: bir sonraki cümlenin yeni taşlarına geçer.
  const next = sentenceCalls().find((r) => r.userMessage.startsWith("Cümle 4/6"))!;
  expect(next.userMessage).toMatch(/Yeni taşlar: have lunch · by bus/);
  expect(sentenceCalls().filter((r) => r.userMessage.startsWith("Cümle 3/6"))).toHaveLength(2);
});

test("2'den az adım da başarısızlık sayılır; geri getirilen taş orada yeniden öğretilir", async () => {
  route(
    () => PLAN6,
    (k) => (k === 0 ? { steps: [{ q: "", p: "uyanırım", t: "I wake up" }] } : good(k))
  );
  const first = await startSet({ profile: profile(), focus: [olmak], theme: rutin });
  // İlk cümle olmadı; öğrenci ilk HAZIR cümleyle başlar.
  expect(first!.sentences[0].status).toBe("failed");
  expect(first!.sentences[1].status).toBe("ready");
  await whenIdle(first!.id);
  const dip = sentenceCalls().find((r) => r.userMessage.startsWith("Cümle 4/6"))!;
  // "early" planda çukurda geri geliyordu; hiç öğretilmediği için orada YENİ.
  expect(dip.userMessage).toMatch(/Yeni taşlar: have lunch · early/);
  expect(dip.userMessage).toMatch(/Geri gelen \(Bunu öğrendik — yeniden öğretme\): —/);
});

test("sentez üretilemezse son iki hazır cümlenin yeniden anlatımı yerini alır", async () => {
  route(
    () => PLAN6,
    (k) => (k === 5 ? new Error(TRUNCATED_TEXT) : good(k))
  );
  const set = await startAndFinish();
  const syn = set!.sentences[5];
  expect(syn.status).toBe("failed");
  expect(syn.role).toBe("synthesis");
  expect(syn.retellOf).toEqual([3, 4]);
});

test("sentezden önceki cümle düşerse yeni taşı sentezin lambasına geçer (sınır 2)", async () => {
  route(
    () => PLAN6,
    (k) => (k === 4 ? new Error(TRUNCATED_TEXT) : good(k))
  );
  const set = await startAndFinish();
  expect(set!.sentences.map((s) => s.status)).toEqual(["ready", "ready", "ready", "ready", "failed", "ready"]);
  const syn = sentenceCalls().find((r) => r.userMessage.startsWith("Cümle 6/6"))!;
  expect(syn.userMessage).toMatch(/Yeni taşlar: get hungry/);
});

test("plan kesilirse AYNI n ile KISA DÜŞÜN; ikinci başarısızlıkta n-1 (en az 6)", async () => {
  route((req, call) => (call <= 2 ? new Error(TRUNCATED_TEXT) : plan(7)));
  const set = await startAndFinish(profile("A2"));
  const ps = planCalls();
  expect(ps).toHaveLength(3);
  expect(ps[0].system).toMatch(/\n8 CÜMLE, bu ROLLERLE/);
  expect(ps[0].userMessage).not.toMatch(/KISA DÜŞÜN/);
  expect(ps[1].system).toMatch(/\n8 CÜMLE, bu ROLLERLE/);
  expect(ps[1].userMessage).toMatch(/KISA DÜŞÜN/);
  expect(ps[2].system).toMatch(/\n7 CÜMLE, bu ROLLERLE/);
  expect(set!.sentences).toHaveLength(7);
  // Roller konumdan yeniden hesaplanır: uzatma ve sentez her zaman var.
  expect(set!.plan.sentences.map((s) => s.role).slice(-2)).toEqual(["extension", "synthesis"]);
});

test("6'lık sette n-1 yine 6; eksik plan da başarısızlık sayılır", async () => {
  route((req, call) => (call === 1 ? { intro: "x", s: PLAN6.s.slice(0, 3) } : call === 2 ? new Error(TRUNCATED_TEXT) : PLAN6));
  const set = await startAndFinish();
  const ps = planCalls();
  expect(ps).toHaveLength(3);
  expect(ps.every((r) => /\n6 CÜMLE, bu ROLLERLE/.test(r.system))).toBe(true);
  expect(set!.sentences).toHaveLength(MIN_SET_SIZE);
});

test("plan üç kez olmazsa anlaşılır hata; sonsuz denemez, set kaydedilmez", async () => {
  route(() => new Error(TRUNCATED_TEXT));
  await expect(startSet({ profile: profile(), focus: [olmak], theme: rutin })).rejects.toThrow(/üç denemede/);
  expect(planCalls()).toHaveLength(3);
  expect(await loadBuildSets2()).toHaveLength(0);
});

test("ağ koparsa cümleler bekler; açılışta onay sorulmadan kaldığı yerden sürer", async () => {
  let down = true;
  route(
    () => PLAN6,
    (k) => (k === 2 && down ? new Error("Ağ koptu") : good(k))
  );
  const confirm = jest.fn(() => true);
  const onError = jest.fn();
  const first = await startSet({ profile: profile(), focus: [olmak], theme: rutin, confirm, hooks: { onError } });
  const res = await whenIdle(first!.id);
  expect(res?.error).toBeInstanceOf(Error);
  expect(onError).toHaveBeenCalledTimes(1);
  let saved = (await loadBuildSets2()).find((s) => s.id === first!.id)!;
  expect(saved.sentences.map((s) => s.status)).toEqual(["ready", "ready", "pending", "pending", "pending", "pending"]);
  // Ağ hatası KISA MOD'a değmez: 3. cümle bir kez istendi.
  expect(sentenceCalls().filter((r) => r.userMessage.startsWith("Cümle 3/6"))).toHaveLength(1);

  down = false;
  const again = await resumePending(profile());
  expect(again?.error).toBeUndefined();
  saved = (await loadBuildSets2()).find((s) => s.id === first!.id)!;
  expect(saved.sentences.every((s) => s.status === "ready")).toBe(true);
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(planCalls()).toHaveLength(1);
});

test("aynı set için ikinci devam çağrısı yeni üretim açmaz", async () => {
  route(() => PLAN6);
  const first = await startSet({ profile: profile(), focus: [olmak], theme: rutin });
  const a = continueSet(profile(), first!.id);
  const b = continueSet(profile(), first!.id);
  expect(a).toBe(b);
  await a;
  expect(sentenceCalls()).toHaveLength(6);
  expect(maxInFlight).toBe(1);
});

test("onay verilmezse hiçbir istek gitmez", async () => {
  route(() => PLAN6);
  const set = await startSet({ profile: profile(), focus: [olmak], theme: rutin, confirm: () => false });
  expect(set).toBeNull();
  expect(mockStructured).not.toHaveBeenCalled();
});

test("harcama tavanı doluysa plan isteği gitmez", async () => {
  route(() => PLAN6);
  await recordUsage({ model: "m", input: 10_000_000, output: 0 });
  const err = await startSet({ profile: profile("A1", { budget: { dailyTry: 1, monthlyTry: 2 } }), focus: [olmak], theme: rutin }).catch((e) => e);
  expect(isBudgetError(err)).toBe(true);
  expect(mockStructured).not.toHaveBeenCalled();
});

test("tavan set ORTASINDA dolarsa başlamış set yine biter (set başına tek bekçi)", async () => {
  route(
    () => PLAN6,
    async (k) => {
      if (k === 1) await recordUsage({ model: "m", input: 10_000_000, output: 0 });
      return good(k);
    }
  );
  const tight = profile("A1", { budget: { dailyTry: 1, monthlyTry: 2 } });
  const set = await startAndFinish(tight);
  expect(set!.sentences.every((s) => s.status === "ready")).toBe(true);
  expect(sentenceCalls()).toHaveLength(6);
});

test("tavan doluyken açılışta sürdürme istek göndermez; cümleler bekler", async () => {
  let down = true;
  route(
    () => PLAN6,
    (k) => (k === 2 && down ? new Error("Ağ koptu") : good(k))
  );
  const tight = profile("A1", { budget: { dailyTry: 1, monthlyTry: 2 } });
  const first = await startSet({ profile: tight, focus: [olmak], theme: rutin });
  await whenIdle(first!.id);
  down = false;
  await recordUsage({ model: "m", input: 10_000_000, output: 0 });
  const before = sentenceCalls().length;
  const onError = jest.fn();
  const res = await resumePending(tight, { hooks: { onError } });
  expect(isBudgetError(res?.error)).toBe(true);
  expect(onError).toHaveBeenCalledTimes(1);
  expect(sentenceCalls()).toHaveLength(before);
  const saved = (await loadBuildSets2()).find((s) => s.id === first!.id)!;
  expect(saved.sentences.slice(2).every((s) => s.status === "pending")).toBe(true);
});

test("yoklama ve 'Başka örnek' de tavan bekçisinin arkasında; cevap cihazda süzülür", async () => {
  mockStructured.mockResolvedValueOnce({
    items: [
      { pid: "olmak", tr: "Ben öğrenciyim.", t: "I am a student.", sw: [["student", "pupil"]] },
      { pid: "uydurma", tr: "x", t: "y" },
      { pid: "olmak", tr: "", t: "z" },
    ],
  });
  const items = await generateProbe(profile(), [olmak], { lang: "en", band: "A1" });
  expect(items).toEqual([{ pid: "olmak", tr: "Ben öğrenciyim.", target: "I am a student.", swaps: [{ from: ["student"], to: ["pupil"] }] }]);
  expect((mockStructured.mock.calls[0][0] as Req).schemaHint).toBe(PROBE_SCHEMA_HINT);

  mockStructured.mockResolvedValueOnce({ x: [["I leave work.", "İşten çıkarım."], ["I leave home.", "Evden çıkarım."], ["bad"]] });
  const more = await generateMoreTransfer(profile(), { target: "leave home", tr: "evden çıkmak" }, { lang: "en", band: "A2", avoid: ["I leave home."] });
  expect(more).toEqual([{ target: "I leave work.", tr: "İşten çıkarım." }]);

  mockStructured.mockClear();
  await recordUsage({ model: "m", input: 10_000_000, output: 0 });
  const tight = profile("A1", { budget: { dailyTry: 1, monthlyTry: 2 } });
  expect(isBudgetError(await generateProbe(tight, [olmak], { lang: "en", band: "A1" }).catch((e) => e))).toBe(true);
  expect(isBudgetError(await generateMoreTransfer(tight, { target: "a", tr: "b" }, { lang: "en", band: "A1" }).catch((e) => e))).toBe(true);
  expect(mockStructured).not.toHaveBeenCalled();
});

test("tarihçe: bölüm, özet ve cümle anahtarları; ikinci bölüm devam eder", async () => {
  route(() => PLAN6);
  await startAndFinish(profile(), [olmak]);
  const h = (await loadBuildHistory())[`${olmak.id}|${rutin.id}`];
  expect(h.episode).toBe(1);
  expect(h.ozet).toBe("Sabahtan akşama.");
  expect(h.trKeys).toHaveLength(6);

  route(() => ({ ...PLAN6, s: PLAN6.s.map((x) => ({ ...x, tr: x.tr.replace(".", " yine.") })) }));
  const second = await startAndFinish(profile(), [olmak]);
  expect(second!.episode).toBe(2);
  const sys = planCalls()[planCalls().length - 1].system;
  expect(sys).toMatch(/BÖLÜM 2\. Önceki bölümün özeti: Sabahtan akşama\./);
  expect(sys).toContain("- Sabahları erken uyanırım.");
  expect((await loadBuildHistory())[`${olmak.id}|${rutin.id}`].trKeys).toHaveLength(12);
});

test("tarihçedeki cümleler tekrar gelirse plan o listeyle BİR kez yeniden istenir", async () => {
  route(() => PLAN6);
  await startAndFinish(profile(), [olmak]);
  mockStructured.mockReset();
  const fresh = { ...PLAN6, s: PLAN6.s.map((x) => ({ ...x, tr: x.tr.replace(".", " bugün.") })) };
  route((req, call) => (call === 1 ? PLAN6 : fresh));
  const set = await startAndFinish(profile(), [olmak]);
  const ps = planCalls();
  expect(ps).toHaveLength(2);
  expect(ps[1].userMessage).toMatch(/daha önce kuruldu/);
  expect(ps[1].userMessage).toContain("- Sabahları erken uyanırım.");
  expect(set!.plan.sentences[0].tr).toBe("Sabahları erken uyanırım bugün.");
});

test("set seviyesi: öğrencinin seviyesi, odak kalıp üstteyse onunki", () => {
  expect(setBand(profile("A1"), [olmak])).toBe("A1");
  expect(setBand(profile("A1"), [patternById("sevmek") as Pattern])).toBe("A2");
  expect(setBand(profile("B2"), [olmak])).toBe("B2");
});

test("zincirleme başarısızlıkta taşınan taş bir sonraki hazır cümleye geçer", () => {
  const p = validatePlan(PLAN6, 6, { lang: "en", band: "A1" }).plan;
  const set = {
    lang: "en",
    plan: p,
    sentences: p.sentences.map((sp, i) => placeholderSentence(sp, i === 1 || i === 2 ? "failed" : "pending")),
  } as unknown as BuildSet;
  set.sentences[0].status = "ready";
  // 2. cümlenin "take a shower"ı 3.'ye taşınmıştı; 3. de olmayınca ikisi 4.'ye geçer.
  expect(carriedNew(set, 3)).toEqual(["take a shower", "by bus"]);
  expect(carriedNew(set, 2)).toEqual([]);
  expect(carriedNew(set, 4)).toEqual([]);
});

test("zincirin sonunda yalnız sentez kalırsa taş oraya geçer; sentezin yeni taş sınırı 2", () => {
  const p = validatePlan(PLAN6, 6, { lang: "en", band: "A1" }).plan;
  const mk = (failedAt: number[]) => {
    const set = {
      lang: "en",
      plan: p,
      sentences: p.sentences.map((sp, i) => placeholderSentence(sp, failedAt.includes(i) ? "failed" : "pending")),
    } as unknown as BuildSet;
    set.sentences.forEach((s, i) => {
      if (i < 5 && s.status === "pending") s.status = "ready";
    });
    return set;
  };
  expect(carriedNew(mk([4]), 5)).toEqual(["get hungry"]);
  // Çukur + uzatma düştü: "have lunch" ve "get hungry" sığar (2), fazlası sığmaz.
  expect(carriedNew(mk([3, 4]), 5)).toEqual(["have lunch", "get hungry"]);
  expect(carriedNew(mk([2, 3, 4]), 5)).toEqual(["by bus", "have lunch"]);
});

/**
 * Anthropic yapılandırılmış çıktısı her nesnede `additionalProperties: false`
 * ister, başka değeri 400 ile reddeder. Bu hata model hatası sayılmadığından
 * denenmez: şemaya yeni bir nesne eklenip alan unutulursa her istek sessizce
 * düşer ve cümleler "pending" kalırdı.
 */
test("yeni şemaların her nesnesi additionalProperties: false taşır", () => {
  const missing: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (o.type === "object" && o.additionalProperties !== false) missing.push(path);
    for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
  };
  const schemas = { PLAN_SCHEMA, SENTENCE_SCHEMA, PROBE_SCHEMA, MORE_TRANSFER_SCHEMA };
  for (const [name, sc] of Object.entries(schemas)) walk(sc, name);
  expect(missing).toEqual([]);
});

describe("DeepSeek: şema ipucu", () => {
  function streamOf(content: string) {
    return {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content }, finish_reason: "stop" }] };
        yield { choices: [], usage: { prompt_tokens: 100, completion_tokens: 10, prompt_cache_hit_tokens: 90 } };
      },
    };
  }

  test("ipucu varsa tam şema yerine o gider; yoksa şema", async () => {
    mockCreate.mockImplementation(async () => streamOf('{"ok":1}'));
    const schema = { type: "object", properties: { ok: { type: "integer" } } };
    const out = await deepseekProvider.structured<{ ok: number }>({
      system: "SİSTEM",
      userMessage: "u",
      schema,
      schemaHint: "{ok}",
      model: "m",
      apiKey: "sk-x",
    });
    expect(out.ok).toBe(1);
    const sys = (mockCreate.mock.calls[0][0] as { messages: { role: string; content: string }[] }).messages[0].content;
    expect(sys.startsWith("SİSTEM\n\n")).toBe(true);
    expect(sys).toContain("{ok}");
    expect(sys).not.toContain(JSON.stringify(schema));
    expect(structuredSystem({ system: "S", schema })).toContain(JSON.stringify(schema));
  });

  test("aynı sistem + ipucu → aynı ön-ek (önbellek)", () => {
    const a = structuredSystem({ system: "S", schema: {}, schemaHint: SENTENCE_SCHEMA_HINT });
    const b = structuredSystem({ system: "S", schema: { x: 1 }, schemaHint: SENTENCE_SCHEMA_HINT });
    expect(a).toBe(b);
  });
});
