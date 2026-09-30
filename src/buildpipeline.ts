/**
 * CÜMLE KURMA — üretim hattı (tasarım §2.1).
 *
 * Set iki aşamada üretilir: önce kısa bir PLAN (hikâye, roller, bağlaçlar,
 * taşlar), sonra cümleler TEK TEK. Böylece:
 * - uzun set cevap sınırına takılıp yarıda kesilmez;
 * - öğrenci plan + 1. cümle gelince başlar, sonrakiler o çalışırken hazırlanır
 *   (bir cümlenin pratiği 2-3 dk, üretimi 20-40 sn);
 * - cümle isteklerinin sistem promptu bayt bayt aynıdır, DeepSeek ön-ek
 *   önbelleğinden okur ve set neredeyse tek plan fiyatına çıkar.
 *
 * Kurallar:
 * - AYNI ANDA TEK İSTEK: bütün üretim tek bir sıradan geçer. İki ekran ya da
 *   iki devam çağrısı aynı anda istek açamaz; açsaydı hem önbellek ısınmadan
 *   ikinci istek giderdi hem de sağlayıcının hız sınırına takılınırdı.
 * - Cümle kesilir ya da 2'den az adım gelirse o cümle bir kez KISA MOD'da
 *   denenir; yine olmazsa "failed" olur ve set DEVAM eder. Üretilemeyen
 *   sentezin yerini son iki hazır cümlenin yeniden anlatımı alır; üretilemeyen
 *   başka cümlenin yeni taşları sonraki cümleye taşınır (§2.1).
 * - Ağ, anahtar ya da harcama tavanı hatası cümleyi "failed" YAPMAZ: cümle
 *   "pending" kalır ve ekran yeniden açılınca kaldığı yerden sürer.
 * - Harcama tavanına çalıştırma başına BİR kez bakılır (yeni sette plan
 *   isteğinde, sürdürmede başta): başlamış set tavan yolda dolsa da biter.
 * - Bütçe onayı set başına BİR kez sorulur (startSet); devam hiç sormaz.
 */
import { generateBuildPlan, generateBuildSentence, guardBudget, isModelOutputError } from "./claude";
import { historyKey, TRKEYS_CAP } from "./buildmastery";
import type { BlockProgress, BuildHistory, BuildUi } from "./buildmastery";
import { getActiveLanguageId } from "./languages";
import type { LanguageId } from "./languages";
import { canonicalTokens } from "./buildcheck";
import { BANDS, bandIndex, blockKey, placeholderSentence, setSize, toBand, trapIdsFor, trKey } from "./sentencebuilding";
import type { Band, BuildSentence, BuildSet, NormalizeStores, Pattern, Theme } from "./sentencebuilding";
import {
  loadBuildBlocks,
  loadBuildHistory,
  loadBuildProgress2,
  loadBuildSets2,
  loadBuildUi,
  saveBuildHistory,
  saveBuildSets2,
} from "./storage";
import type { Profile } from "./types";

/** Saklanan set sayısı; tarihçe, taş hafızası ve cümle tekrarı budamadan etkilenmez. */
export const KEEP_SETS = 60;

/**
 * İstek başına cümle: 1. Tasarım düşünmeyen Anthropic/OpenAI modellerinde 2
 * cümleye izin veriyor; ama bu uygulamadaki bütün yapılandırılmış yollar
 * düşünerek çalışıyor (DeepSeek, Anthropic adaptive thinking, OpenAI akıl
 * yürüten modeller) ve düşünme cevap sınırından yer. Tek cümle hem kesilmeyi
 * hem KISA MOD yeniden denemesini tek cümleyle sınırlı tutar.
 */
export const SENTENCES_PER_CALL = 1;

/** "Karşıtlığı verilmiş" listesinin üst sınırı — kullanıcı mesajı şişmesin. */
const CONTRAST_LIST_CAP = 30;

// ---------------------------------------------------------------------------
// Saf yardımcılar (istek içeriği ve başarısızlık kuralları)
// ---------------------------------------------------------------------------

