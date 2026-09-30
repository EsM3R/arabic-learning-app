/**
 * CÜMLE KURMA — ilerleme, taş hafızası, cümle tekrarı (saf modül).
 *
 * Bu dosyanın şimdiki kısmı VERİ MODELİ ve v1 → v2 GEÇİŞİDİR: kalıp
 * ilerlemesi artık rehberli adım isabetiyle değil, yardımsız söylenmiş
 * farklı cümlelerle ölçülecek (tasarım §6). Geçişte hiçbir şey sessizce
 * geri alınmaz: v1'de "oturdu" sayılan kalıp "tekrar doğrula" (verify)
 * olur, kaydedilen her cümle aralıklı tekrara girer; ama ilk tekrarlar 7
 * güne yayılır (günde en fazla 12) ki öğrenci ilk gün bir tekrar yığınıyla
 * karşılaşmasın.
 *
 * Göç SAF bir fonksiyondur (migrateBuildEntries): yeni anahtarları yazar,
 * eskileri ASLA silmez — yarım kalan göçten sonra da veri okunabilir kalır.
 *
 * İkinci kısım OTURMA MANTIĞIDIR (tasarım §6): olay kaydı (recordEvent),
 * altı ölçütlü isMastered, taş hafızası, cümle tekrarı takvimi, "Tekrar
 * zamanı" kuyruğu, sıradaki kalıp (nextFocus), yerleştirme ve "Sına ve
 * geç". Hepsi saf: ekran yalnız sonucu saklar.
 */
import type { LanguageId } from "./languages.ts";
import {
  bandIndex,
  blockKey,
  isMastered as isMasteredV1,
  LEGACY_PATTERN_IDS,
  PATTERN_LADDER,
  patternById,
  trKey,
  upgradeSetV1,
} from "./sentencebuilding.ts";
import type {
  Band,
  BlockKind,
  BuildSet,
  BuildStep,
  Pattern,
  PatternProgress as PatternProgressV1,
  Swap,
  TenseFrame,
} from "./sentencebuilding.ts";
import { strugglingCards } from "./srs.ts";
import type { VocabCard } from "./types.ts";

export type EvKind =
  | "guided"
  | "copy"
  | "oneshot"
  | "reorder"
  | "linked"
  | "retell"
  | "transfer"
  | "pair"
  | "retrieval"
  | "review"
  | "probe";

/** Bir kanıt olayı: yardımsız söyleyiş, aktarım, geri çağırma… */
export interface ProofEvent {
  k: EvKind;
  ok: 0 | 0.5 | 1;
  first: boolean;
  spoken: boolean;
  /** Cümle anahtarı (canonical son hedef). */
  sk: string;
  th: string;
  set: string;
  /** Geri gelen (önizlemesiz) kullanım mı. */
  rec: boolean;
  trap?: string;
  /**
   * Kanıtlanmış cümlenin yeniden söylenişi (CM-9). Yalnız tuzaklıysa tutulur:
   * tuzak ölçütü (e) görsün diye; isabete ve gecikmeli kanıta girmez.
   */
  rp?: boolean;
  at: string;
}

export type PatternStatus = "new" | "learning" | "proving" | "verify" | "mastered" | "slipping";

export interface PatternProgress {
  v: 2;
  /** Rehberli adımlar — yalnız gösterim ("öğrenme isabeti"), oturmayı belirlemez. */
  learn: { attempts: number; firstTryOk: number; recent: number[] };
  proof: ProofEvent[];
  proofKeys: string[];
  recycledKeys: string[];
  recycledSets: string[];
  themes: string[];
  transferOk: number;
  retrieval: number[];
  /**
   * Kalıbın cümleleri geri çağırma sorusu sorulabilen bir tuzak taşı ya da
   * sistem dersi öğretti: ölçüt (d) o zaman aranır (§6.2). Bir kez açılır.
   */
  trapBlocks?: boolean;
  firstProofAt?: string;
  lastAt: string;
  status: PatternStatus;
  masteredBy?: "proof" | "test" | "legacy";
  /** lapseAt: son tekrar kaçırması — aynı oturumdaki iki yanlış "art arda iki kaçırma" sayılmasın. */
  srs: { stage: number; due?: string; lapses: number; lapseAt?: string };
  /** v1'den gelen sayılar (yalnız bilgi). */
  legacy?: { attempts: number; correct: number; sentencesDone: number; recent?: number[] };
}

export type ProgressMap2 = Record<string, PatternProgress>;

/** Dil başına taş hafızası; anahtar blockKey(target). */
export interface BlockProgress {
  target: string;
  tr: string;
  kind: BlockKind;
  note: string;
  contrast: string;
  firstPatternId: string;
  firstSetId: string;
  firstSentence: number;
  contrastShown: boolean;
  producedOk: number;
  recycledOkKeys: string[];
  sets: string[];
  trapMiss: number;
  retrievalOk: number;
  retrievalMiss: number;
  lastSeen: string;
  /** Taşın ilk denemede doğru üretildiği FARKLI cümleler (oturma: ≥3). */
  okKeys?: string[];
  /** Son ilk-deneme kullanımları: 1 temiz, 0 tuzak (oturma: son 3'te tuzak yok). */
  recent?: number[];
}

/** Kurulan her cümle aralıklı tekrara "tek seferde söyle" olarak girer. */
export interface SentenceMemory {
  key: string;
  patternIds: string[];
  themeId: string;
  setId: string;
  tr: string;
  target: string;
  swaps: Swap[];
  reorder: string;
  translit: string;
  /** Yanlışta açılan rehberli yedek (trSoFar: Türkçe cevap satırı, eski kayıtlarda yok). */
  steps: (Pick<BuildStep, "question" | "trPiece" | "target" | "note" | "move"> & { trSoFar?: string })[];
  blockKeys: string[];
  /** Son adımın kabul edilen eşdeğerleri: tekrarda da doğru sayılsın (eski kayıtlarda yok). */
  alts?: string[];
  /** Setin zaman çerçevesi: tekrarda da zaman tuzağı yakalansın (eski kayıtlarda yok). */
  tense?: TenseFrame;
  stage: number;
  dueAt: string;
  lapses: number;
  lastOkAt?: string;
  /** Son tekrar zamanı (günlük tavan için). */
  lastAt?: string;
  /**
   * Cümle odak kalıbı kullanıyor muydu. Kalıp kredisi yalnız böyle
   * cümlelerden (CM-10); eski kayıtlarda yok → kullanıyor sayılır.
   */
  focus?: boolean;
}

/** Kalıp+tema başına hikâyenin devamı: bölüm, özet, tekrarlanmayacak cümleler. */
export interface BuildHistory {
  episode: number;
  ozet: string;
  trKeys: string[];
}

export interface BuildUi {
  connSeen: Record<string, number>;
  reorderSeen: number;
  focusOverride?: string;
  placementDone?: boolean;
  acceptDialect?: boolean;
  videoOrder?: boolean;
  fastFlow: boolean;
  /** Arapçada harekeler görünsün mü (denetim harekeye hiç bakmaz; yalnız gösterim). */
  showHarakat?: boolean;
  /** "Günümü anlat" tekrar takvimi: set kimliği → aşama ve vade (1, 4, 10 gün). */
  retells?: Record<string, { stage: number; due: string }>;
}

export const DEFAULT_BUILD_UI: BuildUi = { connSeen: {}, reorderSeen: 0, fastFlow: true };

/** Cümle tekrarı aralıkları (gün). */
export const MEMORY_INTERVALS = [1, 3, 7, 16, 35, 80, 180];
/** Günde en fazla bu kadar tekrar — ilk gün yığılma olmasın. */
export const MEMORY_DAILY_CAP = 12;
export const MEMORY_CAP = 800;
/** Eski (v1) kayıtların ilk tekrarı bu kadar güne yayılır. */
export const LEGACY_SPREAD_DAYS = 7;
export const TRKEYS_CAP = 500;

const DAY = 86_400_000;
const addDays = (now: Date, d: number) => new Date(now.getTime() + d * DAY).toISOString();

