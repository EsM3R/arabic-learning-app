/**
 * Cümle Kurma ekranının KAYIT kuralları (React yok, saf).
 *
 * Ekran bir denemeyi hemen yazmaz: olaylar "bekleyen" tutulur ve öğrenci
 * ilerleyince ya da yeniden denerken işlenir. Sebep "Ses tanıma yanlış
 * duydu, sayma" düğmesi: yanlış duyulmuş bir denemenin kaydı iz bırakmadan
 * silinebilmeli.
 *
 * Kurallar (tasarım §4.5):
 * - Rehberli adım yalnız İLK denemede sayılır ve yalnız "öğrenme" hanesine
 *   (gösterim); oturma kararını belirlemez. İlk denemedeki tuzak hatası
 *   ayrıca kanıt listesine "tuzak" olarak düşer.
 * - Yanlıştan ya da "Bilmiyorum"dan sonraki tekrar "copy"dir: hiçbir şey
 *   saymaz (doğrusunu gördükten sonra söylemek bilmek değildir).
 * - Tek seferde, bağlantılı, sıralama, anlatım, tekrar: yardımsız kanıt
 *   (yalnız ilk deneme). Aktarım ve eş: kanıt + aktarım sayacı.
 * - Kalıp kredisi yalnız odak kalıbın geçtiği cümlelerden (usesFocus).
 */
import { memoryItem, MEMORY_CAP, patternIdsOf } from "../../buildmastery";
import type {
  BlockProgress,
  BuildUi,
  EvKind,
  PatternProgress,
  ProgressMap2,
  ProofEvent,
  SentenceMemory,
} from "../../buildmastery";
import { blockKey } from "../../sentencebuilding";
import type { BuildBlock, BuildSet } from "../../sentencebuilding";

export interface BuildEvent {
  k: EvKind;
  ok: 0 | 0.5 | 1;
  first: boolean;
  spoken: boolean;
  /** Cümle anahtarı (canonical son hedef). */
  sk: string;
  /** Hangi cümlenin olayı (kalıp kredisi o cümlenin usesFocus'una bağlı). */
  si: number;
  trap?: string;
  /** Önizlemesiz geri gelen taşı kullandı mı. */
  rec?: boolean;
  /** Geri gelen taşların anahtarları: geri dönüş kredisi taşın İLK kalıbına yazılır. */
  recKeys?: string[];
  /** Olayın dokunduğu taşlar (taş hafızası için). */
  blockKeys?: string[];
}

const PROOF_CAP = 80;
const PROOF_KEYS_CAP = 400;
const RECENT_CAP = 20;
const RETRIEVAL_WINDOW = 10;

/** Yardımsız söyleyişler: farklı cümle sayımına girer. */
const UNSCAFFOLDED: EvKind[] = ["oneshot", "linked", "reorder", "retell", "review", "probe"];
const PROOF_KINDS: EvKind[] = [...UNSCAFFOLDED, "transfer", "pair"];

function freshProgress(now: string): PatternProgress {
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
    lastAt: now,
    status: "new",
    srs: { stage: 0, lapses: 0 },
  };
}

const addUnique = (xs: string[], x: string, cap: number) => (xs.includes(x) ? xs : [...xs, x].slice(-cap));

/** Kalıp ilerlemesine bir olay (karma sette her kalıba). */
export function applyEvent(map: ProgressMap2, set: BuildSet, ev: BuildEvent, now = new Date()): ProgressMap2 {
  if (ev.k === "copy") return map;
  const s = set.sentences[ev.si];
  if (!s || !s.usesFocus) return map;
  const at = now.toISOString();
  const out: ProgressMap2 = { ...map };
  for (const id of patternIdsOf(set.patternId)) {
    const prev = out[id] ?? freshProgress(at);
    const p: PatternProgress = {
      ...prev,
      learn: { ...prev.learn, recent: [...prev.learn.recent] },
      proof: [...prev.proof],
      lastAt: at,
    };
    const push = (e: ProofEvent) => {
      p.proof = [...p.proof, e].slice(-PROOF_CAP);
    };
    const event = (): ProofEvent => {
      const e: ProofEvent = { k: ev.k, ok: ev.ok, first: ev.first, spoken: ev.spoken, sk: ev.sk, th: set.themeId, set: set.id, rec: !!ev.rec, at };
      if (ev.trap) e.trap = ev.trap;
      return e;
    };
    if (ev.k === "guided") {
      if (!ev.first) continue;
      p.learn.attempts += 1;
      p.learn.firstTryOk += ev.ok > 0 ? 1 : 0;
      p.learn.recent = [...p.learn.recent, ev.ok > 0 ? 1 : 0].slice(-RECENT_CAP);
      // Rehberli ilk denemedeki tuzak, "son kullanımlarda tuzak yok" ölçütüne sayılır.
      if (ev.trap) push(event());
      if (p.status === "new") p.status = "learning";
    } else if (ev.k === "retrieval") {
      p.retrieval = [...p.retrieval, ev.ok > 0 ? 1 : 0].slice(-RETRIEVAL_WINDOW);
    } else if (PROOF_KINDS.includes(ev.k)) {
      if (!ev.first) continue;
      push(event());
      if (ev.ok > 0) {
        // Yazıyla "çok yakın" (0.5) tuzaksız kanıt sayılmaz; seste artikel yutulabilir.
        const clean = ev.ok === 1;
        if (UNSCAFFOLDED.includes(ev.k) && clean) {
          p.proofKeys = addUnique(p.proofKeys, ev.sk, PROOF_KEYS_CAP);
          p.themes = addUnique(p.themes, set.themeId, 50);
          if (!p.firstProofAt) p.firstProofAt = at;
          if (p.status === "new" || p.status === "learning") p.status = "proving";
        }
        if ((ev.k === "transfer" || ev.k === "pair") && clean) p.transferOk += 1;
      }
    }
    out[id] = p;
  }
  return out;
}