/**
 * Üretilemeyen cümlelerin YENİ taşları nereye taşınır (tasarım §2.1)?
 * Önce o taşı geri getiren (rec) ilk sonraki cümleye: orada zaten geçiyor,
 * "Bunu öğrendik" yerine yeniden öğretilir. Geri getiren yoksa bir sonraki
 * cümlenin lamba listesine; sentez yalnız son çare ve yeni taş sınırı (2)
 * dolmadıkça.
 * Deterministiktir: aynı set durumu hep aynı sonucu verir; zincirleme
 * başarısızlıkta taşınan taş bir sonrakine geçer.
 */
export function carriedNew(set: Pick<BuildSet, "plan" | "sentences" | "lang">, k: number): string[] {
  const plan = set.plan.sentences;
  const n = plan.length;
  const key = (s: string) => blockKey(s, set.lang);
  const out: string[][] = Array.from({ length: n }, () => []);
  const failed = (x: number) => set.sentences[x]?.status === "failed";
  for (let j = 0; j < Math.min(k, n); j += 1) {
    if (!failed(j) || plan[j].role === "synthesis") continue;
    for (const p of [...plan[j].new, ...out[j]]) {
      const pk = key(p);
      if (!pk) continue;
      let t = -1;
      for (let x = j + 1; x < n && t < 0; x += 1) {
        if (!failed(x) && plan[x].rec.some((r) => key(r) === pk)) t = x;
      }
      for (let x = j + 1; x < n && t < 0; x += 1) {
        if (!failed(x) && plan[x].role !== "synthesis") t = x;
      }
      // Sentezden hemen önceki cümle (çoğu zaman uzatma) düşerse ondan sonra
      // yalnız sentez kalır; taş orada da yer bulamazsa hiç öğretilmezdi.
      // Sentezin yeni taş sınırı (2) dolmadıkça oraya taşınır.
      for (let x = j + 1; x < n && t < 0; x += 1) {
        if (!failed(x) && plan[x].role === "synthesis" && plan[x].new.length + out[x].length < 2) t = x;
      }
      if (t >= 0 && !out[t].some((q) => key(q) === pk)) out[t].push(p);
    }
  }
  return out[k] ?? [];
}

/**
 * Karşıtlığı daha önce gösterilmiş taş ve bağlaçlar: bu setin önceki
 * cümleleri + taş hafızası. Model bunlar için c/cc yazmaz — hoca bir
 * karşıtlığı yalnız ilk seferde anlatır.
 */
export function contrastShownFor(
  set: Pick<BuildSet, "sentences">,
  k: number,
  blocks: Record<string, Pick<BlockProgress, "target" | "contrastShown">> = {}
): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    const v = t.trim();
    if (v && !out.includes(v)) out.push(v);
  };
  for (const s of set.sentences.slice(0, k)) {
    if (s.status !== "ready") continue;
    if (s.connector?.contrast) add(s.connector.target);
    for (const b of s.blocks) if (b.contrast || b.recycled?.firstContrast) add(b.target);
  }
  for (const b of Object.values(blocks)) if (b?.contrastShown && b.target) add(b.target);
  return out.slice(-CONTRAST_LIST_CAP);
}

/** Üretilemeyen sentezin yerine yeniden anlatılacak son iki hazır cümle. */
export function retellFor(set: Pick<BuildSet, "sentences">, k: number): number[] {
  const ready: number[] = [];
  for (let i = k - 1; i >= 0 && ready.length < 2; i -= 1) {
    if (set.sentences[i]?.status === "ready") ready.unshift(i);
  }
  return ready;
}

/** Üretilemeyen cümlenin kaydı: sentezse yeniden anlatım işareti taşır. */
export function failedSentence(set: Pick<BuildSet, "plan" | "sentences">, k: number): BuildSentence {
  const sp = set.plan.sentences[k];
  const s = placeholderSentence(sp, "failed");
  if (sp.role === "synthesis") {
    const r = retellFor(set, k);
    if (r.length) s.retellOf = r;
  }
  return s;
}