export function historyKey(patternId: string, themeId: string): string {
  return `${patternId}|${themeId}`;
}

/** Karma setin kimliği ("karma:a+b") içindeki bütün kalıplar kredi alır. */
export function patternIdsOf(patternId: string): string[] {
  return patternId.startsWith("karma:") ? patternId.slice(6).split("+").filter(Boolean) : [patternId];
}

// ---------------------------------------------------------------------------
// v1 → v2 ilerleme
// ---------------------------------------------------------------------------

/**
 * v1 kalıp ilerlemesi → v2. Rehberli sayılar "learn"e taşınır (kanıt değil).
 * v1'de oturmuş kalıp sessizce geri alınmaz: merdivende yerini korur ama
 * "verify" olur ve bir gecikmeli tekrarla doğrulanır.
 */
export function upgradeProgressV1(p: PatternProgressV1 | PatternProgress, dueAt?: string): PatternProgress {
  if ((p as PatternProgress).v === 2) return p as PatternProgress;
  const v1 = p as PatternProgressV1;
  const mastered = isMasteredV1(v1);
  const legacy: PatternProgress["legacy"] = {
    attempts: v1.attempts ?? 0,
    correct: v1.correct ?? 0,
    sentencesDone: v1.sentencesDone ?? 0,
  };
  if (v1.recent) legacy.recent = [...v1.recent];
  const out: PatternProgress = {
    v: 2,
    learn: { attempts: v1.attempts ?? 0, firstTryOk: v1.correct ?? 0, recent: [...(v1.recent ?? [])] },
    proof: [],
    proofKeys: [],
    recycledKeys: [],
    recycledSets: [],
    themes: [],
    transferOk: 0,
    retrieval: [],
    lastAt: v1.lastAt ?? "",
    status: mastered ? "verify" : "learning",
    srs: { stage: 0, lapses: 0 },
    legacy,
  };
  if (mastered) {
    out.masteredBy = "legacy";
    if (dueAt) out.srs.due = dueAt;
  }
  return out;
}

/** Bütün harita; oturmuş kalıpların doğrulama tekrarı 7 güne yayılır. */
export function upgradeProgressMapV1(map: Record<string, unknown>, now = new Date()): ProgressMap2 {
  const out: ProgressMap2 = {};
  let i = 0;
  for (const [id, raw] of Object.entries(map ?? {})) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as PatternProgressV1 | PatternProgress;
    if ((p as PatternProgress).v === 2) {
      out[id] = p as PatternProgress;
      continue;
    }
    const due = isMasteredV1(p as PatternProgressV1) ? addDays(now, 1 + (i++ % LEGACY_SPREAD_DAYS)) : undefined;
    out[id] = upgradeProgressV1(p, due);
  }
  return out;
}

/** Depodaki v2 haritası + henüz taşınmamış v1 kayıtları (v2 kazanır). */
export function mergeProgress(v2: Record<string, unknown> | null, v1: Record<string, unknown> | null, now = new Date()): ProgressMap2 {
  const base = upgradeProgressMapV1(v2 ?? {}, now);
  const missing: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(v1 ?? {})) if (!base[id]) missing[id] = p;
  return { ...upgradeProgressMapV1(missing, now), ...base };
}

// ---------------------------------------------------------------------------
// Setler
// ---------------------------------------------------------------------------

/** v1/v2 karışık listeyi v2'ye çevirir; aynı kimlik bir kez kalır. */
export function upgradeSets(list: unknown[], lang: LanguageId): BuildSet[] {
  const out: BuildSet[] = [];
  const seen = new Set<string>();
  for (const raw of list ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const s = upgradeSetV1(raw, lang);
    if (!s.sentences || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

/**
 * v2 listesi + v1 listesinde olup v2'de olmayan setler (geçiş döneminde
 * eski ekranın yazdıkları kaybolmasın), en yeni önce.
 */
export function mergeSets(v2: unknown[], v1: unknown[], lang: LanguageId): BuildSet[] {
  const a = upgradeSets(v2, lang);
  const ids = new Set(a.map((s) => s.id));
  const b = upgradeSets(v1, lang).filter((s) => !ids.has(s.id));
  return [...a, ...b].sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0));
}

const oldestFirst = (sets: BuildSet[]) =>
  [...sets].sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0));

// ---------------------------------------------------------------------------
// Tohumlar: taş hafızası, cümle tekrarı, tarihçe, arayüz
// ---------------------------------------------------------------------------

/** Kayıtlı setlerden taş hafızası: her taş bir kez üretilmiş sayılır. */
export function seedBlocks(sets: BuildSet[]): Record<string, BlockProgress> {
  const out: Record<string, BlockProgress> = {};
  for (const set of oldestFirst(sets)) {
    set.sentences.forEach((s, si) => {
      if (s.status !== "ready") return;
      for (const b of s.blocks) {
        const key = b.key || blockKey(b.target, set.lang);
        if (!key) continue;
        const ex = out[key];
        if (ex) {
          if (!ex.sets.includes(set.id)) ex.sets.push(set.id);
          ex.lastSeen = set.createdAt;
          continue;
        }
        const note = b.recycled?.firstNote ?? b.note;
        const contrast = b.recycled?.firstContrast ?? b.contrast;
        out[key] = {
          target: b.target,
          tr: b.tr,
          kind: b.kind,
          note,
          contrast,
          firstPatternId: set.patternId,
          firstSetId: set.id,
          firstSentence: si,
          contrastShown: contrast !== "",
          producedOk: 1,
          recycledOkKeys: [],
          sets: [set.id],
          trapMiss: 0,
          retrievalOk: 0,
          retrievalMiss: 0,
          lastSeen: set.createdAt,
        };
      }
    });
  }
  return out;
}

/** Bir cümleden tekrar kaydı (aşama 0). */
export function memoryItem(set: BuildSet, si: number, dueAt: string): SentenceMemory | null {
  const s = set.sentences[si];
  if (!s || s.status !== "ready" || !s.target) return null;
  return {
    key: s.key || blockKey(s.target, set.lang),
    patternIds: patternIdsOf(set.patternId),
    themeId: set.themeId,
    setId: set.id,
    tr: s.tr,
    target: s.target,
    swaps: s.swaps,
    reorder: s.reorder,
    translit: s.steps[s.steps.length - 1]?.translit ?? "",
    steps: s.steps.map((st) => {
      const x: SentenceMemory["steps"][number] = { question: st.question, trPiece: st.trPiece, target: st.target, note: st.note };
      if (st.trSoFar) x.trSoFar = st.trSoFar;
      if (st.move) x.move = st.move;
      return x;
    }),
    blockKeys: s.blocks.map((b) => b.key),
    alts: s.steps[s.steps.length - 1]?.alts ?? [],
    tense: set.tense,
    stage: 0,
    dueAt,
    lapses: 0,
    focus: s.usesFocus,
  };
}

/**
 * Kayıtlı her cümle tekrara girer. İlk tekrarlar 7 güne yayılır, günde en
 * fazla 12 (84'ten fazlaysa günde 12 ile ileri taşar).
 */
export function seedMemory(sets: BuildSet[], now = new Date()): SentenceMemory[] {
  const items: SentenceMemory[] = [];
  const seen = new Set<string>();
  for (const set of oldestFirst(sets)) {
    set.sentences.forEach((_, si) => {
      const it = memoryItem(set, si, "");
      if (!it || seen.has(it.key)) return;
      seen.add(it.key);
      items.push(it);
    });
  }
  const kept = items.slice(-MEMORY_CAP);
  const perDay = Math.min(MEMORY_DAILY_CAP, Math.max(1, Math.ceil(kept.length / LEGACY_SPREAD_DAYS)));
  kept.forEach((it, i) => {
    it.dueAt = addDays(now, 1 + Math.floor(i / perDay));
  });
  return kept;
}