/**
 * Geri dönüş kredisi (tasarım §4.5): önizlemesiz geri gelen bir taşı ilk
 * denemede doğru kullanmak, o taşın ÖĞRETİLDİĞİ kalıbın kanıtıdır — bu
 * setin odak kalıbının değil. Rehberli adım da sayılır: taşın kendisi
 * gösterilmeden geldi, öğrenci onu hatırlayarak kurdu. Tek set yetmez;
 * oturma ölçütü farklı setlerden geri dönüş ister (recycledSets).
 */
export function applyRecycledCredit(
  map: ProgressMap2,
  set: BuildSet,
  ev: BuildEvent,
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
    const prev = out[id] ?? freshProgress(at);
    out[id] = {
      ...prev,
      recycledKeys: addUnique(prev.recycledKeys, ev.sk, PROOF_KEYS_CAP),
      recycledSets: addUnique(prev.recycledSets, set.id, 100),
    };
  }
  return out;
}

/** Taş hafızası: geri çağırma, tuzak, üretim. Bilinmeyen taş atlanır. */
export function applyBlockEvent(
  blocks: Record<string, BlockProgress>,
  ev: BuildEvent,
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
      if (ev.trap) n.trapMiss += 1;
      if (ev.ok === 1) {
        n.producedOk += 1;
        if (ev.rec) n.recycledOkKeys = addUnique(n.recycledOkKeys, ev.sk, 50);
      }
    }
    out[key] = n;
  }
  return out;
}

/** Taşın hafızadaki ilk kaydı: ilk not/karşıtlık ve öğretildiği kalıp saklanır. */
function freshBlock(b: BuildBlock, set: BuildSet, si: number, at: string): BlockProgress {
  const note = b.recycled?.firstNote ?? b.note;
  const contrast = b.recycled?.firstContrast ?? b.contrast;
  return {
    target: b.target,
    tr: b.tr,
    kind: b.kind,
    note,
    contrast,
    firstPatternId: set.patternId,
    firstSetId: set.id,
    firstSentence: si,
    contrastShown: contrast !== "",
    producedOk: 0,
    recycledOkKeys: [],
    sets: [set.id],
    trapMiss: 0,
    retrievalOk: 0,
    retrievalMiss: 0,
    lastSeen: at,
  };
}

/**
 * Biten cümlenin taşları hafızaya yazılır: sonraki setler onları "Bunu
 * öğrendik" olarak geri getirir ve karşıtlığı bir daha göstermez.
 */
export function upsertSentenceBlocks(
  blocks: Record<string, BlockProgress>,
  set: BuildSet,
  si: number,
  now = new Date()
): Record<string, BlockProgress> {
  const s = set.sentences[si];
  if (!s || s.status !== "ready") return blocks;
  const out = { ...blocks };
  const at = now.toISOString();
  for (const b of s.blocks) {
    const key = b.key || blockKey(b.target, set.lang);
    if (!key) continue;
    const ex = out[key];
    out[key] = ex ? { ...ex, sets: ex.sets.includes(set.id) ? ex.sets : [...ex.sets, set.id], lastSeen: at } : freshBlock(b, set, si, at);
  }
  return out;
}

/**
 * Olayın dokunduğu, cümlede öğretilen ama hafızada henüz olmayan taşlar
 * olaydan ÖNCE açılır. Taşı öğreten cümlenin kendi olayları (ilk denemedeki
 * tuzak, üretim, eş/aktarım) özet kartından önce yazılır; kayıt yoksa
 * applyBlockEvent onları atlardı ve tuzağa düşülen taş sonra "oturdu"
 * sayılıp solabilirdi. Yalnız anılan taşlar açılır: öğrenci cümleyi yarıda
 * bırakırsa görmediği taşın karşıtlığı "gösterildi" sayılmaz.
 */
export function ensureBlocks(
  blocks: Record<string, BlockProgress>,
  set: BuildSet,
  si: number,
  keys: string[] | undefined,
  now = new Date()
): Record<string, BlockProgress> {
  const s = set.sentences[si];
  if (!s || s.status !== "ready" || !keys?.length) return blocks;
  let out = blocks;
  const at = now.toISOString();
  for (const key of keys) {
    if (!key || out[key]) continue;
    const b = s.blocks.find((x) => (x.key || blockKey(x.target, set.lang)) === key);
    if (!b) continue;
    if (out === blocks) out = { ...blocks };
    out[key] = freshBlock(b, set, si, at);
  }
  return out;
}

/** Biten cümle aralıklı tekrara girer (yarın, "tek seferde söyle"). */
export function addMemory(list: SentenceMemory[], set: BuildSet, si: number, now = new Date()): SentenceMemory[] {
  const due = new Date(now.getTime() + 86_400_000).toISOString();
  const item = memoryItem(set, si, due);
  if (!item || list.some((m) => m.key === item.key)) return list;
  return [...list, item].slice(-MEMORY_CAP);
}

/** Bağlaç kartı görüldü: karşıtlık bir daha gösterilmez, 3. bağlaçtan itibaren öğrenci böler. */
export function markConnSeen(ui: BuildUi, target: string, set: BuildSet): BuildUi {
  const k = blockKey(target, set.lang);
  if (!k) return ui;
  return { ...ui, connSeen: { ...ui.connSeen, [k]: (ui.connSeen[k] ?? 0) + 1 } };
}