/** Setin seviyesi: öğrencinin konuşma seviyesi, odak kalıp daha üstteyse onun seviyesi. */
export function setBand(profile: Pick<Profile, "assessment">, focus: Pick<Pattern, "band">[]): Band {
  const idx = Math.max(bandIndex(toBand(profile.assessment?.speakingLevel)), ...focus.map((f) => bandIndex(f.band)));
  return BANDS[Math.min(idx, BANDS.length - 1)];
}

/** Tek bütçe onayının metni: kaç istek gideceği ve neden ucuz olduğu. */
export function budgetNote(n: number): string {
  return `Bu set 1 plan + ${n} cümle isteği harcar (önbellekli: cümleler aynı ön-eki paylaşır, ucuzdur). İlk cümle hazır olunca başlarsın; gerisi sen çalışırken hazırlanır.`;
}

/**
 * Plan için ÖĞRENİLMİŞ TAŞLAR yedeği (çağıran vermezse): başka setlerden,
 * önce tuzağa düşülenler, sonra en uzun süredir kullanılmayanlar. Bütün
 * temalardan seçilir — hocanın "bunu öğrenmiştik" hamlesi temaya bağlı değil.
 */
export function defaultRecycle(blocks: Record<string, BlockProgress>, limit = 10): string[] {
  return Object.values(blocks)
    .filter((b) => b && b.target && b.kind !== "connector")
    .sort((a, b) => b.trapMiss - a.trapMiss || (a.lastSeen < b.lastSeen ? -1 : a.lastSeen > b.lastSeen ? 1 : 0))
    .slice(0, limit)
    .map((b) => b.target);
}

// ---------------------------------------------------------------------------
// Tek istek sırası ve depo yazımı
// ---------------------------------------------------------------------------

let lane: Promise<unknown> = Promise.resolve();

/** Bütün üretim istekleri bu sıradan geçer: aynı anda en fazla bir istek. */
function inLane<T>(fn: () => Promise<T>): Promise<T> {
  const run = lane.then(fn, fn);
  lane = run.catch(() => undefined);
  return run;
}

let storeLane: Promise<unknown> = Promise.resolve();

/**
 * Set listesine yazım da sıralı: arka plandaki üretim ile ekranın kaydı
 * aynı anda listeyi okuyup yazarsa biri ötekinin cümlesini silerdi. Her
 * yazım listeyi TAZE okur ve yalnız kendi setini değiştirir.
 */
function inStore<T>(fn: () => Promise<T>): Promise<T> {
  const run = storeLane.then(fn, fn);
  storeLane = run.catch(() => undefined);
  return run;
}

async function updateSet(id: string, mutate: (s: BuildSet) => void): Promise<BuildSet | null> {
  return inStore(async () => {
    const sets = await loadBuildSets2();
    const i = sets.findIndex((s) => s.id === id);
    if (i < 0) return null;
    const next = { ...sets[i], sentences: [...sets[i].sentences] };
    mutate(next);
    const list = [...sets];
    list[i] = next;
    await saveBuildSets2(list);
    return next;
  });
}

async function findSet(id: string): Promise<BuildSet | null> {
  return inStore(async () => (await loadBuildSets2()).find((s) => s.id === id) ?? null);
}

// ---------------------------------------------------------------------------
// Set başlatma ve sürdürme
// ---------------------------------------------------------------------------

export interface PipelineHooks {
  /** Her kayıttan sonra (plan, her cümle): ekran seti tazeler. */
  onUpdate?: (set: BuildSet) => void;
  /** Üretim durdu (ağ, tavan…); kalan cümleler "pending", açılışta sürer. */
  onError?: (e: unknown, set: BuildSet) => void;
}

export interface RunOptions {
  hooks?: PipelineHooks;
  /**
   * Tavana bu çalıştırma için zaten bakıldı (startSet: plan isteğinin
   * bekçisi). Verilmezse çalıştırma başında BİR kez bakılır.
   */
  budgetChecked?: boolean;
  /** Odak kalıbın durumu: proving/verify/mastered → cümleler önce tek seferde. */
  patternStatus?: string;
}

export interface RunResult {
  set: BuildSet | null;
  /** Üretimi durduran hata (varsa); cümleler "pending" kaldı. */
  error?: unknown;
}

