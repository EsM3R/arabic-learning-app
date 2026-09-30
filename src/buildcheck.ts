/**
 * CÜMLE KURMA — cevap denetimi (saf modül; tests/buildcheck.test.ts).
 *
 * Hocanın ölçüsü: öğrenci tuzağa düştüyse (ago/before, with/by, open/turn
 * on; Arapçada أَنْ'in unutulması, araçta مَعَ) bu "yakın" DEĞİLDİR, tam
 * olarak öğretilen şeydir. Ama ses tanımanın yuttuğu bir "the" yüzünden
 * doğru konuşan öğrenci cezalanmamalı. Eski "6+ kelimede tek fark = yakın"
 * kuralı bu iki durumu ayıramıyordu; burada farkın NE olduğuna bakılır.
 *
 * Akış (bkz. checkAnswer):
 *   1. Kabul kümesiyle birebir → doğru (alternatifle de doğru).
 *   2. Yalnız seste: sesteş kelime eşlenip yeniden denenir (to/two, by/buy).
 *   3. En yakın kabul biçimiyle kelime düzeyinde hizalanır.
 *   4. Fark öncelik sırasıyla sınıflanır: TUZAK → BAĞLAÇ/EK → BU ADIMDA
 *      EKLENEN → SIRA → KALIP → ZAMAN → GÜRÜLTÜ (yakın) → diğer.
 *
 * Bütün dönüşümler hedefe, alternatiflere ve cevaba SİMETRİK uygulanır;
 * textnorm.ts'teki ortak fonksiyonlar değişmez (kelime ve okuma aynı kalır).
 */
import { methodFor } from "./buildmethod.ts";
import type { ConnectorInfo, LangMethod, Trap } from "./buildmethod.ts";
import type { LanguageId } from "./languages.ts";
import type { ScriptId } from "./scripts.ts";
import type { StepVerdict, Swap, TenseFrame } from "./sentencebuilding.ts";
import { normalizeLatin, normalizeTarget } from "./textnorm.ts";

// ---------------------------------------------------------------------------
// Dil ↔ yazı sistemi
// ---------------------------------------------------------------------------

export function scriptOf(lang: LanguageId): ScriptId {
  if (lang === "ar") return "arabic";
  if (lang === "fa") return "persian";
  if (lang === "ru") return "cyrillic";
  return "latin";
}

/** Yalnız yazı sistemi bilinen eski çağrılar için tahmin (Latin → en). */
export function langForScript(script: ScriptId): LanguageId {
  if (script === "arabic") return "ar";
  if (script === "persian") return "fa";
  if (script === "cyrillic") return "ru";
  return "en";
}

// ---------------------------------------------------------------------------
// 4.1 canonicalTokens
// ---------------------------------------------------------------------------