/** Kalıp+tema başına bölüm sayısı, son özet ve kurulmuş cümlelerin anahtarları. */
export function seedHistory(sets: BuildSet[]): Record<string, BuildHistory> {
  const out: Record<string, BuildHistory> = {};
  for (const set of oldestFirst(sets)) {
    const k = historyKey(set.patternId, set.themeId);
    const h = out[k] ?? { episode: 0, ozet: "", trKeys: [] };
    h.episode += 1;
    const oz = set.plan?.ozet || set.intro;
    if (oz) h.ozet = oz;
    for (const s of set.sentences) {
      const tk = trKey(s.tr);
      if (s.tr && !h.trKeys.includes(tk)) h.trKeys.push(tk);
    }
    h.trKeys = h.trKeys.slice(-TRKEYS_CAP);
    out[k] = h;
  }
  return out;
}

/** Görülen bağlaçlar (karşıtlık yalnız ilk seferde) ve sıralama sayısı. */
export function seedUi(sets: BuildSet[]): BuildUi {
  const ui: BuildUi = { ...DEFAULT_BUILD_UI, connSeen: {} };
  for (const set of sets) {
    for (const s of set.sentences) {
      if (s.status !== "ready") continue;
      if (s.connector?.target) {
        const k = blockKey(s.connector.target, set.lang);
        if (k) ui.connSeen[k] = (ui.connSeen[k] ?? 0) + 1;
      }
      if (s.reorder) ui.reorderSeen += 1;
    }
  }
  return ui;
}

// ---------------------------------------------------------------------------
// Göç (schema.ts zincirinden çağrılır; SAF)
// ---------------------------------------------------------------------------

/** Dil başına anahtar: Arapça eksiz (ilk dil), diğerleri ".dil" ekli — storage.ts langKey ile aynı. */
export function buildStoreKey(base: string, lang: LanguageId | string): string {
  return lang === "ar" ? `${base}.v1` : `${base}.v1.${lang}`;
}