const running = new Map<string, Promise<RunResult>>();
/**
 * Sürmekte olan üretimin dinleyicileri. Ekran geri çıkıp yeniden açılınca
 * yeni ekran aynı üretime KATILIR; kancalar yalnız ilk çağırana bağlı kalsaydı
 * yeni ekran "hazırlanıyor" kartında sonsuza dek beklerdi.
 */
const listeners = new Map<string, Set<PipelineHooks>>();

function notify(setId: string, fn: (h: PipelineHooks) => void): void {
  for (const h of [...(listeners.get(setId) ?? [])]) {
    try {
      fn(h);
    } catch {
      // Bir ekranın kanca hatası üretimi ve öteki dinleyicileri durdurmasın.
    }
  }
}

/** Bu setin üretimi sürüyor mu (ekran "hazırlanıyor" kartı için). */
export function isGenerating(setId: string): boolean {
  return running.has(setId);
}

/** Sürüyorsa üretimin bitişi; sürmüyorsa hemen. */
export function whenIdle(setId: string): Promise<RunResult | null> {
  return running.get(setId) ?? Promise.resolve(null);
}

interface Stores {
  blocks: Record<string, BlockProgress>;
  ui: BuildUi;
  /** Eski (durumu kaydedilmemiş) setler için kalıbın şimdiki durumu. */
  patternStatus?: string;
}

/**
 * Karşıtlığı daha önce (başka setlerde) gösterilmiş tuzaklar. Hoca bir
 * karşıtlığı yalnız ilk seferde anlatır; sonra yalnız parafraz. Bu liste
 * olmasa cihaz her yeni sette tuzak metnini taşa yeniden yazardı.
 */
export function shownTrapIds(blocks: Record<string, Pick<BlockProgress, "target" | "contrastShown">>, lang: LanguageId): string[] {
  const out = new Set<string>();
  for (const b of Object.values(blocks)) {
    if (!b?.contrastShown || !b.target) continue;
    for (const id of trapIdsFor(canonicalTokens(b.target, lang), lang)) out.add(id);
  }
  return [...out];
}

/** Tek cümle: normal dene → gerekirse KISA MOD → olmazsa "failed". */
async function produce(profile: Profile, set: BuildSet, k: number, stores: Stores, patternStatus?: string): Promise<BuildSentence> {
  const norm: NormalizeStores = {
    band: set.level,
    blocks: stores.blocks,
    connSeen: stores.ui.connSeen,
    acceptDialect: !!stores.ui.acceptDialect,
    shownTrapIds: shownTrapIds(stores.blocks, set.lang),
  };
  // Sürdürmede çağıran durumu bilmez: set kurulurken kaydedilen durum geçerli.
  const ps = patternStatus ?? set.patternStatus ?? stores.patternStatus;
  if (ps) norm.patternStatus = ps;
  const input = {
    set,
    k,
    stores: norm,
    carry: carriedNew(set, k),
    contrastShown: contrastShownFor(set, k, stores.blocks),
    videoOrder: !!stores.ui.videoOrder,
  };
  for (const short of [false, true]) {
    try {
      const s = await inLane(() => generateBuildSentence(profile, input, short, true));
      if (s.status === "ready") return s;
    } catch (e) {
      // Kesilme/bozuk çıktı KISA MOD'a değer; ağ ve tavan hatası değmez —
      // cümle "pending" kalsın, ekran yeniden açılınca sürsün.
      if (!isModelOutputError(e)) throw e;
    }
  }
  return failedSentence(set, k);
}

/**
 * Setin bekleyen cümlelerini sırayla üretir (açılışta sürdürme de budur).
 * Aynı set için ikinci çağrı yeni üretim başlatmaz, süreni döndürür. Hiç
 * reddetmez: durduran hata sonuçta ve onError'da gelir.
 */
