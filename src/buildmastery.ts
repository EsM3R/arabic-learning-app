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
 */
import type { LanguageId } from "./languages.ts";
import { blockKey, isMastered as isMasteredV1, trKey, upgradeSetV1 } from "./sentencebuilding.ts";
import type {
  BlockKind,
  BuildSet,
  BuildStep,
  PatternProgress as PatternProgressV1,
  Swap,
} from "./sentencebuilding.ts";

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
  firstProofAt?: string;
  lastAt: string;
  status: PatternStatus;
  masteredBy?: "proof" | "test" | "legacy";
  srs: { stage: number; due?: string; lapses: number };
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
  /** Yanlışta açılan rehberli yedek. */
  steps: Pick<BuildStep, "question" | "trPiece" | "target" | "note" | "move">[];
  blockKeys: string[];
  stage: number;
  dueAt: string;
  lapses: number;
  lastOkAt?: string;
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
      if (st.move) x.move = st.move;
      return x;
    }),
    blockKeys: s.blocks.map((b) => b.key),
    stage: 0,
    dueAt,
    lapses: 0,
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