export const BUILD_KEYS = {
  sets1: "buildSets",
  progress1: "buildProgress",
  sets2: "buildSets2",
  progress2: "buildProgress2",
  blocks: "buildBlocks",
  memory: "buildMemory",
  history: "buildHistory",
  ui: "buildUi",
} as const;

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (raw === undefined) return fallback;
  try {
    const v = JSON.parse(raw) as unknown;
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/** Bir dilin v2 cümle kurma deposu, v1 kayıtlarından. */
export function migrateBuildLang(
  setsV1: unknown[],
  progressV1: Record<string, unknown>,
  lang: LanguageId,
  now = new Date()
): {
  sets: BuildSet[];
  progress: ProgressMap2;
  blocks: Record<string, BlockProgress>;
  memory: SentenceMemory[];
  history: Record<string, BuildHistory>;
  ui: BuildUi;
} {
  const sets = upgradeSets(Array.isArray(setsV1) ? setsV1 : [], lang);
  return {
    sets,
    progress: upgradeProgressMapV1(progressV1 && typeof progressV1 === "object" ? progressV1 : {}, now),
    blocks: seedBlocks(sets),
    memory: seedMemory(sets, now),
    history: seedHistory(sets),
    ui: seedUi(sets),
  };
}

const V1_KEY = /^(buildSets|buildProgress)\.v1(?:\.([a-z]{2}))?$/;

/**
 * Şema 1 → 2: her dilin buildSets/buildProgress kaydından yeni anahtarlar
 * YAZILIR; eski anahtarlar yerinde kalır. Yeni anahtar zaten varsa (yarım
 * göç, yeni sürümden yedek) üstüne yazılmaz.
 */
export function migrateBuildEntries(entries: Record<string, string>, now = new Date()): Record<string, string> {
  const langs = new Set<string>();
  for (const k of Object.keys(entries)) {
    const m = k.match(V1_KEY);
    if (m) langs.add(m[2] ?? "ar");
  }
  const out: Record<string, string> = { ...entries };
  for (const lang of langs) {
    const L = lang as LanguageId;
    const sets = parseJson<unknown[]>(entries[buildStoreKey(BUILD_KEYS.sets1, L)], []);
    const prog = parseJson<Record<string, unknown>>(entries[buildStoreKey(BUILD_KEYS.progress1, L)], {});
    const r = migrateBuildLang(Array.isArray(sets) ? sets : [], prog, L, now);
    const put = (base: string, value: unknown) => {
      const key = buildStoreKey(base, L);
      if (out[key] === undefined) out[key] = JSON.stringify(value);
    };
    put(BUILD_KEYS.sets2, r.sets);
    put(BUILD_KEYS.progress2, r.progress);
    put(BUILD_KEYS.blocks, r.blocks);
    put(BUILD_KEYS.memory, r.memory);
    put(BUILD_KEYS.history, r.history);
    put(BUILD_KEYS.ui, r.ui);
  }
  return out;
}

// ===========================================================================
// OTURMA MANTIĞI (tasarım §4.5, §6)
// ===========================================================================

/** (a) Yardımsız söylenmiş FARKLI odak cümlesi sayısı. */
export const MASTER_SENTENCES = 12;
/** (a) Son yardımsız ilk denemelerin isabeti. */
export const MASTER_ACCURACY = 0.85;
export const ACCURACY_WINDOW = 20;
/** (a) İsabet ancak bu kadar yardımsız deneme birikince anlamlı. */
export const MIN_ACCURACY_EVENTS = 8;
/** (b) Önizlemesiz geri dönüş: farklı cümle ve farklı set sayısı. */
export const MASTER_RECYCLED = 2;
/** (b) Kalıbın kullanıldığı farklı tema sayısı. */
export const MASTER_THEMES = 2;
/** (e) Son K olayda tuzak olmamalı. */
export const TRAP_WINDOW = 6;
/** (f) Gecikmeli kanıt: ilk kanıttan en az bu kadar saat sonra. */
export const DELAY_HOURS = 20;
/** Oturmuş/doğrulanacak kalıbın tekrar aralıkları (gün), aşamaya göre. */
export const PATTERN_REVIEW_DAYS = [7, 21, 60, 150];
/** "Günümü anlat" yeniden teklif aralıkları (gün). */
export const RETELL_DAYS = [1, 4, 10];
/** Zayıf taş: en az bu kadar tuzak ya da bu kadar gündür kullanılmamış. */
export const WEAK_TRAP_MISS = 2;
export const WEAK_UNUSED_DAYS = 21;
export const RECYCLE_LIMIT = 10;
export const KNOWN_WORDS_LIMIT = 40;

const PROOF_CAP = 80;
const PROOF_KEYS_CAP = 400;
const RETRIEVAL_WINDOW = 10;
const LEARN_RECENT_CAP = 20;
const HOUR = 3_600_000;
/** Aynı oturumdaki ikinci yanlış ikinci "kaçırma" sayılmaz. */
const LAPSE_GAP_HOURS = 12;

/** Yardımsız söyleyişler: farklı cümle sayımına ve isabete girer. */
export const UNSCAFFOLDED: EvKind[] = ["oneshot", "linked", "reorder", "retell", "review", "probe"];
const PROOF_KINDS: EvKind[] = [...UNSCAFFOLDED, "transfer", "pair"];
/** Tekrar takvimini yürüten olaylar (oturmuş/doğrulanacak kalıpta). */
const REVIEW_KINDS: EvKind[] = ["review", "probe"];

export function newProgress(at: string): PatternProgress {
  return {
    v: 2,
    learn: { attempts: 0, firstTryOk: 0, recent: [] },
    proof: [],
    proofKeys: [],
    recycledKeys: [],
    recycledSets: [],
    themes: [],
    transferOk: 0,
    retrieval: [],
    lastAt: at,
    status: "new",
    srs: { stage: 0, lapses: 0 },
  };
}

const addUnique = (xs: string[], x: string, cap: number) => (xs.includes(x) ? xs : [...xs, x].slice(-cap));
const ms = (iso: string | undefined) => (iso ? Date.parse(iso) : NaN);

/** Bir kaydın kalıp tarafı: hangi kalıplar, hangi tema/set, odak cümlede mi. */
export interface RecordCtx {
  /** Kredi alan kalıplar (karma sette hepsi). */
  patternIds: string[];
  themeId: string;
  setId: string;
  /** Cümle odak kalıbı kullanıyor mu (CM-10: kalıp kredisi yalnız buradan). */
  usesFocus: boolean;
  /** Odak bu cümlede İLK kez mi öğretildi; değilse yardımsız kullanım "geri dönüş"tür. */
  focusIsNew?: boolean;
  /** Cümle, geri çağırma sorusu sorulabilen bir tuzak taşı ya da sistem dersi öğretiyor mu. */
  trapBlocks?: boolean;
}

/** Ekrandan gelen bir olay (tasarım §4.5). */
export interface MasteryEvent {
  k: EvKind;
  ok: 0 | 0.5 | 1;
  first: boolean;
  spoken: boolean;
  /** Cümle anahtarı (canonical son hedef). */
  sk: string;
  trap?: string;
  /** Önizlemesiz geri gelen taşı kullandı mı. */
  rec?: boolean;
  /** Geri gelen taşların anahtarları: geri dönüş kredisi taşın İLK kalıbına yazılır. */
  recKeys?: string[];
  /** Olayın dokunduğu taşlar (taş hafızası için). */
  blockKeys?: string[];
}

export interface MasteryState {
  progress: ProgressMap2;
  blocks: Record<string, BlockProgress>;
}

/** Kalıbın son OK kanıtının zamanı (tekrar vadesi buna göre). */
export function lastProofAt(p: PatternProgress): string {
  for (let i = p.proof.length - 1; i >= 0; i -= 1) if (p.proof[i].ok > 0) return p.proof[i].at;
  return p.lastAt;
}

/**
 * Tekrar sonucu kalıbın durumunu yürütür (§6.1): doğrulanacak kalıp bir
 * doğru tekrarla oturur; oturmuş kalıbın aşaması ilerler; yanlış "soluyor"
 * yapar, art arda ikinci yanlış "öğreniyor"a döndürür ve nextFocus onu
 * yeniden getirir. Soluyan kalıbı yalnız GECİKMELİ bir doğru geri getirir:
 * aynı oturumdaki ikinci tekrar cümlesi kaçırmadan dakikalar sonra gelir,
 * kalıbın yeniden kanıtı sayılamaz — yoksa tekrar sırası sonucu belirlerdi.
 */
function reviewSrs(p: PatternProgress, ok: boolean, now: Date): void {
  if (p.status !== "mastered" && p.status !== "verify" && p.status !== "slipping") return;
  const at = now.toISOString();
  if (ok) {
    if (p.status === "verify") {
      p.status = "mastered";
      p.srs = { stage: 1, due: addDays(now, PATTERN_REVIEW_DAYS[1]), lapses: 0 };
    } else if (p.status === "slipping") {
      const lapse = ms(p.srs.lapseAt);
      if (!Number.isNaN(lapse) && now.getTime() - lapse < LAPSE_GAP_HOURS * HOUR) return;
      // Kanıtla oturmuş kalıp ölçütleri hâlâ tutuyorsa geri döner; yoksa yeniden kanıtlanır.
      const back = p.masteredBy !== "proof" || isMastered(p, now);
      p.status = back ? "mastered" : "proving";
      if (!back) delete p.masteredBy;
      p.srs = { stage: 0, due: addDays(now, PATTERN_REVIEW_DAYS[0]), lapses: 0 };
    } else if (isPatternDue(p, now)) {
      const stage = Math.min(p.srs.stage + 1, PATTERN_REVIEW_DAYS.length - 1);
      p.srs = { stage, due: addDays(now, PATTERN_REVIEW_DAYS[stage]), lapses: 0 };
    }
    return;
  }
  const last = ms(p.srs.lapseAt);
  if (!Number.isNaN(last) && now.getTime() - last < LAPSE_GAP_HOURS * HOUR) return;
  const lapses = p.srs.lapses + 1;
  if (lapses >= 2) {
    p.status = "learning";
    delete p.masteredBy;
    p.srs = { stage: 0, lapses: 0, lapseAt: at };
  } else {
    // Soluyan kalıp hemen odağa gelir (nextFocus); tekrar kuyruğuna ertesi gün döner,
    // aynı gün aynı cümlelerle yeniden sorulup ezberden geçmesin.
    p.status = "slipping";
    p.srs = { stage: 0, due: addDays(now, MEMORY_INTERVALS[0]), lapses, lapseAt: at };
  }
}

/** Öğrenen/kanıtlayan kalıp bütün ölçütleri tuttuysa oturur ve tekrar takvimine girer. */
function settle(p: PatternProgress, now: Date): void {
  if ((p.status === "learning" || p.status === "proving") && isMastered(p, now)) {
    p.status = "mastered";
    p.masteredBy = "proof";
    p.srs = { stage: 0, due: addDays(now, PATTERN_REVIEW_DAYS[0]), lapses: 0 };
  }
}

/**
 * Kalıp ilerlemesine bir olay (§4.5). Kurallar:
 * - "copy" (yanlıştan/"Bilmiyorum"dan sonraki tekrar) HİÇBİR ŞEY saymaz;
 * - kalıp kredisi yalnız odak kalıbın geçtiği cümleden;
 * - rehberli adım yalnız ilk denemede ve yalnız "öğrenme"ye (gösterim);
 *   ilk denemedeki tuzak kanıt listesine "tuzak" olarak düşer (ölçüt e);
 * - yardımsız söyleyiş yalnız ilk denemede kanıttır; yazıyla "çok yakın"
 *   (0.5) tuzaksız kanıt sayılmaz, seste artikel yutulabilir (1);
 * - kanıtlanmış bir cümle yeniden söylenince (aynı seti tekrar oynamak)
 *   yalnız son tarih değişir — farklı cümle sayılmaz, isabete de girmez
 *   (CM-9); doğrusu da yanlışı da sayılmaz ki ezber seti tekrar oynamak
 *   isabeti ne şişirsin ne düşürsün. Yalnız tuzağı (e) için tutulur;
 * - geri çağırma pencereye (son 10), tuzaklıysa kanıt listesine de.
 */
export function creditPattern(map: ProgressMap2, ctx: RecordCtx, ev: MasteryEvent, now = new Date()): ProgressMap2 {
  if (ev.k === "copy" || !ctx.usesFocus || !ctx.patternIds.length) return map;
  const at = now.toISOString();
  const out: ProgressMap2 = { ...map };
  for (const id of ctx.patternIds) {
    const prev = out[id] ?? newProgress(at);
    const p: PatternProgress = {
      ...prev,
      learn: { ...prev.learn, recent: [...prev.learn.recent] },
      proof: [...prev.proof],
      srs: { ...prev.srs },
      lastAt: at,
    };
    if (ctx.trapBlocks) p.trapBlocks = true;
    const push = (rp = false) => {
      const e: ProofEvent = { k: ev.k, ok: ev.ok, first: ev.first, spoken: ev.spoken, sk: ev.sk, th: ctx.themeId, set: ctx.setId, rec: !!ev.rec, at };
      if (ev.trap) e.trap = ev.trap;
      if (rp) e.rp = true;
      p.proof = [...p.proof, e].slice(-PROOF_CAP);
    };
    if (ev.k === "guided") {
      if (!ev.first) continue;
      p.learn.attempts += 1;
      p.learn.firstTryOk += ev.ok > 0 ? 1 : 0;
      p.learn.recent = [...p.learn.recent, ev.ok > 0 ? 1 : 0].slice(-LEARN_RECENT_CAP);
      if (ev.trap) push();
      if (p.status === "new") p.status = "learning";
    } else if (ev.k === "retrieval") {
      p.retrieval = [...p.retrieval, ev.ok > 0 ? 1 : 0].slice(-RETRIEVAL_WINDOW);
      if (ev.trap) push();
    } else if (PROOF_KINDS.includes(ev.k)) {
      if (!ev.first) continue;
      const review = REVIEW_KINDS.includes(ev.k);
      const replay = UNSCAFFOLDED.includes(ev.k) && !review && p.proofKeys.includes(ev.sk);
      if (replay) {
        if (ev.trap) push(true);
        out[id] = p;
        continue;
      }
      push();
      const clean = ev.ok === 1;
      if (clean && UNSCAFFOLDED.includes(ev.k)) {
        p.proofKeys = addUnique(p.proofKeys, ev.sk, PROOF_KEYS_CAP);
        if (ctx.themeId) p.themes = addUnique(p.themes, ctx.themeId, 50);
        if (!p.firstProofAt) p.firstProofAt = at;
        if (p.status === "new" || p.status === "learning") p.status = "proving";
        // Odak bu cümlede yeni değilse, önizlemesiz yeniden kullanıldı: geri dönüş (ölçüt b).
        if (ctx.focusIsNew === false && !review && ctx.setId) {
          p.recycledKeys = addUnique(p.recycledKeys, ev.sk, PROOF_KEYS_CAP);
          p.recycledSets = addUnique(p.recycledSets, ctx.setId, 100);
        }
      }
      if (clean && (ev.k === "transfer" || ev.k === "pair")) p.transferOk += 1;
      if (review) reviewSrs(p, ev.ok > 0, now);
    }
    settle(p, now);
    out[id] = p;
  }
  return out;
}

/**
 * Geri dönüş kredisi (§4.5): önizlemesiz geri gelen bir taşı ilk denemede
 * doğru kullanmak, o taşın ÖĞRETİLDİĞİ kalıbın kanıtıdır — bu setin odak
 * kalıbının değil. Tek set yetmez; oturma farklı setlerden geri dönüş ister.
 * Eksik son ölçüt (b) ise kalıp burada oturur; kendi sıradaki olayını beklemez.
 */
export function creditRecycled(
  map: ProgressMap2,
  ctx: Pick<RecordCtx, "setId">,
  ev: MasteryEvent,
  blocks: Record<string, BlockProgress>,
  now = new Date()
): ProgressMap2 {
  if (ev.k === "copy" || ev.k === "retrieval" || !ev.first || ev.ok !== 1 || !ev.recKeys?.length) return map;
  const ids = new Set<string>();
  for (const key of ev.recKeys) {
    const first = blocks[key]?.firstPatternId;
    if (first) for (const id of patternIdsOf(first)) ids.add(id);
  }
  if (!ids.size) return map;
  const at = now.toISOString();
  const out: ProgressMap2 = { ...map };
  for (const id of ids) {
    const prev = out[id] ?? newProgress(at);
    const p: PatternProgress = {
      ...prev,
      srs: { ...prev.srs },
      recycledKeys: addUnique(prev.recycledKeys, ev.sk, PROOF_KEYS_CAP),
      recycledSets: addUnique(prev.recycledSets, ctx.setId, 100),
    };
    settle(p, now);
    out[id] = p;
  }
  return out;
}

/** Taş hafızası: geri çağırma, tuzak, üretim. Bilinmeyen taş atlanır (önce ensure). */
export function recordBlockEvent(
  blocks: Record<string, BlockProgress>,
  ev: MasteryEvent,
  now = new Date()
): Record<string, BlockProgress> {
  if (ev.k === "copy" || !ev.blockKeys?.length) return blocks;
  const out = { ...blocks };
  for (const key of ev.blockKeys) {
    const b = out[key];
    if (!b) continue;
    const n: BlockProgress = { ...b, lastSeen: now.toISOString() };
    if (ev.k === "retrieval") {
      if (ev.ok > 0) n.retrievalOk += 1;
      else n.retrievalMiss += 1;
    } else if (ev.first) {
      n.recent = [...(b.recent ?? []), ev.trap ? 0 : 1].slice(-6);
      if (ev.trap) n.trapMiss += 1;
      if (ev.ok === 1) {
        n.producedOk += 1;
        n.okKeys = addUnique(b.okKeys ?? [], ev.sk, 50);
        if (ev.rec) n.recycledOkKeys = addUnique(n.recycledOkKeys, ev.sk, 50);
      }
    }
    out[key] = n;
  }
  return out;
}

/** Tek olay: kalıp kredisi + geri dönüş kredisi + taş hafızası. */
export function recordEvent(st: MasteryState, ctx: RecordCtx, ev: MasteryEvent, now = new Date()): MasteryState {
  let progress = creditPattern(st.progress, ctx, ev, now);
  progress = creditRecycled(progress, ctx, ev, st.blocks, now);
  return { progress, blocks: recordBlockEvent(st.blocks, ev, now) };
}

// ---------------------------------------------------------------------------
// isMastered v2 ve kontrol listesi (§6.2)
// ---------------------------------------------------------------------------

export interface MasteryCheck {
  id: "a" | "acc" | "b" | "rec" | "c" | "d" | "e" | "f";
  label: string;
  ok: boolean;
}

/** Yardımsız ilk denemelerin son penceresi ve isabeti. */
export function unscaffoldedAccuracy(p: PatternProgress): { n: number; acc: number | null } {
  const evs = p.proof.filter((e) => e.first && !e.rp && UNSCAFFOLDED.includes(e.k)).slice(-ACCURACY_WINDOW);
  if (!evs.length) return { n: 0, acc: null };
  return { n: evs.length, acc: evs.reduce((a, e) => a + e.ok, 0) / evs.length };
}

/**
 * Geri çağırma ölçütü (d) aranır mı: kalıbın cümleleri sorulabilen bir tuzak
 * taşı ya da sistem dersi öğrettiyse (§6.2). Soru sorulamayan yapısal tuzak
 * (Arapçada eksik أَنْ) (d)'yi açmaz: hiç gelmeyecek bir kart kalıbı sonsuza
 * dek oturtmazdı. Eski kayıtlarda bayrak yok; orada geçmiş (sorulmuş soru ya
 * da düşülmüş tuzak) kalıbın tuzak taşıdığını gösterir.
 */
function needsRetrieval(p: PatternProgress): boolean {
  return !!p.trapBlocks || p.retrieval.length > 0 || p.proof.some((e) => !!e.trap);
}

/**
 * Oturma ölçütleri, ana ekrandaki kontrol listesi için (§6.2). Rehberli
 * isabet ("öğrenme isabeti") burada YOK: yalnız gösterimdir, oturmayı
 * belirlemez. Geri çağırma yalnız kalıbın tuzağı/sistemi varsa aranır.
 */
export function masteryChecklist(p: PatternProgress | undefined, now = new Date()): MasteryCheck[] {
  const keys = p?.proofKeys.length ?? 0;
  const { n, acc } = p ? unscaffoldedAccuracy(p) : { n: 0, acc: null };
  const out: MasteryCheck[] = [
    { id: "a", label: `${MASTER_SENTENCES} farklı cümle ${Math.min(keys, MASTER_SENTENCES)}/${MASTER_SENTENCES}`, ok: keys >= MASTER_SENTENCES },
  ];
  const accOk = n >= MIN_ACCURACY_EVENTS && acc !== null && acc >= MASTER_ACCURACY;
  if (n > 0) {
    out.push({
      id: "acc",
      label: n >= MIN_ACCURACY_EVENTS ? `isabet %${Math.round((acc ?? 0) * 100)}` : `isabet: ${n}/${MIN_ACCURACY_EVENTS} deneme`,
      ok: accOk,
    });
  }
  const rec = Math.min(p?.recycledKeys.length ?? 0, MASTER_RECYCLED);
  out.push({ id: "b", label: `${MASTER_THEMES} tema`, ok: (p?.themes.length ?? 0) >= MASTER_THEMES });
  out.push({
    id: "rec",
    label: `geri dönüş ${rec}/${MASTER_RECYCLED}`,
    ok: (p?.recycledKeys.length ?? 0) >= MASTER_RECYCLED && (p?.recycledSets.length ?? 0) >= 2,
  });
  out.push({ id: "c", label: "aktarım", ok: (p?.transferOk ?? 0) >= 1 });
  if (p && needsRetrieval(p)) {
    const last3 = p.retrieval.slice(-3);
    out.push({
      id: "d",
      label: "geri çağırma",
      ok: last3.length >= 2 && last3.reduce((a, b) => a + b, 0) >= 2 && last3[last3.length - 1] === 1,
    });
  }
  // (e) Yalnız kullanım başladıysa gösterilir: hiç denenmemiş kalıba "tuzak yok: eksik" demek yanıltır.
  if (p && p.proof.length) {
    out.push({ id: "e", label: "tuzak yok", ok: !p.proof.slice(-TRAP_WINDOW).some((e) => !!e.trap) });
  }
  const first = ms(p?.firstProofAt);
  const delayed =
    !!p && !Number.isNaN(first) && p.proof.some((e) => e.ok > 0 && !e.rp && e.k !== "guided" && ms(e.at) - first >= DELAY_HOURS * HOUR);
  out.push({ id: "f", label: "ertesi gün", ok: delayed });
  // Ölçütler zamana bağlı değil (vade ayrı); now imza tutarlılığı için.
  void now;
  return out;
}

/** Bütün ölçütler (a)–(f) tutuyor mu. */
export function isMastered(p: PatternProgress | undefined, now = new Date()): boolean {
  if (!p) return false;
  return masteryChecklist(p, now).every((c) => c.ok);
}

/** "12 farklı cümle 7/12 · 2 tema: eksik · aktarım: tamam · ertesi gün: eksik" (erişilebilirlik metni). */
export function checklistText(items: MasteryCheck[]): string {
  return items.map((c) => (c.id === "a" ? c.label : `${c.label}: ${c.ok ? "tamam" : "eksik"}`)).join(" · ");
}

// ---------------------------------------------------------------------------
// Taşlar: oturma, zayıflık, geri getirme listesi
// ---------------------------------------------------------------------------

/**
 * Taş oturdu (§6.2): ≥3 farklı cümlede ilk denemede doğru, ≥2 sette,
 * en az bir önizlemesiz geri dönüş ve son 3 kullanımda tuzak yok.
 */
export function isBlockMastered(b: BlockProgress | undefined): boolean {
  if (!b) return false;
  const distinct = b.okKeys ? b.okKeys.length : b.producedOk;
  const noTrap = b.recent ? !b.recent.slice(-3).includes(0) : b.trapMiss === 0;
  return distinct >= 3 && b.sets.length >= 2 && b.recycledOkKeys.length >= 1 && noTrap;
}

export function masteredBlockKeys(blocks: Record<string, BlockProgress>): string[] {
  return Object.entries(blocks)
    .filter(([, b]) => isBlockMastered(b))
    .map(([k]) => k);
}

/** Zayıf taş: iki kez tuzağa düşülmüş ya da 21 gündür kullanılmamış. */
export function isWeakBlock(b: BlockProgress, now = new Date()): boolean {
  const seen = ms(b.lastSeen);
  return b.trapMiss >= WEAK_TRAP_MISS || (!Number.isNaN(seen) && now.getTime() - seen >= WEAK_UNUSED_DAYS * DAY);
}

/**
 * Planın ÖĞRENİLMİŞ TAŞLAR listesi (CM-14): BÜTÜN temalardan, önce zayıf
 * taşlar (en çok tuzak, en eski), sonra oturmamışlar, en son oturmuşlar;
 * en fazla 10. Bağlaç taşı gönderilmez: cümle başına tek bağlaç kuralı var.
 */
export function recycleCandidates(blocks: Record<string, BlockProgress>, now = new Date(), limit = RECYCLE_LIMIT): string[] {
  const list = Object.values(blocks).filter((b) => b && b.target && b.kind !== "connector");
  const oldest = (a: BlockProgress, b: BlockProgress) => (a.lastSeen < b.lastSeen ? -1 : a.lastSeen > b.lastSeen ? 1 : 0);
  const weak = list.filter((b) => isWeakBlock(b, now)).sort((a, b) => b.trapMiss - a.trapMiss || oldest(a, b));
  const rest = list.filter((b) => !isWeakBlock(b, now));
  const open = rest.filter((b) => !isBlockMastered(b)).sort(oldest);
  const done = rest.filter((b) => isBlockMastered(b)).sort(oldest);
  const out: string[] = [];
  for (const b of [...weak, ...open, ...done]) {
    if (!out.includes(b.target)) out.push(b.target);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Planın bildiği kelimeler (P-G18): önce zorlanılan kartlar (öğrenci onları
 * yeniden duymalı), sonra en yeniler; en fazla 40.
 */
export function knownWords(cards: VocabCard[], limit = KNOWN_WORDS_LIMIT): string[] {
  const out: string[] = [];
  const add = (c: VocabCard) => {
    const w = c.arabic?.trim();
    if (w && !out.includes(w) && out.length < limit) out.push(w);
  };
  strugglingCards(cards, Math.floor(limit / 3)).forEach(add);
  [...cards].sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0)).forEach(add);
  return out;
}

// ---------------------------------------------------------------------------
// Cümle tekrarı (SentenceMemory, §6.3)
// ---------------------------------------------------------------------------

const dayOf = (iso: string | undefined) => (iso ? iso.slice(0, 10) : "");

/** İlk denemede doğru → bir aşama ileri; yanlış → aşama 0, yarın, lapses+1. */
export function scheduleMemory(item: SentenceMemory, ok: boolean, now = new Date()): SentenceMemory {
  const at = now.toISOString();
  if (ok) {
    const stage = Math.min(item.stage + 1, MEMORY_INTERVALS.length - 1);
    return { ...item, stage, dueAt: addDays(now, MEMORY_INTERVALS[stage]), lastOkAt: at, lastAt: at };
  }
  return { ...item, stage: 0, dueAt: addDays(now, MEMORY_INTERVALS[0]), lapses: item.lapses + 1, lastAt: at };
}

export function reviewMemory(list: SentenceMemory[], key: string, ok: boolean, now = new Date()): SentenceMemory[] {
  return list.map((m) => (m.key === key ? scheduleMemory(m, ok, now) : m));
}

export function isMemoryDue(m: SentenceMemory, now = new Date()): boolean {
  const d = ms(m.dueAt);
  return !Number.isNaN(d) && d <= now.getTime();
}

/**
 * Üst sınır 800: önce oturmuş (aşama ≥6, hiç kaçırılmamış) kayıtlar, sonra
 * en eskiler budanır. Sıra korunur.
 */
export function pruneMemory(list: SentenceMemory[], cap = MEMORY_CAP): SentenceMemory[] {
  if (list.length <= cap) return list;
  let over = list.length - cap;
  const drop = new Set<number>();
  list.forEach((m, i) => {
    if (over > 0 && m.stage >= 6 && m.lapses === 0) {
      drop.add(i);
      over -= 1;
    }
  });
  for (let i = 0; i < list.length && over > 0; i += 1) {
    if (!drop.has(i)) {
      drop.add(i);
      over -= 1;
    }
  }
  return list.filter((_, i) => !drop.has(i));
}

/** Kalıba göre sırayla karıştırır: aynı kalıbın cümleleri arka arkaya gelmesin. */
function interleave(items: SentenceMemory[]): SentenceMemory[] {
  const groups = new Map<string, SentenceMemory[]>();
  for (const m of items) {
    const g = m.patternIds[0] ?? "";
    groups.set(g, [...(groups.get(g) ?? []), m]);
  }
  const out: SentenceMemory[] = [];
  const lists = [...groups.values()];
  for (let i = 0; out.length < items.length; i += 1) {
    for (const l of lists) if (l[i]) out.push(l[i]);
  }
  return out;
}

/** Vadesi gelmiş oturmuş / doğrulanacak / soluyan kalıp mı (§6.4). */
export function isPatternDue(p: PatternProgress | undefined, now = new Date()): boolean {
  if (!p) return false;
  if (p.status !== "mastered" && p.status !== "verify" && p.status !== "slipping") return false;
  const due = p.srs.due
    ? ms(p.srs.due)
    : ms(lastProofAt(p)) + PATTERN_REVIEW_DAYS[Math.min(p.srs.stage, PATTERN_REVIEW_DAYS.length - 1)] * DAY;
  return Number.isNaN(due) || due <= now.getTime();
}

export interface ReviewItem {
  key: string;
  /** due: cümlenin kendi vadesi · pattern: vadesi gelen kalıp · recent: son setten ısınma. */
  why: "due" | "pattern" | "recent";
  /** İlerlemeye sayılır mı (son setten ısınma sayılmaz). */
  counted: boolean;
}

export interface ReviewPlan {
  items: ReviewItem[];
  /** Kayıtlı cümlesi yetmeyen vadeli kalıplar: yoklama ile 2 cümle tamamlanır. */
  probe: string[];
  duePatterns: string[];
  /** Yeniden anlatılacak eski set (günde bir). */
  retellSetId: string | null;
  /** "Tekrar zamanı (n)": sayılan kart sayısı. */
  total: number;
}

export interface ReviewOpts {
  ui?: Pick<BuildUi, "retells">;
  /** Var olan setler (anlatım için). */
  setIds?: string[];
  /** Son setten 2 ısınma cümlesi. */
  lastSetId?: string | null;
  /** Yalnız bu kalıbın tekrarı (merdivenden "Tek seferde tekrar", "tekrar doğrula"). */
  onlyPattern?: string;
}

/**
 * "Tekrar zamanı" kuyruğu (§6.3–6.4): vadesi gelmiş cümleler (günde en fazla
 * 12, kalıba göre karışık), vadesi gelen her kalıptan 2 tek seferlik cümle
 * (yetmezse yoklama), son setten 2 ısınma ve bir eski hikâye anlatımı.
 * Oturmuş kalıp ASLA yeni rehberli setle yeniden kurulmaz (CM-13): tekrarı
 * buradan, tek seferde gelir.
 */
export function reviewQueue(progress: ProgressMap2, memory: SentenceMemory[], now = new Date(), opts: ReviewOpts = {}): ReviewPlan {
  const only = opts.onlyPattern;
  const pool = only ? memory.filter((m) => m.patternIds.includes(only)) : memory;
  const today = dayOf(now.toISOString());
  const doneToday = memory.filter((m) => dayOf(m.lastAt) === today).length;
  const cap = only ? MEMORY_DAILY_CAP : Math.max(0, MEMORY_DAILY_CAP - doneToday);
  const due = pool.filter((m) => isMemoryDue(m, now)).sort((a, b) => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0));
  const picked = interleave(due).slice(0, cap);
  const items: ReviewItem[] = picked.map((m) => ({ key: m.key, why: "due", counted: true }));
  const has = new Set(items.map((i) => i.key));

  const duePatterns = (only ? [only] : PATTERN_LADDER.map((p) => p.id)).filter((id) => (only ? true : isPatternDue(progress[id], now)));
  const probe: string[] = [];
  for (const id of duePatterns) {
    let n = picked.filter((m) => m.patternIds.includes(id)).length;
    const extra = memory
      .filter((m) => m.patternIds.includes(id) && m.focus !== false && !has.has(m.key))
      .sort((a, b) => a.stage - b.stage || (a.dueAt < b.dueAt ? -1 : 1));
    for (const m of extra) {
      if (n >= 2) break;
      items.push({ key: m.key, why: "pattern", counted: true });
      has.add(m.key);
      n += 1;
    }
    if (n < 2) probe.push(id);
  }

  if (!only && opts.lastSetId && items.length) {
    const warm = memory.filter((m) => m.setId === opts.lastSetId && !has.has(m.key)).slice(-2);
    for (const m of warm) items.push({ key: m.key, why: "recent", counted: false });
  }

  let retellSetId: string | null = null;
  if (!only) {
    const ids = new Set(opts.setIds ?? []);
    const dueRetell = Object.entries(opts.ui?.retells ?? {})
      .filter(([id, r]) => ids.has(id) && ms(r.due) <= now.getTime())
      .sort((a, b) => (a[1].due < b[1].due ? -1 : 1));
    retellSetId = dueRetell[0]?.[0] ?? null;
  }
  const total = items.filter((i) => i.counted).length + probe.length * 2 + (retellSetId ? 1 : 0);
  return { items, probe, duePatterns, retellSetId, total };
}