export function continueSet(profile: Profile, setId: string, opts: RunOptions = {}): Promise<RunResult> {
  const cur = running.get(setId);
  if (cur) {
    // Süren üretime katıl: bundan sonraki kayıtlar bu çağırana da gelir.
    if (opts.hooks) listeners.get(setId)?.add(opts.hooks);
    return cur;
  }
  const ls = new Set<PipelineHooks>();
  if (opts.hooks) ls.add(opts.hooks);
  listeners.set(setId, ls);
  const run = (async (): Promise<RunResult> => {
    let last: BuildSet | null = null;
    try {
      const [blocks, ui, progress, head] = await Promise.all([loadBuildBlocks(), loadBuildUi(), loadBuildProgress2(), findSet(setId)]);
      const stores: Stores = { blocks, ui };
      if (head && !head.patternStatus) {
        stores.patternStatus = head.patternId.startsWith("karma:") ? "mastered" : progress[head.patternId]?.status;
      }
      // Tavan çalıştırma başına BİR kez (tasarım §2.1: "set başına tek bekçi").
      // Başlamış çalıştırma, tavan yolda dolsa da seti bitirir — aşım en çok
      // bir setin kalan cümleleri kadardır ve öğrenci seti onaylamıştı. Ama
      // tavan doluyken yeniden açılışta sürdürme istek göndermez.
      if (!opts.budgetChecked) {
        last = await findSet(setId);
        await guardBudget(profile);
      }
      for (;;) {
        const set = await findSet(setId);
        if (!set) return { set: null };
        last = set;
        const k = set.sentences.findIndex((s) => s.status === "pending");
        if (k < 0) {
          // Bekleyen yok (başka bir çalıştırma bitirmiş olabilir): ekran eski
          // anlık görüntüde kalmasın, taze seti alsın.
          notify(setId, (h) => h.onUpdate?.(set));
          return { set };
        }
        const s = await produce(profile, set, k, stores, opts.patternStatus);
        const saved = await updateSet(setId, (x) => {
          x.sentences[k] = s;
        });
        if (!saved) return { set: null };
        last = saved;
        notify(setId, (h) => h.onUpdate?.(saved));
      }
    } catch (e) {
      // Arka planda kimse beklemiyor olabilir: hata reddedilen bir söz olarak
      // kaybolmasın, sonuçla ve onError ile bildirilsin.
      const at = last;
      if (at) notify(setId, (h) => h.onError?.(e, at));
      return { set: last, error: e };
    }
  })().finally(() => {
    running.delete(setId);
    listeners.delete(setId);
  });
  running.set(setId, run);
  return run;
}

/**
 * Ekran açılışı: bekleyen cümlesi olan EN YENİ seti sürdürür (öğrencinin
 * üzerinde çalıştığı set). Bütçe onayı sorulmaz — set başlarken sorulmuştu.
 */
export async function resumePending(profile: Profile, opts: RunOptions = {}): Promise<RunResult | null> {
  const sets = await inStore(() => loadBuildSets2());
  const cur = sets.find((s) => s.v === 2 && s.sentences.some((x) => x.status === "pending"));
  return cur ? continueSet(profile, cur.id, opts) : null;
}

export interface StartSetInput extends RunOptions {
  profile: Profile;
  /** Odak kalıp(lar); birden çoksa KARMA set ("karma:a+b"). */
  focus: Pattern[];
  theme: Theme;
  band?: Band;
  /** ÖĞRENİLMİŞ TAŞLAR (verilmezse taş hafızasından seçilir). */
  recycle?: string[];
  /** Öğrencinin bildiği kelimeler (en fazla 40). */
  known?: string[];
  /**
   * Set başına TEK bütçe onayı. false dönerse hiçbir istek gitmez. Verilmezse
   * sorulmaz (çağıran zaten onay almış sayılır).
   */
  confirm?: (note: string, n: number) => Promise<boolean> | boolean;
}

/**
 * Yeni set: onay → plan → set kaydı (bütün cümleler "pending") → ilk hazır
 * cümle → döner. Kalan cümleler arka planda, tek istek hâlinde sürer.
 * Onay verilmezse null. İlk cümle hazır olmadan üretim durursa (ağ, tavan)
 * hata fırlatılır ama set kayıtlıdır: açılışta kaldığı yerden sürer.
 */
