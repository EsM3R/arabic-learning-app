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
 *
 * Kuralların kendisi buildmastery.ts'te (saf ve testli); burası ekranın
 * set/cümle bilgisini kayıt bağlamına çevirir ve taş kaydını açar.
 */
import {
  creditPattern,
  creditRecycled,
  memoryItem,
  patternIdsOf,
  pruneMemory,
  recordBlockEvent,
} from "../../buildmastery";
import type { BlockProgress, BuildUi, MasteryEvent, ProgressMap2, RecordCtx, SentenceMemory } from "../../buildmastery";
import { systemById, trapById } from "../../buildmethod";
import { blockKey } from "../../sentencebuilding";
import type { BuildBlock, BuildSet } from "../../sentencebuilding";

/** Ekranın olayı: hangi cümlenin olayı olduğu da taşınır (kalıp kredisi o cümlenin usesFocus'una bağlı). */
export interface BuildEvent extends MasteryEvent {
  si: number;
}

/**
 * Cümle, geri çağırma sorusu sorulabilen bir tuzak taşı ya da sistem dersi
 * öğretiyor mu (ölçüt d). Yalnız eşli tuzak ve sorulu sistem sayılır:
 * yalnız onlar için geri çağırma kartı üretilebilir.
 */
function teachesRetrievable(set: BuildSet, si: number): boolean {
  const s = set.sentences[si];
  if (!s) return false;
  const trap = s.blocks.some((b) => !b.recycled && (b.trapIds ?? []).some((id) => !!trapById(set.lang, id)?.pair));
  return trap || (!!s.systemLesson && !!systemById(set.lang, s.systemLesson.id)?.retrieval);
}

/** Setteki bir cümlenin kayıt bağlamı (kalıplar, tema, odak). */
export function recordCtx(set: BuildSet, si: number): RecordCtx {
  const s = set.sentences[si];
  return {
    patternIds: patternIdsOf(set.patternId),
    themeId: set.themeId,
    setId: set.id,
    usesFocus: !!s?.usesFocus,
    focusIsNew: !!s?.focusIsNew,
    trapBlocks: teachesRetrievable(set, si),
  };
}

/** Kalıp ilerlemesine bir olay (karma sette her kalıba) — kurallar buildmastery.creditPattern'da. */
export function applyEvent(map: ProgressMap2, set: BuildSet, ev: BuildEvent, now = new Date()): ProgressMap2 {
  if (!set.sentences[ev.si]) return map;
  return creditPattern(map, recordCtx(set, ev.si), ev, now);
}

/** Geri dönüş kredisi taşın İLK kalıbına (buildmastery.creditRecycled). */
export function applyRecycledCredit(
  map: ProgressMap2,
  set: BuildSet,
  ev: BuildEvent,
  blocks: Record<string, BlockProgress>,
  now = new Date()
): ProgressMap2 {
  return creditRecycled(map, { setId: set.id }, ev, blocks, now);
}

/** Taş hafızası: geri çağırma, tuzak, üretim. Bilinmeyen taş atlanır. */
export function applyBlockEvent(
  blocks: Record<string, BlockProgress>,
  ev: BuildEvent,
  now = new Date()
): Record<string, BlockProgress> {
  return recordBlockEvent(blocks, ev, now);
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
  return pruneMemory([...list, item]);
}

/** Bağlaç kartı görüldü: karşıtlık bir daha gösterilmez, 3. bağlaçtan itibaren öğrenci böler. */
export function markConnSeen(ui: BuildUi, target: string, set: BuildSet): BuildUi {
  const k = blockKey(target, set.lang);
  if (!k) return ui;
  return { ...ui, connSeen: { ...ui.connSeen, [k]: (ui.connSeen[k] ?? 0) + 1 } };
}