/** Set sonu anlatımı yapıldı ya da geçildi: 1 gün sonra yeniden teklif. */
export function scheduleRetell(ui: BuildUi, setId: string, now = new Date()): BuildUi {
  if (ui.retells?.[setId]) return ui;
  return { ...ui, retells: { ...(ui.retells ?? {}), [setId]: { stage: 0, due: addDays(now, RETELL_DAYS[0]) } } };
}

/** Tekrardaki anlatım bitti: 1 → 4 → 10 gün; sonra takvimden çıkar. */
export function advanceRetell(ui: BuildUi, setId: string, now = new Date()): BuildUi {
  const cur = ui.retells?.[setId];
  if (!cur) return ui;
  const retells = { ...(ui.retells ?? {}) };
  const stage = cur.stage + 1;
  if (stage >= RETELL_DAYS.length) delete retells[setId];
  else retells[setId] = { stage, due: addDays(now, RETELL_DAYS[stage]) };
  return { ...ui, retells };
}

// ---------------------------------------------------------------------------
// Sıradaki kalıp (§6.5)
// ---------------------------------------------------------------------------

export type FocusKind = "slipping" | "verify" | "override" | "learn" | "above" | "karma";

export interface Focus {
  kind: FocusKind;
  /** Karma sette 2–3 kalıp; diğerlerinde tek. */
  patterns: Pattern[];
}