export async function startSet(input: StartSetInput): Promise<BuildSet | null> {
  const { profile, focus, theme } = input;
  if (!focus.length) throw new Error("Odak kalıp yok.");
  const lang = getActiveLanguageId();
  const band = input.band ?? setBand(profile, focus);
  const n = setSize(band);
  if (input.confirm && !(await input.confirm(budgetNote(n), n))) return null;

  const [sets, history, blocks] = await Promise.all([inStore(() => loadBuildSets2()), loadBuildHistory(), loadBuildBlocks()]);
  const patternId = focus.length > 1 ? `karma:${focus.map((f) => f.id).join("+")}` : focus[0].id;
  const hk = historyKey(patternId, theme.id);
  const hist: BuildHistory = history[hk] ?? { episode: 0, ozet: "", trKeys: [] };
  const episode = hist.episode + 1;
  // Önceki bölümlerin cümleleri, eskiden yeniye: plan son 20'sini görür.
  const lastTr = sets
    .filter((s) => s.patternId === patternId && s.themeId === theme.id)
    .reverse()
    .flatMap((s) => s.plan?.sentences.map((x) => x.tr) ?? s.sentences.map((x) => x.tr))
    .filter(Boolean);
  const recycle = input.recycle ?? defaultRecycle(blocks);

  const res = await generateBuildPlanInLane(profile, {
    lang,
    name: profile.name,
    band,
    focus,
    theme,
    n,
    episode,
    ozet: hist.ozet,
    lastTr,
    recycle,
    known: (input.known ?? []).slice(-40),
    trKeys: hist.trKeys,
  });

  const createdAt = new Date().toISOString();
  const set: BuildSet = {
    v: 2,
    id: `${createdAt}-${patternId}`,
    patternId,
    themeId: theme.id,
    lang,
    level: band,
    tense: res.plan.tense,
    episode,
    intro: res.plan.intro,
    plan: res.plan,
    sentences: res.plan.sentences.map((sp) => placeholderSentence(sp)),
    createdAt,
  };
  if (input.patternStatus) set.patternStatus = input.patternStatus;
  await inStore(async () => {
    const fresh = await loadBuildSets2();
    await saveBuildSets2([set, ...fresh.filter((s) => s.id !== set.id)].slice(0, KEEP_SETS));
  });
  // Tarihçe set KURULURKEN yazılır: öğrenci seti yarıda bıraksa da sonraki
  // bölüm aynı cümleleri tekrarlamasın, özet kaldığı yerden devam etsin.
  const keys = [...hist.trKeys];
  for (const sp of res.plan.sentences) {
    const tk = trKey(sp.tr);
    if (sp.tr && !keys.includes(tk)) keys.push(tk);
  }
  await saveBuildHistory({
    ...(await loadBuildHistory()),
    [hk]: { episode, ozet: res.plan.ozet || res.plan.intro || hist.ozet, trKeys: keys.slice(-TRKEYS_CAP) },
  });
  input.hooks?.onUpdate?.(set);

  // İlk hazır cümleyi bekle; üretim arka planda sürer.
  let resolveReady: (s: BuildSet) => void = () => {};
  const ready = new Promise<BuildSet>((r) => {
    resolveReady = r;
  });
  const run = continueSet(profile, set.id, {
    patternStatus: input.patternStatus,
    budgetChecked: true,
    hooks: {
      onUpdate: (s) => {
        input.hooks?.onUpdate?.(s);
        if (s.sentences.some((x) => x.status === "ready")) resolveReady(s);
      },
      onError: input.hooks?.onError,
    },
  });
  const first = await Promise.race([ready, run.then((r) => r)]);
  if ("v" in first) return first;
  // Üretim ilk hazır cümleden önce bitti.
  if (first.error) throw first.error;
  const final = first.set ?? set;
  if (!final.sentences.some((x) => x.status === "ready")) {
    throw new Error("Bu setin cümleleri hazırlanamadı (model her denemede eksik cevap verdi). Başka bir modelle tekrar denemek genelde çözer.");
  }
  return final;
}

/** Plan isteği de aynı tek istek sırasından geçer. */
function generateBuildPlanInLane(profile: Profile, input: Parameters<typeof generateBuildPlan>[1]) {
  return inLane(() => generateBuildPlan(profile, input));
}