/** İngilizce kısaltmalar: "I'm" ile "I am" aynı cevaptır. */
const EN_CONTRACTIONS: [RegExp, string][] = [
  [/\bi'm\b/g, "i am"],
  [/\b(you|we|they)'re\b/g, "$1 are"],
  [/\b(he|she|it|that|there|what|where|who)'s\b/g, "$1 is"],
  [/\b(i|you|we|they)'ve\b/g, "$1 have"],
  [/\b(i|you|he|she|we|they|it)'ll\b/g, "$1 will"],
  [/\b(i|you|he|she|we|they)'d\b/g, "$1 would"],
  [/\bcan't\b/g, "cannot"],
  [/\bcan not\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\bshan't\b/g, "shall not"],
  [/\b(\w+)n't\b/g, "$1 not"],
  [/\bgonna\b/g, "going to"],
  [/\bwanna\b/g, "want to"],
];

/**
 * Ses tanımanın ayrı yazabildiği bitişik ön ekler: "بال مترو" ile
 * "بالمترو" aynı söyleyiştir.
 */
const AR_STANDALONE = new Set(["ب", "ل", "ك", "و", "ف", "بال", "وال", "فال", "كال", "لل", "وب", "فب", "ول", "فل", "وك"]);

/** Normalize anahtarlı sayı sözlüğü (fünf → funf); dil başına bir kez. */
const NUM_CACHE = new Map<LanguageId, Map<string, string>>();
function numberMap(m: LangMethod): Map<string, string> {
  const hit = NUM_CACHE.get(m.id);
  if (hit) return hit;
  // Map: "constructor" gibi İngilizce kelimeler nesne prototipine takılmasın.
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(m.numberWords ?? {})) out.set(normalizeLatin(k), v);
  NUM_CACHE.set(m.id, out);
  return out;
}

/** Normalize metinde kalan ayraçlar (normalizeArabic ":" ve tırnakları bırakır). */
const LEFTOVER_PUNCT = /[:«»“”„"\[\]{}\/\\*_~|#]/g;

function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function joinProclitics(toks: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < toks.length; i += 1) {
    let t = toks[i];
    while (AR_STANDALONE.has(t) && i + 1 < toks.length) {
      i += 1;
      t += toks[i];
    }
    out.push(t);
  }
  return out;
}

/**
 * بال/وال/فال/كال/لل + kelime → ön ek + ال'li kelime. Böylece مَعَ ile بِـ
 * farkı, eksik ال, eksik مِنْ ve eksik أَنْ ayrı token olarak görünür.
 */
function splitAl(toks: string[]): string[] {
  const out: string[] = [];
  for (const t of toks) {
    if (/^[وف][بكل]ال/.test(t) && t.length >= 6) {
      out.push(t[0], t[1], t.slice(2));
    } else if (/^[وف]لل/.test(t) && t.length >= 5) {
      out.push(t[0], "ل", "ال" + t.slice(3));
    } else if (/^[بوفك]ال/.test(t) && t.length >= 5) {
      out.push(t[0], t.slice(1));
    } else if (/^لل/.test(t) && t.length >= 4) {
      out.push("ل", "ال" + t.slice(2));
    } else {
      out.push(t);
    }
  }
  return out;
}

/**
 * الساعه'den sonra sıra sayısı → rakam (her iki tarafta). Rakamla yazılan
 * saat (ASR "٧" yazar) böylece السابعه ile aynı olur. Asıl sayı kelimesi
 * (سبعه) BİLEREK katlanmaz: o Türk öğrencinin tuzağıdır (ar-ordinal).
 */
function foldHours(toks: string[], ordinals: Record<string, string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < toks.length; i += 1) {
    out.push(toks[i]);
    if (toks[i] !== "الساعه" || i + 1 >= toks.length) continue;
    const two = i + 2 < toks.length ? `${toks[i + 1]} ${toks[i + 2]}` : "";
    const own = (k: string) => Object.prototype.hasOwnProperty.call(ordinals, k);
    if (two && own(two)) {
      out.push(ordinals[two]);
      i += 2;
    } else if (own(toks[i + 1])) {
      out.push(ordinals[toks[i + 1]]);
      i += 1;
    }
  }
  return out;
}

/**
 * Karşılaştırma tokenları: büyük/küçük, noktalama, kısaltma, saat yazımı
 * (7pm = 7 p.m. = seven PM), tırnak ve tire farkı, Arapçada hareke/hamza ve
 * ASR'nin ayırdığı ön ekler yok sayılır.
 */
export function canonicalTokens(s: string, lang: LanguageId, script: ScriptId = scriptOf(lang)): string[] {
  const m = methodFor(lang);
  let t = String(s ?? "")
    .replace(/[‘’`´ʼ]/g, "'")
    .replace(/[–—‒]/g, " ");
  if (script === "latin") {
    t = t.toLowerCase();
    if (lang === "en") for (const [re, rep] of EN_CONTRACTIONS) t = t.replace(re, rep);
    t = normalizeTarget(t, script).replace(LEFTOVER_PUNCT, " ");
    const nums = numberMap(m);
    const raw = t.split(" ").filter(Boolean);
    const out: string[] = [];
    for (let i = 0; i < raw.length; i += 1) {
      const w = nums.get(raw[i]) ?? raw[i];
      // "a.m." / "p.m." noktalama silinince "a m" / "p m" olur; saatin
      // ardındaysa (ya da tek başına yazıldıysa) birleştir.
      if ((w === "a" || w === "p") && raw[i + 1] === "m" && (out.length === 0 || /^\d+$/.test(out[out.length - 1]))) {
        out.push(w + "m");
        i += 1;
        continue;
      }
      const glued = w.match(/^(\d{1,2})(am|pm)$/);
      if (glued) {
        out.push(glued[1], glued[2]);
        continue;
      }
      // "o'clock" → "o clock", "t.v." → "t v": tek token.
      if (w === "o" && raw[i + 1] === "clock") {
        out.push("oclock");
        i += 1;
        continue;
      }
      if (w === "t" && raw[i + 1] === "v") {
        out.push("tv");
        i += 1;
        continue;
      }
      out.push(w);
    }
    return out;
  }
  if (script === "arabic" || script === "persian") {
    t = normalizeTarget(toAsciiDigits(t), script).replace(LEFTOVER_PUNCT, " ");
    let toks = t.split(" ").filter(Boolean);
    if (script === "arabic") {
      toks = splitAl(joinProclitics(toks));
      if (m.hourOrdinals) toks = foldHours(toks, m.hourOrdinals);
    }
    return toks;
  }
  return normalizeTarget(t, script)
    .replace(LEFTOVER_PUNCT, " ")
    .split(" ")
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Dil sözlüğü (METHOD listelerinin karşılaştırma biçimi)
// ---------------------------------------------------------------------------

interface Lex {
  m: LangMethod;
  articles: Set<string>;
  markers: Set<string>;
  connectors: Set<string>;
  freq: Set<string>;
  chunks: { text: string; toks: string[] }[];
  trapTokens: Set<string>;
  homo: Map<string, Set<string>>;
  markerNote: Map<string, string>;
  connNote: Map<string, string>;
}

const LEX = new Map<LanguageId, Lex>();

function lex(lang: LanguageId): Lex {
  const hit = LEX.get(lang);
  if (hit) return hit;
  const m = methodFor(lang);
  const tok = (s: string) => canonicalTokens(s, m.id);
  const set = (xs: string[]) => new Set(xs.flatMap(tok));
  const homo = new Map<string, Set<string>>();
  for (const [a, b] of m.homophones) {
    const [x] = tok(a);
    const [y] = tok(b);
    if (!x || !y) continue;
    if (!homo.has(x)) homo.set(x, new Set());
    if (!homo.has(y)) homo.set(y, new Set());
    homo.get(x)!.add(y);
    homo.get(y)!.add(x);
  }
  const markerNote = new Map<string, string>();
  for (const [k, v] of Object.entries(m.markerNotes ?? {})) for (const x of tok(k)) markerNote.set(x, v);
  const connNote = new Map<string, string>();
  const connectors = new Set<string>();
  for (const c of Object.values(m.connectors)) {
    for (const x of tok(c.target)) {
      connectors.add(x);
      if (c.note && !connNote.has(x)) connNote.set(x, c.note);
    }
  }
  const trapTokens = new Set<string>();
  for (const tr of m.traps) for (const x of [...tr.wrong, ...tr.right]) for (const y of tok(x)) trapTokens.add(y);
  const out: Lex = {
    m,
    articles: set(m.articles),
    markers: new Set([...set(m.markers), ...(m.id === "ar" ? set(m.freqAdverbs) : [])]),
    connectors,
    freq: set(m.freqAdverbs),
    chunks: m.chunks.map((c) => ({ text: c, toks: tok(c) })).filter((c) => c.toks.length > 1),
    trapTokens,
    homo,
    markerNote,
    connNote,
  };
  LEX.set(lang, out);
  return out;
}

// ---------------------------------------------------------------------------
// Hizalama (kelime düzeyi DP + geri izleme)
// ---------------------------------------------------------------------------

export type AlignKind = "eq" | "sub" | "del" | "ins";

/**
 * Bir hizalama adımı. del = beklenen kelime cevapta yok; ins = cevapta
 * fazladan kelime. ei: beklenen dizindeki yer (ins için: araya girdiği
 * noktadaki sıradaki beklenen kelimenin dizini), gi: cevaptaki yer.
 */
export interface AlignOp {
  op: AlignKind;
  e?: string;
  g?: string;
  ei: number;
  gi: number;
}

export function alignTokens(exp: string[], giv: string[]): AlignOp[] {
  const n = exp.length;
  const m = giv.length;
  // Eşit maliyette EŞLEŞMESİ çok olan hizalama seçilir: "to" eksik + "now"
  // fazla, iki ayrı "değişti"den daha doğru bir açıklamadır (work eşleşir).
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const hits: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const move: AlignKind[][] = Array.from({ length: n + 1 }, () => new Array<AlignKind>(m + 1).fill("eq"));
  for (let i = 1; i <= n; i += 1) {
    cost[i][0] = i;
    move[i][0] = "del";
  }
  for (let j = 1; j <= m; j += 1) {
    cost[0][j] = j;
    move[0][j] = "ins";
  }
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const same = exp[i - 1] === giv[j - 1];
      const cands: [AlignKind, number, number][] = [
        [same ? "eq" : "sub", cost[i - 1][j - 1] + (same ? 0 : 1), hits[i - 1][j - 1] + (same ? 1 : 0)],
        ["del", cost[i - 1][j] + 1, hits[i - 1][j]],
        ["ins", cost[i][j - 1] + 1, hits[i][j - 1]],
      ];
      let best = cands[0];
      for (const c of cands.slice(1)) if (c[1] < best[1] || (c[1] === best[1] && c[2] > best[2])) best = c;
      move[i][j] = best[0];
      cost[i][j] = best[1];
      hits[i][j] = best[2];
    }
  }
  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const k = move[i][j];
    if (k === "eq" || k === "sub") {
      ops.push({ op: k, e: exp[i - 1], g: giv[j - 1], ei: i - 1, gi: j - 1 });
      i -= 1;
      j -= 1;
    } else if (k === "del") {
      ops.push({ op: "del", e: exp[i - 1], ei: i - 1, gi: j });
      i -= 1;
    } else {
      ops.push({ op: "ins", g: giv[j - 1], ei: i, gi: j - 1 });
      j -= 1;
    }
  }
  return ops.reverse();
}

export function editDistance(a: string[], b: string[]): number {
  return alignTokens(a, b).filter((o) => o.op !== "eq").length;
}

/** En uzun ortak alt dizi: b'nin hangi tokenlarının a ile eşleştiği. */
function lcsMatched(a: string[], b: string[]): boolean[] {
  const n = a.length;
  const m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const matched = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      matched[j] = true;
      i += 1;
      j += 1;
    } else if (L[i + 1][j] >= L[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matched;
}

const sameArr = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function findRun(hay: string[], run: string[], from = 0): number {
  if (!run.length) return -1;
  for (let i = from; i + run.length <= hay.length; i += 1) {
    let ok = true;
    for (let k = 0; k < run.length; k += 1) {
      if (hay[i + k] !== run[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function countRun(hay: string[], run: string[]): number {
  let c = 0;
  let i = findRun(hay, run);
  while (i >= 0) {
    c += 1;
    i = findRun(hay, run, i + run.length);
  }
  return c;
}

const countOf = (xs: string[], t: string) => xs.filter((x) => x === t).length;

// ---------------------------------------------------------------------------
// Görünen kelime ↔ karşılaştırma tokenı
// ---------------------------------------------------------------------------

interface WordMap {
  words: string[];
  per: string[][];
  /** Kelime kelime token üretimi bütün metninkiyle aynıysa true. */
  aligned: boolean;
  whole: string[];
}

function wordMap(text: string, lang: LanguageId): WordMap {
  const words = text.split(/\s+/).filter(Boolean);
  const per = words.map((w) => canonicalTokens(w, lang));
  const whole = canonicalTokens(text, lang);
  return { words, per, whole, aligned: sameArr(per.flat(), whole) };
}

const TRAIL_PUNCT = /[.,!?;:،؛؟…]+$/;

/** Karşılaştırma tokenının görünen (harekeli) yazımı; bulunamazsa kendisi. */
function displayOf(text: string, lang: LanguageId, toks: string[]): string {
  const wm = wordMap(text, lang);
  return toks
    .map((t) => {
      const wi = wm.per.findIndex((p) => p.includes(t));
      return wi >= 0 ? wm.words[wi].replace(TRAIL_PUNCT, "") : t;
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// 4.2 Eşdeğer söyleyişler (swap)
// ---------------------------------------------------------------------------

export const MAX_SWAPS = 3;
export const MAX_SWAP_TOKENS = 6;
export const MAX_FORMS = 32;
const MAX_AT_ONCE = 3;

const swapKey = (s: Swap, lang: LanguageId) =>
  `${canonicalTokens(s.from.join(" "), lang).join(" ")}→${canonicalTokens(s.to.join(" "), lang).join(" ")}`;

const reverseSwap = (s: Swap): Swap => ({ from: s.to, to: s.from, label: s.label });

/**
 * Bir swap'ı metne uygular; görünen yazım (hareke, büyük harf, sondaki
 * noktalama) korunur. Kalıptaki parça metinde yoksa null.
 */
export function applySwap(text: string, sw: Swap, lang: LanguageId): string | null {
  const from = canonicalTokens(sw.from.join(" "), lang);
  if (!from.length) return null;
  const toText = sw.to.join(" ").trim();
  const wm = wordMap(text, lang);
  if (wm.aligned) {
    const owner: number[] = [];
    wm.per.forEach((p, wi) => p.forEach(() => owner.push(wi)));
    const flat = wm.per.flat();
    const pos = findRun(flat, from);
    if (pos < 0) return null;
    const w0 = owner[pos];
    const w1 = owner[pos + from.length - 1];
    if (owner.indexOf(w0) === pos && owner.lastIndexOf(w1) === pos + from.length - 1) {
      const trail = (wm.words[w1].match(TRAIL_PUNCT) ?? [""])[0];
      let rep = toText ? toText.replace(TRAIL_PUNCT, "") + trail : "";
      // Cümle başındaki büyük harf korunur: "Sometimes I go" → "From time to time I go".
      if (w0 === 0 && rep && /^[A-ZÀ-ÞА-Я]/.test(wm.words[0])) rep = rep[0].toUpperCase() + rep.slice(1);
      return [...wm.words.slice(0, w0), ...(rep ? [rep] : []), ...wm.words.slice(w1 + 1)].join(" ");
    }
  }
  // Kelime sınırına oturmayan eşleşme (bitişik ön ek): karşılaştırma biçiminde uygula.
  const pos = findRun(wm.whole, from);
  if (pos < 0) return null;
  const to = canonicalTokens(toText, lang);
  return [...wm.whole.slice(0, pos), ...to, ...wm.whole.slice(pos + from.length)].join(" ");
}

export interface AcceptedForm {
  /** Görünen biçim (öğrencinin seçtiği varyantla). */
  text: string;
  tokens: string[];
  /** Kalıptan farklı olarak kullanılan swap'lar. */
  used: Swap[];
  /** Eski (v1) adım alternatifi mi. */
  legacy?: boolean;
}

/**
 * Kabul kümesi: hedefe uygulanabilen swap'ların her alt kümesi (aynı anda
 * en fazla 3), en fazla 32 biçim, tekrarsız. Öğrencinin daha önce seçtiği
 * söyleyişler (choices) ÖNCE uygulanır: ilk biçim onun varyantıdır ve
 * sonraki adımların cevapları bu varyantla gösterilir; kalıptaki asıl hâl de
 * kabul kümesinde kalır.
 */
export function expandSwaps(target: string, swaps: Swap[], lang: LanguageId, choices: Swap[] = []): AcceptedForm[] {
  let base = target;
  const baseUsed: Swap[] = [];
  for (const c of choices) {
    const r = applySwap(base, c, lang);
    if (r !== null) {
      base = r;
      baseUsed.push(c);
    }
  }
  const seenSwap = new Set(baseUsed.map((s) => swapKey(s, lang)));
  const pool: { s: Swap; undo: boolean }[] = [];
  for (const s of swaps) {
    const k = swapKey(s, lang);
    if (seenSwap.has(k)) continue;
    seenSwap.add(k);
    pool.push({ s, undo: false });
  }
  for (const u of baseUsed) pool.push({ s: reverseSwap(u), undo: true });
  const usable = pool.filter((p) => applySwap(base, p.s, lang) !== null).slice(0, 12);

  const forms: AcceptedForm[] = [];
  const seen = new Set<string>();
  const push = (text: string, used: Swap[]) => {
    const tokens = canonicalTokens(text, lang);
    const k = tokens.join(" ");
    if (!tokens.length || seen.has(k) || forms.length >= MAX_FORMS) return;
    seen.add(k);
    forms.push({ text, tokens, used });
  };
  push(base, baseUsed);

  const combo = (size: number, start: number, acc: number[]) => {
    if (forms.length >= MAX_FORMS) return;
    if (acc.length === size) {
      let text: string | null = base;
      for (const i of acc) {
        text = text === null ? null : applySwap(text, usable[i].s, lang);
      }
      if (text === null) return;
      const undone = acc.filter((i) => usable[i].undo).map((i) => swapKey(reverseSwap(usable[i].s), lang));
      const used = [
        ...baseUsed.filter((u) => !undone.includes(swapKey(u, lang))),
        ...acc.filter((i) => !usable[i].undo).map((i) => usable[i].s),
      ];
      push(text, used);
      return;
    }
    for (let i = start; i < usable.length; i += 1) combo(size, i + 1, [...acc, i]);
  };
  for (let size = 1; size <= Math.min(MAX_AT_ONCE, usable.length); size += 1) combo(size, 0, []);
  return forms;
}

export interface SwapSources {
  /** Yapı taşları ve alternatifleri (a): span düzeyinde. */
  blocks?: { target: string; alts?: string[] }[];
  /** Modelin sw çiftleri: [kalıptaki, alternatif, etiket?]. */
  sw?: (Swap | [string, string] | [string, string, string])[];
  /** Arapçada erkek/kadın biçim çiftleri. */
  gender?: [string, string][];
  /** acceptDialect açıksa günlük dil karşılıkları eklenir. */
  dialect?: boolean;
  /** Eski adım alternatifleri: tek parçalık farktan swap çıkarılır. */
  stepAlts?: { target: string; alts: string[] }[];
}

const cleanWords = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w.replace(TRAIL_PUNCT, ""))
    .filter(Boolean);

/**
 * İki söyleyiş arasındaki TEK parçalık fark → swap (ortak baş ve son atılır).
 * "I take a shower" / "I have a shower" → take → have.
 */
export function spanSwap(a: string, b: string, lang: LanguageId): Swap | null {
  const aw = cleanWords(a);
  const bw = cleanWords(b);
  const ac = aw.map((w) => canonicalTokens(w, lang).join(" "));
  const bc = bw.map((w) => canonicalTokens(w, lang).join(" "));
  let p = 0;
  while (p < ac.length && p < bc.length && ac[p] === bc[p]) p += 1;
  let s = 0;
  while (s < ac.length - p && s < bc.length - p && ac[ac.length - 1 - s] === bc[bc.length - 1 - s]) s += 1;
  const from = aw.slice(p, aw.length - s);
  const to = bw.slice(p, bw.length - s);
  if (!from.length || !to.length) return null;
  if (from.length > MAX_SWAP_TOKENS || to.length > MAX_SWAP_TOKENS) return null;
  return { from, to };
}

/**
 * Cümle düzeyindeki swap listesi: blok alternatifleri (yalnız kalıptaki parça
 * son hedefte bitişik geçiyorsa), sw çiftleri, cinsiyet çiftleri, günlük dil,
 * eski adım alternatifleri. En fazla 3 swap, her yanda en fazla 6 token.
 */
export function deriveSwaps(finalTarget: string, src: SwapSources, lang: LanguageId): Swap[] {
  const target = canonicalTokens(finalTarget, lang);
  const out: Swap[] = [];
  const seen = new Set<string>();
  const add = (sw: Swap) => {
    if (out.length >= MAX_SWAPS) return;
    const f = canonicalTokens(sw.from.join(" "), lang);
    const t = canonicalTokens(sw.to.join(" "), lang);
    if (!f.length || !t.length || sameArr(f, t)) return;
    if (f.length > MAX_SWAP_TOKENS || t.length > MAX_SWAP_TOKENS) return;
    if (findRun(target, f) < 0) return;
    const k = swapKey(sw, lang);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(sw);
  };
  for (const b of src.blocks ?? []) {
    for (const alt of (b.alts ?? []).slice(0, 2)) add({ from: cleanWords(b.target), to: cleanWords(alt) });
  }
  for (const x of src.sw ?? []) {
    if (Array.isArray(x)) {
      const label = x[2] === "resmî" || x[2] === "günlük" || x[2] === "edebî" || x[2] === "dişil" ? x[2] : undefined;
      add({ from: cleanWords(x[0]), to: cleanWords(x[1]), ...(label ? { label } : {}) });
    } else if (x && Array.isArray(x.from) && Array.isArray(x.to)) {
      add(x);
    }
  }
  for (const [m, f] of src.gender ?? []) add({ from: cleanWords(m), to: cleanWords(f), label: "dişil" });
  if (src.dialect) {
    for (const [fus, gun] of methodFor(lang).dialectSwaps ?? []) add({ from: cleanWords(fus), to: cleanWords(gun), label: "günlük" });
  }
  for (const st of src.stepAlts ?? []) {
    for (const alt of st.alts) {
      const sw = spanSwap(st.target, alt, lang);
      if (sw) add(sw);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4.3 Denetim
// ---------------------------------------------------------------------------

export interface CheckCtx {
  lang: LanguageId;
  script?: ScriptId;
  /** Mikrofonla mı: sesteş eşleme, gürültü kredisi ve n-best yalnız seste. */
  spoken?: boolean;
  /** Cümlenin swap'ları ve öğrencinin önceki seçimleri. */
  swaps?: Swap[];
  choices?: Swap[];
  /** Bu adımda eklenen parça(lar); verilmezse prev'den çıkarılır. */
  added?: string[];
  prev?: string;
  /** Blok düzeyindeki kalıplar (METHOD.chunks'a ek). */
  chunks?: string[];
  tense?: TenseFrame;
  /** Adım notu: genel yanlışta gösterilir. */
  note?: string;
  /** Tuzağın sahibi bloğun ilk seferki karşıtlığı (tuzak metninin yerine). */
  trapText?: Record<string, string>;
}

export type CheckReason =
  | "exact"
  | "alt"
  | "homophone"
  | "prefer"
  | "trap"
  | "connector"
  | "marker"
  | "added"
  | "order"
  | "chunk"
  | "tense"
  | "noise"
  | "missing"
  | "extra"
  | "other";

export interface CheckResult {
  verdict: StepVerdict;
  reason: CheckReason;
  /** Kanıt kredisi: doğru 1; gürültü-yakın seste 1, yazıda 0.5. */
  credit: 0 | 0.5 | 1;
  /** Türkçe tek satır geri bildirim ("" = söylenecek bir şey yok). */
  feedback: string;
  trapId?: string;
  mini?: [string, string];
  /** Kıyaslanan kabul biçimi (öğrencinin varyantında, görünen yazımla). */
  expected: string;
  /** Kalıptaki ilk biçimden farklı bir kabul biçimiyle mi eşleşti. */
  viaAlt: boolean;
  used: Swap[];
  /** Değerlendirilen duyulan metin (n-best'te seçilen). */
  heard: string;
  heardIndex: number;
  ops: AlignOp[];
  missing: string[];
  extra: string[];
  adverb?: boolean;
  chunk?: string;
}

const RANK: Record<StepVerdict, number> = { dogru: 3, yakin: 2, yanlis: 1 };

/** Kabul kümesi: swap açılımı + eski adım alternatifleri. */
function acceptedForms(target: string, alts: string[], ctx: CheckCtx): AcceptedForm[] {
  const forms = expandSwaps(target, ctx.swaps ?? [], ctx.lang, ctx.choices ?? []);
  const seen = new Set(forms.map((f) => f.tokens.join(" ")));
  for (const a of alts ?? []) {
    const tokens = canonicalTokens(a, ctx.lang, ctx.script);
    const k = tokens.join(" ");
    if (!tokens.length || seen.has(k)) continue;
    seen.add(k);
    forms.push({ text: a, tokens, used: [], legacy: true });
  }
  return forms;
}

/** Bu adımda eklenen tokenlar (önceki adıma göre LCS dışında kalanlar). */
export function addedTokens(prev: string, cur: string, lang: LanguageId): string[] {
  const p = canonicalTokens(prev, lang);
  const c = canonicalTokens(cur, lang);
  const matched = lcsMatched(p, c);
  return c.filter((_, i) => !matched[i]);
}

function addedSet(target: string, ctx: CheckCtx): Set<string> {
  if (ctx.added && ctx.added.length) return new Set(ctx.added.flatMap((a) => canonicalTokens(a, ctx.lang)));
  if (ctx.prev) return new Set(addedTokens(ctx.prev, target, ctx.lang));
  return new Set();
}

const PREFER = /^(prefer|prefers|preferred)$/;

function ingForms(v: string): string[] {
  return [v + "ing", v.replace(/e$/, "") + "ing", v + v.slice(-1) + "ing", v.replace(/ie$/, "y") + "ing"];
}

/**
 * [D4] prefer + to V: videodaki biçim prefer + -ing, ama "prefer to go"
 * doğru İngilizce — doğru konuşanı cezalandırmamak için gizli bir swap gibi
 * kabul edilir, geri bildirimde videodaki biçim gösterilir.
 */
function preferToIng(g: string[], forms: AcceptedForm[]): { tokens: string[]; shown: string } | null {
  for (const f of forms) {
    const e = f.tokens;
    const out: string[] = [];
    let shown = "";
    for (let j = 0; j < g.length; j += 1) {
      if (PREFER.test(g[j]) && g[j + 1] === "to" && g[j + 2]) {
        const v = g[j + 2];
        const i = e.findIndex((t, k) => t === g[j] && (e[k + 1] ?? "").endsWith("ing") && ingForms(v).includes(e[k + 1]));
        if (i >= 0) {
          out.push(g[j], e[i + 1]);
          shown = `${e[i]} ${e[i + 1]}`;
          j += 2;
          continue;
        }
      }
      out.push(g[j]);
    }
    if (shown) return { tokens: out, shown };
  }
  return null;
}

/** Seste: hizalı beklenen kelimenin sesteşi olan cevap kelimesi beklenene çevrilir. */
function mapHomophones(e: string[], g: string[], lx: Lex): string[] {
  if (!lx.homo.size) return g;
  const out = [...g];
  for (const op of alignTokens(e, g)) {
    if (op.op === "sub" && op.e && op.g && lx.homo.get(op.e)?.has(op.g)) out[op.gi] = op.e;
  }
  return out;
}

/**
 * Arapça: ses tanıma "بمترو" yazdıysa ve beklenen "ب المترو" ise ön ek
 * ayrılır — fark yalnız ال olsun, "ب eksik" sanılmasın.
 */
function splitAttached(g: string[], e: string[]): string[] {
  const out: string[] = [];
  for (const t of g) {
    const p = t[0];
    const rest = t.slice(1);
    if (t.length >= 3 && "بلكوف".includes(p) && e.some((x, i) => x === p && (e[i + 1] ?? "").replace(/^ال/, "") === rest)) {
      out.push(p, rest);
    } else {
      out.push(t);
    }
  }
  return out;
}

function trapFires(trap: Trap, g: string[], e: string[]): boolean {
  if (trap.detect) return trap.detect(g, e);
  if (!trap.wrong.length || !trap.right.length) return false;
  return countRun(g, trap.wrong) > countRun(e, trap.wrong) && countRun(e, trap.right) > countRun(g, trap.right);
}

/** Gürültü sayılabilen tek fark (artikel; Arapçada ال / و-ف / gereksiz zamir). */
function isNoiseOp(op: AlignOp, lx: Lex): boolean {
  if (op.op === "del") return lx.articles.has(op.e ?? "");
  if (op.op === "ins") return lx.articles.has(op.g ?? "");
  if (op.op !== "sub") return true;
  const e = op.e ?? "";
  const g = op.g ?? "";
  if (lx.articles.has(e) && lx.articles.has(g)) return true;
  if (lx.m.id === "ar") {
    if (e.replace(/^ال/, "") === g.replace(/^ال/, "")) return true;
    if (e.replace(/^[وف]/, "") === g.replace(/^[وف]/, "")) return true;
  }
  return false;
}

function noiseText(ops: AlignOp[], spoken: boolean, form: AcceptedForm, lang: LanguageId): string {
  if (spoken) return "Doğru (ses tanıma artikeli yutmuş olabilir)";
  const parts = ops.map((o) => {
    if (o.op === "del") return `${displayOf(form.text, lang, [o.e ?? ""])} eksik`;
    if (o.op === "ins") return `${o.g} fazla`;
    return `${o.g} değil ${displayOf(form.text, lang, [o.e ?? ""])}`;
  });
  return `Çok yakın: ${parts.join(", ")}`;
}

const joinNote = (a: string, b?: string) => (b && b !== a ? `${a} · ${b}` : a);

function scoreOne(given: string, idx: number, forms: AcceptedForm[], ctx: CheckCtx, lx: Lex, added: Set<string>): CheckResult | null {
  const lang = ctx.lang;
  const spoken = !!ctx.spoken;
  const g0 = canonicalTokens(given, lang, ctx.script);
  if (!g0.length || !forms.length) return null;
  const base = forms[0];
  const make = (f: AcceptedForm, over: Partial<CheckResult> & Pick<CheckResult, "verdict" | "reason">, ops: AlignOp[] = []): CheckResult => {
    const credit: 0 | 0.5 | 1 = over.verdict === "dogru" ? 1 : over.verdict === "yakin" ? (spoken ? 1 : 0.5) : 0;
    return {
      credit,
      feedback: "",
      expected: f.text,
      viaAlt: f !== base || f.used.length > 0,
      used: f.used,
      heard: given,
      heardIndex: idx,
      ops,
      missing: ops.filter((o) => o.op === "del" || o.op === "sub").map((o) => o.e ?? ""),
      extra: ops.filter((o) => o.op === "ins" || o.op === "sub").map((o) => o.g ?? ""),
      ...over,
    };
  };
  const altNote = (f: AcceptedForm) => (f !== base || f.used.length ? `Doğru, bu da olur. Kalıptaki: ${base.text}` : "");

  // 1. Birebir (ya da kabul edilen alternatif).
  const key = g0.join(" ");
  const exact = forms.find((f) => f.tokens.join(" ") === key);
  if (exact) return make(exact, { verdict: "dogru", reason: exact === base && !exact.used.length ? "exact" : "alt", feedback: altNote(exact) });

  let g = g0;
  // [D4] prefer + to V.
  if (lang === "en") {
    const pr = preferToIng(g, forms);
    if (pr) {
      const hit = forms.find((f) => f.tokens.join(" ") === pr.tokens.join(" "));
      if (hit) {
        return make(hit, {
          verdict: "dogru",
          reason: "prefer",
          viaAlt: true,
          feedback: `Doğru. Videodaki biçim: ${pr.shown}; bu yöntemde -ing kullanıyoruz.`,
        });
      }
      g = pr.tokens;
    }
  }

  // 2. Yalnız seste: sesteşler (by/buy, to/two). Yazıda "buy" yanlış kalır.
  if (spoken) {
    for (const f of forms) {
      const mapped = mapHomophones(f.tokens, g, lx);
      if (sameArr(mapped, f.tokens)) {
        return make(f, { verdict: "dogru", reason: "homophone", feedback: altNote(f) || "Doğru (ses tanıma sesteş bir kelime duydu)." });
      }
    }
  }

  // 3. En yakın kabul biçimi.
  let best = forms[0];
  let bestG = spoken ? mapHomophones(best.tokens, g, lx) : g;
  let bestD = editDistance(best.tokens, bestG);
  for (const f of forms.slice(1)) {
    const gg = spoken ? mapHomophones(f.tokens, g, lx) : g;
    const dd = editDistance(f.tokens, gg);
    if (dd < bestD) {
      best = f;
      bestG = gg;
      bestD = dd;
    }
  }
  const e = best.tokens;
  const gv = lang === "ar" ? splitAttached(bestG, e) : bestG;
  const ops = alignTokens(e, gv);
  const diffs = ops.filter((o) => o.op !== "eq");
  const note = ctx.note ?? "";

  // 4. Sınıflama — öncelik sırası tasarımdaki tablo.
  // (1) TUZAK
  for (const trap of lx.m.traps) {
    if (!trapFires(trap, gv, e)) continue;
    const text = ctx.trapText?.[trap.id] || trap.text;
    const mini = trap.mini ? ` (${trap.mini[0]} ↔ ${trap.mini[1]})` : "";
    return make(best, { verdict: "yanlis", reason: "trap", trapId: trap.id, mini: trap.mini, feedback: text + mini }, ops);
  }

  // Eksik sayılan beklenen tokenlar (yer değiştirme eksik sayılmaz).
  const deficit = Array.from(new Set(e)).filter((t) => countOf(e, t) > countOf(gv, t));

  // (2) BAĞLAÇ / EK karşılığı
  const conn = deficit.find((t) => lx.connectors.has(t));
  if (conn) {
    const n = lx.connNote.get(conn) ?? `Bağlaç: ${displayOf(best.text, lang, [conn])}`;
    return make(best, { verdict: "yanlis", reason: "connector", feedback: n }, ops);
  }
  const mark = deficit.find((t) => lx.markers.has(t));
  if (mark) {
    const disp = displayOf(best.text, lang, [mark]);
    const n = lx.markerNote.get(mark) ?? `Burada ${disp} şart: ek karşılığı.`;
    return make(best, { verdict: "yanlis", reason: "marker", feedback: joinNote(n, note) }, ops);
  }

  // (3) BU ADIMDA EKLENEN parça eksik
  const addMiss = deficit.filter((t) => added.has(t));
  if (addMiss.length) {
    return make(best, { verdict: "yanlis", reason: "added", feedback: joinNote(`Bu adımın parçası: ${displayOf(best.text, lang, addMiss)}`, note) }, ops);
  }

  // (4) SIRA: aynı kelimeler, başka dizilim
  const sorted = (xs: string[]) => [...xs].sort().join(" ");
  if (sorted(e) === sorted(gv)) {
    const strip = (xs: string[]) => xs.filter((x) => !lx.freq.has(x));
    const adverb = e.some((x) => lx.freq.has(x)) && sameArr(strip(e), strip(gv));
    return make(best, { verdict: "yanlis", reason: "order", adverb, feedback: adverb ? lx.m.adverbRule : `Sıra: ${lx.m.slotOrder}` }, ops);
  }

  // (6) ZAMAN: alışkanlık setinde süreklilik yapısı. KALIP'tan önce bakılır:
  // "I am turning on" kalıbı (turn on) da bozar ama asıl hata zamandır; iki
  // kural çakışınca öğrenciye zamanın notu gösterilir.
  if (ctx.tense === "habit" && lx.m.progressive) {
    const re = lx.m.progressive;
    if (re.test(gv.join(" ")) && !re.test(e.join(" "))) {
      return make(best, { verdict: "yanlis", reason: "tense", feedback: "-iyor burada alışkanlık → geniş zaman." }, ops);
    }
  }

  // (5) KALIP bölünmüş (in morning, go to the bed)
  const chunkList = [
    ...(ctx.chunks ?? []).map((c) => ({ text: c, toks: canonicalTokens(c, lang) })),
    ...lx.chunks,
  ].filter((c) => c.toks.length > 1);
  for (const c of chunkList) {
    let s = findRun(e, c.toks);
    while (s >= 0) {
      const end = s + c.toks.length;
      const inside = diffs.some((o) => (o.op === "ins" ? o.ei > s && o.ei < end : o.ei >= s && o.ei < end));
      if (inside) {
        return make(best, { verdict: "yanlis", reason: "chunk", chunk: c.text, feedback: `Kalıp: ${c.text}, hep böyle.` }, ops);
      }
      s = findRun(e, c.toks, s + 1);
    }
  }

  // (7) GÜRÜLTÜ: yalnız artikel farkı, 6 kelimede en fazla 1 (en az 1)
  const allowed = Math.max(1, Math.floor(e.length / 6));
  if (diffs.length > 0 && diffs.length <= allowed && diffs.every((o) => isNoiseOp(o, lx))) {
    return make(best, { verdict: "yakin", reason: "noise", feedback: noiseText(diffs, spoken, best, lang) }, ops);
  }

  // (8) Diğer
  const onlyDel = diffs.every((o) => o.op === "del");
  const onlyIns = diffs.every((o) => o.op === "ins");
  return make(
    best,
    { verdict: "yanlis", reason: onlyDel ? "missing" : onlyIns ? "extra" : "other", feedback: note || `Beklenen: ${best.text}` },
    ops
  );
}

/**
 * Cevap denetimi. given tek metin ya da ses tanımanın n-best listesi
 * olabilir. Boş ya da yalnız noktalamadan oluşan cevapta null döner —
 * çağıran taraf bunu deneme saymamalı.
 *
 * n-best kuralı (§4.4): önce 0. alternatif değerlendirilir. i > 0 alternatif
 * sonucu ancak (a) daha iyi bir karar verirse, (b) 0. alternatiften 6
 * kelimede en fazla 1 farklıysa ve (c) farklı tokenların hiçbiri tuzak,
 * bağlaç, ek karşılığı ya da bu adımda eklenen kelime değilse değiştirir.
 * Böylece öğrenci gerçekten "with" dediyse, listedeki "by" onu kurtarmaz.
 */
export function checkAnswer(target: string, alts: string[], given: string | string[], ctx: CheckCtx): CheckResult | null {
  const list = (Array.isArray(given) ? given : [given]).filter((s): s is string => typeof s === "string");
  const lx = lex(ctx.lang);
  const forms = acceptedForms(target, alts, ctx);
  const added = addedSet(target, ctx);
  const results = list.map((s, i) => scoreOne(s, i, forms, ctx, lx, added));
  const first = results.findIndex((r) => r !== null);
  if (first < 0) return null;
  let best = results[first]!;
  const base = canonicalTokens(list[first], ctx.lang, ctx.script);
  const allowed = Math.max(1, Math.floor(base.length / 6));
  const guarded = (t: string) => lx.trapTokens.has(t) || lx.connectors.has(t) || lx.markers.has(t) || added.has(t);
  for (let i = first + 1; i < results.length; i += 1) {
    const r = results[i];
    if (!r || RANK[r.verdict] <= RANK[best.verdict]) continue;
    const diff = alignTokens(base, canonicalTokens(list[i], ctx.lang, ctx.script)).filter((o) => o.op !== "eq");
    if (diff.length > allowed) continue;
    if (diff.some((o) => guarded(o.e ?? "") || guarded(o.g ?? ""))) continue;
    best = r;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 4.6 Gösterim yardımcıları
// ---------------------------------------------------------------------------

export interface DiffWord {
  text: string;
  added: boolean;
}

/**
 * Önceki adıma göre bu adımda EKLENEN kelimeler (LCS, karşılaştırma
 * tokenlarıyla). Özgün yazım korunur — Arapçada hareke de. Yalnız harekesi
 * değişen kelime eklenmiş sayılmaz. inserted: eklenen kelime cümlenin
 * sonunda değil araya girmiş (often, to) — "araya girdi" etiketi için.
 */
export function diffAdded(prev: string, cur: string, lang: LanguageId): { words: DiffWord[]; added: number[]; inserted: boolean } {
  const pw = wordMap(prev, lang).per.flat();
  const cm = wordMap(cur, lang);
  const flat = cm.per.flat();
  const matched = lcsMatched(pw, flat);
  let k = 0;
  const words: DiffWord[] = cm.words.map((w, wi) => {
    const n = cm.per[wi].length;
    const slice = matched.slice(k, k + n);
    k += n;
    return { text: w, added: n > 0 && slice.some((x) => !x) };
  });
  const added = words.map((w, i) => (w.added ? i : -1)).filter((i) => i >= 0);
  const lastKept = words.map((w, i) => (!w.added && cm.per[i].length > 0 ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  const inserted = added.some((i) => i < lastKept);
  return { words, added, inserted };
}

/** Türkçe küçük harf: I → ı, İ → i (uzunluk korunur, dizinler bozulmaz). */
function trLower(s: string): string {
  return s.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
}

const TR_LETTER = /[a-zçğıöşüâîû'’]/;

/**
 * Türkçe parçanın cümledeki yeri [başlangıç, bitiş). Ek parçaları ("‑madan
 * önce") ev sahibi kelimeye genişletilir ("yapmadan önce"); daha önce
 * kapsanmamış geçiş tercih edilir — "Bazen işe … sıklıkla işe" cümlesinde
 * ikinci "işe" adımı ikinci geçişi bulur.
 */
export function locateTrPiece(tr: string, piece: string, covered: [number, number][] = []): [number, number] | null {
  const raw = trLower(piece.trim());
  const suffix = /^[-‑–]/.test(raw);
  const p = raw.replace(/^[-‑–\s]+/, "").replace(/[.,!?;:…"]+$/, "").trim();
  if (!p) return null;
  const hay = trLower(tr);
  const isL = (ch: string | undefined) => !!ch && TR_LETTER.test(ch);
  let best: { span: [number, number]; score: number } | null = null;
  let order = 0;
  for (let idx = hay.indexOf(p); idx >= 0; idx = hay.indexOf(p, idx + 1)) {
    let s = idx;
    let e = idx + p.length;
    const midStart = isL(hay[s - 1]);
    const midEnd = isL(hay[e]);
    if (suffix || midStart) while (s > 0 && isL(hay[s - 1])) s -= 1;
    if (suffix || midEnd) while (e < hay.length && isL(hay[e])) e += 1;
    const overlap = covered.some(([a, b]) => s < b && a < e);
    const whole = suffix || (!midStart && !midEnd);
    const score = (overlap ? 1000 : 0) + (whole ? 0 : 100) + order;
    order += 1;
    if (!best || score < best.score) best = { span: [s, e], score };
  }
  return best ? best.span : null;
}

/** Hedef bağlaç metninden yöntem tablosundaki kaydı bulur (harekesiz karşılaştırma). */
export function findConnector(lang: LanguageId, target: string): (ConnectorInfo & { tr: string }) | null {
  const want = canonicalTokens(target, lang).join(" ");
  if (!want) return null;
  for (const [tr, c] of Object.entries(methodFor(lang).connectors)) {
    if (canonicalTokens(c.target, lang).join(" ") === want) return { tr, ...c };
  }
  return null;
}