const LEGACY = new Set(LEGACY_PATTERN_IDS);

/** Merdivende "geçilmiş" (oturmuş ya da doğrulanmayı bekleyen). */
export function isDone(p: PatternProgress | undefined): boolean {
  return p?.status === "mastered" || p?.status === "verify";
}

function highestDone(map: ProgressMap2): number {
  let highest = -1;
  PATTERN_LADDER.forEach((p, i) => {
    if (isDone(map[p.id])) highest = i;
  });
  return highest;
}

/**
 * v2'de eklenen, öğrencinin geçtiği en üst kalıbın ALTINDA kalan yeni
 * basamaklar (§8): dayatılmaz; ana ekranda 2 cümlelik yoklama önerilir.
 */
export function pendingNewPatterns(map: ProgressMap2): Pattern[] {
  const highest = highestDone(map);
  return PATTERN_LADDER.filter((p, i) => i < highest && !LEGACY.has(p.id) && (map[p.id]?.status ?? "new") === "new");
}

/** Karma için oturmuş kalıplar: en zayıf (kaçırma, düşük isabet) ya da en eski önce, farklı seviyelerden 2–3. */
export function karmaPatterns(map: ProgressMap2, max = 3): Pattern[] {
  const done = PATTERN_LADDER.filter((p) => isDone(map[p.id]));
  const weakness = (p: Pattern) => {
    const pr = map[p.id]!;
    const acc = unscaffoldedAccuracy(pr).acc ?? 1;
    return { lapses: pr.srs.lapses, acc, at: lastProofAt(pr) };
  };
  const sorted = [...done].sort((a, b) => {
    const x = weakness(a);
    const y = weakness(b);
    return y.lapses - x.lapses || x.acc - y.acc || (x.at < y.at ? -1 : x.at > y.at ? 1 : 0);
  });
  const out: Pattern[] = [];
  const bands = new Set<Band>();
  for (const p of sorted) {
    if (out.length >= max) break;
    if (bands.has(p.band)) continue;
    bands.add(p.band);
    out.push(p);
  }
  // Tek seviyede oturmuş kalıp varsa aynı seviyeden ikinciyi al: karma yine iki kalıp ister.
  for (const p of sorted) {
    if (out.length >= 2) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * Sıradaki kalıp, öncelik sırasıyla (§6.5):
 * 1. soluyan ya da vadesi gelmiş doğrulanacak kalıp;
 * 2. öğrencinin seçtiği kalıp (focusOverride; oturmuşsa yok sayılır);
 * 3. seviyenin altında/içinde oturmamış ilk kalıp;
 * 4. seviyenin üstündeki ilk kalıp;
 * 5. merdiven bitti: KARMA — farklı seviyelerden 2–3 oturmuş kalıp.
 * Yeni basamaklar geçilmiş en üst kalıbın altındaysa 3–4'te atlanır
 * (yoklama yakalar); başka hiçbir şey kalmadıysa yine gelir.
 */
export function nextFocus(map: ProgressMap2, band: Band, now = new Date(), override?: string): Focus {
  const slip = PATTERN_LADDER.find((p) => map[p.id]?.status === "slipping");
  if (slip) return { kind: "slipping", patterns: [slip] };
  const ver = PATTERN_LADDER.find((p) => map[p.id]?.status === "verify" && isPatternDue(map[p.id], now));
  if (ver) return { kind: "verify", patterns: [ver] };
  const over = override ? patternById(override) : undefined;
  if (over && !isDone(map[over.id])) return { kind: "override", patterns: [over] };
  const bi = bandIndex(band);
  const highest = highestDone(map);
  // Yalnız HİÇ başlanmamış yeni basamak atlanır; öğrenmeye açılmış olan (ör. yoklamada kalan) sıradadır.
  const open = (p: Pattern, i: number) =>
    !isDone(map[p.id]) && (LEGACY.has(p.id) || i > highest || (map[p.id]?.status ?? "new") !== "new");
  const at = PATTERN_LADDER.find((p, i) => bandIndex(p.band) <= bi && open(p, i));
  if (at) return { kind: "learn", patterns: [at] };
  const above = PATTERN_LADDER.find((p, i) => bandIndex(p.band) > bi && open(p, i));
  if (above) return { kind: "above", patterns: [above] };
  const left = PATTERN_LADDER.find((p) => !isDone(map[p.id]));
  if (left) return { kind: bandIndex(left.band) <= bi ? "learn" : "above", patterns: [left] };
  const karma = karmaPatterns(map);
  if (karma.length >= 2) return { kind: "karma", patterns: karma };
  return { kind: "learn", patterns: [PATTERN_LADDER[PATTERN_LADDER.length - 1]] };
}

/** Karma setin kimliği: "karma:a+b(+c)". */
export function karmaId(patterns: Pick<Pattern, "id">[]): string {
  return patterns.length > 1 ? `karma:${patterns.map((p) => p.id).join("+")}` : patterns[0]?.id ?? "";
}

// ---------------------------------------------------------------------------
// Yerleştirme, "Sına ve geç" (§6.5)
// ---------------------------------------------------------------------------

/** Yoklamada bir kalıbın cevapları (ilk denemeler). */
export interface ProbeOutcome {
  oks: number[];
  trap: boolean;
}

/** Konuşma seviyesi A2+ ve hiç ilerleme yoksa yerleştirme önerilir. */
export function shouldOfferPlacement(map: ProgressMap2, ui: Pick<BuildUi, "placementDone">, band: Band): boolean {
  if (ui.placementDone || bandIndex(band) < bandIndex("A2")) return false;
  return Object.values(map).every((p) => !p || p.status === "new");
}

/** Seviyeye kadar yoklanan kalıplar (merdiven sırasıyla, probe işaretliler). */
export function placementPatterns(band: Band): Pattern[] {
  const bi = bandIndex(band);
  return PATTERN_LADDER.filter((p) => p.probe && bandIndex(p.band) <= bi);
}

/** Yoklamada geçti mi: `need` doğru (ilk denemede) ve hiç tuzak yok. */
export function probePassed(o: ProbeOutcome | undefined, need: number): boolean {
  if (!o || o.trap) return false;
  return o.oks.filter((x) => x > 0).length >= need;
}

/** Yoklamayla geçilen kalıp: "verify" (merdiven atlar, 2–3 gün sonra tekrarla doğrulanır). */
function markVerify(p: PatternProgress | undefined, at: string, due: string): PatternProgress {
  const base = p ?? newProgress(at);
  return { ...base, status: "verify", masteredBy: "test", srs: { stage: 0, due, lapses: 0 } };
}

function markLearning(p: PatternProgress | undefined, at: string): PatternProgress {
  const base = p ?? newProgress(at);
  return base.status === "new" ? { ...base, status: "learning" } : base;
}

/**
 * Yerleştirme sonucu (§6.5). Her yoklanan kalıp 2/2 doğru ve tuzaksızsa
 * "verify"; ilk kalan kalıp odak olur ("learning"). Yoklanmayan kalıplar
 * (probe işareti yok) ilk kalan kalıbın ALTINDA ve seviyenin içindeyse
 * temsilcileri geçtiği için "verify" sayılır — o da tekrarla doğrulanır;
 * yoksa merdiven yine en baştan başlardı ve yerleştirme anlamsız kalırdı.
 */
export function applyPlacement(
  map: ProgressMap2,
  band: Band,
  outcomes: Record<string, ProbeOutcome>,
  now = new Date()
): { progress: ProgressMap2; focus: string | null } {
  const at = now.toISOString();
  const out: ProgressMap2 = { ...map };
  const asked = PATTERN_LADDER.filter((p) => outcomes[p.id]);
  let firstFail = -1;
  let lastAsked = -1;
  let k = 0;
  for (const p of asked) {
    const i = PATTERN_LADDER.indexOf(p);
    lastAsked = Math.max(lastAsked, i);
    if (probePassed(outcomes[p.id], 2)) {
      out[p.id] = markVerify(out[p.id], at, addDays(now, 2 + (k++ % 2)));
    } else {
      out[p.id] = markLearning(out[p.id], at);
      if (firstFail < 0 || i < firstFail) firstFail = i;
    }
  }
  const bi = bandIndex(band);
  // Temsilcileri geçilen bölge: ilk kalana kadar; hiç kalan yoksa sorulan son kalıba kadar.
  const until = firstFail >= 0 ? firstFail : lastAsked;
  let j = 0;
  PATTERN_LADDER.forEach((p, i) => {
    if (i >= until || outcomes[p.id] || bandIndex(p.band) > bi) return;
    if ((out[p.id]?.status ?? "new") !== "new") return;
    out[p.id] = markVerify(out[p.id], at, addDays(now, 3 + (j++ % LEGACY_SPREAD_DAYS)));
  });
  return { progress: out, focus: firstFail >= 0 ? PATTERN_LADDER[firstFail].id : null };
}

/**
 * Yoklama sırasındaki ilerleme: bir parti yanlışsız biterse sonraki parti
 * (en fazla 8 kalıp) sorulur; ilk kalan kalıptan sonra yürüyüş durur.
 */
export function nextPlacementBatch(band: Band, outcomes: Record<string, ProbeOutcome>, size = 8): Pattern[] {
  const all = placementPatterns(band);
  if (all.some((p) => outcomes[p.id] && !probePassed(outcomes[p.id], 2))) return [];
  return all.filter((p) => !outcomes[p.id]).slice(0, size);
}

/**
 * "Sına ve geç": 4 tek seferlik cümleden 3'ü ilk denemede doğru ve tuzak
 * yok → "verify" (merdiven atlar, tekrarla doğrulanır). Olmazsa kalıp
 * öğrenmeye açılır.
 */
export function applyTestOut(
  map: ProgressMap2,
  patternId: string,
  o: ProbeOutcome,
  now = new Date()
): { progress: ProgressMap2; passed: boolean } {
  const at = now.toISOString();
  const passed = probePassed(o, 3);
  const cur = map[patternId];
  if (isDone(cur)) return { progress: map, passed };
  return {
    progress: { ...map, [patternId]: passed ? markVerify(cur, at, addDays(now, 2)) : markLearning(cur, at) },
    passed,
  };
}

/** Yeni basamak yoklaması (2/2 → verify, değilse öğrenmeye). */
export function applyNewStepProbe(map: ProgressMap2, outcomes: Record<string, ProbeOutcome>, now = new Date()): ProgressMap2 {
  const at = now.toISOString();
  const out: ProgressMap2 = { ...map };
  let k = 0;
  for (const [id, o] of Object.entries(outcomes)) {
    if (isDone(out[id])) continue;
    out[id] = probePassed(o, 2) ? markVerify(out[id], at, addDays(now, 2 + (k++ % 2))) : markLearning(out[id], at);
  }
  return out;
}
