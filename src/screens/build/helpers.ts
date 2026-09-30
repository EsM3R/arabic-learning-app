/**
 * Cümle Kurma kartlarının gösterim yardımcıları (React yok).
 *
 * Buradaki her şey CİHAZDA türetilir: adım etiketi, tam zamanında lamba
 * metni, eş/aktarım hedefi, iki kısımlı toparla açıklaması, "Günümü anlat"
 * cevabının cümlelere bölünmesi. Model bunları yazmaz — yazsaydı hem çıktı
 * bütçesi yerdi hem de lamba gibi yerlerde hedef dili sızdırabilirdi.
 */
import { addedTokens, applySwap, canonicalTokens, expandSwaps, locateTrPiece } from "../../buildcheck";
import { methodFor, trapById } from "../../buildmethod";
import type { LanguageId } from "../../languages";
import type { MasteryCheck } from "../../buildmastery";
import type {
  BuildBlock,
  BuildSentence,
  ConnectorCard,
  Retrieval,
  Role,
  Swap,
  TenseFrame,
} from "../../sentencebuilding";

// ---------------------------------------------------------------------------
// Hareke ve öğrencinin varyantı
// ---------------------------------------------------------------------------

/** Arapça harekeler (fetha, kesra, sükûn, şedde, tenvin, üstün elif…). */
const HARAKAT = /[ً-ٰٕ]/g;

/** Yalnız gösterim için: denetim zaten harekeye bakmaz (§7.5). */
export function stripHarakat(s: string): string {
  return s.replace(HARAKAT, "");
}

/**
 * Hedefi öğrencinin daha önce seçtiği söyleyişle gösterir ("have a shower"
 * dediyse sonraki adımlar da öyle görünür). Seçim yoksa kalıptaki hâl.
 */
export function learnerVariant(target: string, swaps: Swap[], lang: LanguageId, choices: Swap[]): string {
  if (!target || !choices.length) return target;
  return expandSwaps(target, swaps, lang, choices)[0]?.text ?? target;
}

// ---------------------------------------------------------------------------
// Üslup etiketleri (C1+)
// ---------------------------------------------------------------------------

const REGISTER = new Set<Swap["label"]>(["resmî", "günlük", "edebî"]);
const canon = (words: string[] | string, lang: LanguageId) =>
  canonicalTokens(Array.isArray(words) ? words.join(" ") : words, lang).join(" ");

/**
 * Blok alternatifinin gösterimi: C1+'da etiketi yanında ("have a shower ·
 * günlük"). Etiket blokta değil cümlenin swap'ında durur (kabul kümesi
 * oradan kurulur); burada aynı çift aranıp etiketi okunur.
 */
export function altShown(b: BuildBlock, alt: string, swaps: Swap[], lang: LanguageId): string {
  const f = canon(b.target, lang);
  const t = canon(alt, lang);
  const sw = swaps.find((x) => REGISTER.has(x.label) && canon(x.from, lang) === f && canon(x.to, lang) === t);
  return sw?.label ? `${alt} (${sw.label})` : alt;
}

/**
 * Özet kartındaki "başka söyleyişler": taş alternatifi olmayan cümle geneli
 * eşdeğerler (", but" → ". However,", SVO söyleyişi, günlük dil), etiketiyle.
 * Cinsiyet çifti burada yok — o bir üslup değil, cümlenin başında seçilir.
 */
export function extraSwaps(s: BuildSentence, swaps: Swap[], lang: LanguageId): { from: string; to: string; label?: string }[] {
  const fromBlocks = new Set(s.blocks.flatMap((b) => b.alts.map((a) => `${canon(b.target, lang)}→${canon(a, lang)}`)));
  const out: { from: string; to: string; label?: string }[] = [];
  const seen = new Set<string>();
  for (const x of swaps) {
    if (x.label === "dişil") continue;
    const k = `${canon(x.from, lang)}→${canon(x.to, lang)}`;
    if (fromBlocks.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push({ from: x.from.join(" "), to: x.to.join(" "), ...(x.label && REGISTER.has(x.label) ? { label: x.label } : {}) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Adım kartı
// ---------------------------------------------------------------------------

/**
 * Hocanın sözlü işaretleri: "Bağlaçla başlıyorum", "Yüklemden başlıyoruz",
 * "Hemen vurgu: bazen", "Şimdi cümlemizi toparlayalım". Bir adım iki işaret
 * taşıyabilir (bazen ilk adımda hem yüklem hem vurgu gelir).
 */
export function stepLabels(s: BuildSentence, i: number, lang: LanguageId): string[] {
  const st = s.steps[i];
  if (!st) return [];
  if (st.move === "linked") return ["Önceki cümleyi söyle"];
  const out: string[] = [];
  const last = i === s.steps.length - 1 && i > 0;
  if (st.move === "connector") out.push("Bağlaçla başlıyorum");
  else if (last) out.push("Şimdi cümlemizi toparlayalım");
  else if (st.move === "anchor") out.push("Yüklemden başlıyoruz");
  const freq = new Set(methodFor(lang).freqAdverbs.flatMap((a) => canonicalTokens(a, lang)));
  const add = addedTokens(i > 0 ? s.steps[i - 1].target : "", st.target, lang);
  if (add.some((t) => freq.has(t))) {
    // Türkçe zarf: bu adımda öğretilen zarf taşının Türkçesi, yoksa adımın parçası.
    const adv = s.blocks.find((b) => b.kind === "adverb" && b.step === i && !b.recycled);
    const word = (adv?.tr || st.trPiece).replace(/\s*….*$/, "").trim();
    out.push(`Hemen vurgu: ${word}`);
  } else if (st.inserted && !last && st.move !== "connector") {
    out.push("Araya ekliyoruz");
  }
  // Videodaki sıra ayarı (D3): ek sonra gelir, bu adım bilerek eksik. Öğrenci
  // bozuk sandığı cümleyi düzeltmeye kalkmasın diye cevaptan ÖNCE söylenir.
  if (!last && /ara h[âa]l/i.test(st.note)) out.push("Ara hâl: henüz eksik");
  return out;
}

/**
 * Tam zamanında lamba: YALNIZ Türkçe tetik. Hedef dildeki karşılık asla
 * gösterilmez — öğrenci önce kendisi denesin; açıklama cevaptan SONRA gelir.
 */
export function lampText(b: BuildBlock, lang: LanguageId): string {
  const trap = (b.trapIds ?? []).map((id) => trapById(lang, id)).find(Boolean);
  if (trap) return `${trap.tr}: dikkat, burada bir tuzak var`;
  const t = b.tr;
  switch (b.kind) {
    case "connector":
      return `Bağlaca dikkat: ${t}`;
    case "suffix":
      return `${t}: ekine dikkat, hedef dilde bir yapıya dönüşüyor`;
    case "caseSplit":
      return `${t}: bu ekin burada hangi anlamda olduğuna dikkat`;
    case "chunk":
      return `${t}: bir kalıp, tek parça gelir`;
    case "rule":
      return `${t}: burada bir kural var`;
    case "complement":
      return `${t}: fiilden sonra ne geldiğine dikkat`;
    case "adverb":
      return `${t}: yerine dikkat`;
    case "paraphrase":
      return `${t}: önce anlamını düşün`;
    default:
      return `Yeni parça: ${t}`;
  }
}

/** Bu adımda tam zamanında öğretilen (geri gelmeyen) taşlar. */
export function blocksAt(s: BuildSentence, i: number): BuildBlock[] {
  return s.blocks.filter((b) => b.step === i && !b.recycled);
}

/** Bu adımda yeniden kullanılan taşlar (ilk notları yalnız yanlıştan sonra). */
export function recycledAt(s: BuildSentence, i: number): BuildBlock[] {
  return s.blocks.filter((b) => b.step === i && !!b.recycled);
}

/**
 * Geri çağırma sorusunun ait olduğu taşlar (§3 Q: yanlış seçim o taşın
 * kaçırmasıdır). refKey bir taş anahtarı DEĞİLDİR: tuzakta tuzak kimliği,
 * sistemde ders kimliğidir. Tuzak sorusu tuzağı taşıyan taşa yazılır; sistem
 * ve model sorusu, sorunun hemen önüne geldiği adımın taşlarına.
 */
export function retrievalBlockKeys(s: BuildSentence, r: Retrieval): string[] {
  const list =
    r.src === "trap" && r.refKey
      ? s.blocks.filter((b) => (b.trapIds ?? []).includes(r.refKey!))
      : s.blocks.filter((b) => b.step === r.step);
  return [...new Set(list.map((b) => b.key).filter(Boolean))];
}

/** Türkçe cevap satırı: "→ **Erken** uyanmayı seviyorum" (yeni parça kalın). */
export function answerLine(trSoFar: string, piece: string): { before: string; bold: string; after: string } {
  const clean = piece.replace(/\s*…\s*/g, " ").trim();
  const span = clean ? locateTrPiece(trSoFar, clean) : null;
  if (!span) return { before: trSoFar, bold: "", after: "" };
  return { before: trSoFar.slice(0, span[0]), bold: trSoFar.slice(span[0], span[1]), after: trSoFar.slice(span[1]) };
}

// ---------------------------------------------------------------------------
// Toparla: iki kısmın açıklaması
// ---------------------------------------------------------------------------

export interface GlossSegment {
  target: string;
  tr: string;
}

/** Hedefin başındaki kısmı kelime kelime (karşılaştırma biçimiyle) ayırır. */
function afterPrefix(full: string, prefix: string, lang: LanguageId): string | null {
  const want = canonicalTokens(prefix, lang);
  if (!want.length) return null;
  const ws = full.split(/\s+/).filter(Boolean);
  for (let w = 1; w <= ws.length; w += 1) {
    const got = canonicalTokens(ws.slice(0, w).join(" "), lang);
    if (got.length === want.length && got.every((t, i) => t === want[i])) {
      return ws.slice(w).join(" ").replace(/^[,،;\s]+/, "");
    }
    if (got.length > want.length) return null;
  }
  return null;
}

/**
 * "When I arrive at home · eve vardığımda │ I turn on the TV · televizyonu
 * açarım": son adımda iki kısmın hedefi ve Türkçesi yan yana. Kısım sınırı
 * modelin e:1 işaretinden (clauseEnd) ya da bağlantılı cümlenin önekinden.
 */
export function glossSegments(s: BuildSentence, lang: LanguageId, finalTarget = s.target): GlossSegment[] {
  const whole = [{ target: finalTarget, tr: s.tr }];
  const ce = s.steps.find((st) => st.clauseEnd && st.move !== "linked") ?? (s.linkPrev ? s.steps[0] : undefined);
  if (!ce || ce === s.steps[s.steps.length - 1]) return whole;
  const t1 = ce.target.replace(/[\s,،;.]+$/, "");
  const t2 = afterPrefix(finalTarget, t1, lang);
  if (!t2) return whole;
  const tr1 = ce.trSoFar.replace(/[\s,;.]+$/, "");
  const span = locateTrPiece(s.tr, tr1);
  const tr2 = span ? (s.tr.slice(0, span[0]) + s.tr.slice(span[1])).replace(/^[\s,;]+/, "").trim() : "";
  return [
    { target: t1, tr: tr1 },
    { target: t2, tr: tr2 || s.tr },
  ];
}

// ---------------------------------------------------------------------------
// Bağlaç kartı: öğrencinin kendisinin bölmesi
// ---------------------------------------------------------------------------

/** Türkçe cümlenin kelimeleri ve yerleri (dokunarak bağlacı bulmak için). */
export function trWords(tr: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tr))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/** Türkçe küçük harf; uzunluk korunur ki kelime yerleri bozulmasın (I → ı, İ → i). */
const trLow = (s: string) => s.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();

/**
 * Ek sesleri ünlü uyumu ve ünsüz benzeşmesiyle değişir: yöntem tablosunun
 * anahtarı "-madan önce" iken cümlede "gitmeden önce", "-dıktan sonra"
 * iken "yedikten sonra" geçer.
 */
const HARMONY: Record<string, string> = {
  a: "[ae]",
  e: "[ae]",
  ı: "[ıiuü]",
  i: "[ıiuü]",
  u: "[ıiuü]",
  ü: "[ıiuü]",
  d: "[dt]",
  t: "[dt]",
  k: "[kğ]",
  ğ: "[kğ]",
  c: "[cç]",
  ç: "[cç]",
};
const harmonic = (p: string) => [...p].map((ch) => HARMONY[ch] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
const bareWord = (w: string) => w.replace(/^[^a-zçğıöşüâîû]+|[^a-zçğıöşüâîû]+$/g, "");

/**
 * Bağlacın Türkçe cümledeki yeri ("-madan önce" → "yapmadan önce").
 * Önce birebir aranır; tutmazsa ek uyumlu biçimiyle, sonra kişi ekiyle
 * ("-dığımda" → "vardığında"), en son serbest kelimesiyle ("önce").
 * Bulunamazsa null: kart öğrenciye böldürmez, doğrudan açılır.
 */
export function connectorSpan(tr: string, card: ConnectorCard): [number, number] | null {
  const exact = locateTrPiece(tr, card.tr);
  if (exact) return exact;
  const raw = trLow(card.tr.trim());
  const suffix = /^[-‑–]/.test(raw);
  const parts = raw.replace(/^[-‑–\s]+/, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const words = trWords(trLow(tr)).map((w) => ({ ...w, bare: bareWord(w.text) }));
  const [head, ...free] = parts;
  const freeRe = free.map((f) => new RegExp(`^${harmonic(f)}$`));
  const heads: RegExp[] = suffix
    ? [
        // Ekin tamamı kelimenin sonunda: "gitmeden".
        new RegExp(`.${harmonic(head)}$`),
        // Ardından kişi eki gelmiş: "gelirsem".
        new RegExp(`.${harmonic(head)}`),
        // Ekin ortası kişiye göre değişmiş: "-dığımda" → "vardığında".
        ...(head.length >= 5 ? [new RegExp(`.${harmonic(head.slice(0, 3))}.*${harmonic(head.slice(-2))}$`)] : []),
      ]
    : [new RegExp(`^${harmonic(head)}$`)];
  for (const re of heads) {
    for (let j = 0; j + free.length < words.length; j += 1) {
      if (!re.test(words[j].bare)) continue;
      if (!freeRe.every((f, m) => f.test(words[j + 1 + m].bare))) continue;
      return [words[j].start, words[j + free.length].end];
    }
  }
  // Ek hiç tutmadı ama serbest kelime ("önce", "rağmen") duruyor: önceki kelimeyle birlikte bağlaç.
  if (suffix && free.length) {
    for (let j = 1; j + free.length - 1 < words.length; j += 1) {
      if (freeRe.every((f, m) => f.test(words[j + m].bare))) return [words[j - 1].start, words[j + free.length - 1].end];
    }
  }
  return null;
}

/**
 * Öğrenci bağlacı kendisi bölecek mi. Kart ile ekranın "Devam" kilidi aynı
 * kararı okur: bağlaç cümlede bulunamazsa bölme adımı yoktur, kilit de yok.
 */
export function canSplit(tr: string, card: ConnectorCard): boolean {
  return card.learnerSplit && !!connectorSpan(tr, card);
}

/** Cümlenin temadaki sahnesi (sahneler cümlelere sırayla yayılır). */
export function stageIndex(i: number, n: number, stages: number): number {
  if (stages <= 0) return -1;
  return Math.min(stages - 1, Math.floor((i * stages) / Math.max(1, n)));
}

/**
 * Bağlaç kararı için iki seçenek: [doğru, tuzak]. Tuzak koddaki çiftten
 * (before ↔ ago); bağlacın tuzağı yoksa aynı türden kardeş bağlaç
 * (before ↔ after). Hoca da "aklınıza X gelebilir" diye tam bunu sorar.
 */
export function splitOptions(card: ConnectorCard, lang: LanguageId): { right: string; wrong: string } {
  const m = methodFor(lang);
  const trap = card.trapId ? trapById(lang, card.trapId) : undefined;
  const key = (s: string) => canonicalTokens(s, lang).join(" ");
  if (trap?.pair) {
    const wrong = key(trap.pair[0]) === key(card.target) ? trap.pair[1] : trap.pair[0];
    if (key(wrong) !== key(card.target)) return { right: card.target, wrong };
  }
  const all = Object.values(m.connectors).filter((c) => key(c.target) !== key(card.target));
  const sib = all.find((c) => c.kind === card.kind) ?? all[0];
  return { right: card.target, wrong: sib?.target ?? "—" };
}

// ---------------------------------------------------------------------------
// Eş / aktarım
// ---------------------------------------------------------------------------

/**
 * Eş cümle: son hedefte taş → karşıtı ("early" → "late"), Türkçede de aynı
 * değişiklik. Hedef cihazda kurulur; model yalnız eş parçayı verir.
 */
export function pairPrompt(s: BuildSentence, b: BuildBlock, lang: LanguageId): { target: string; tr: string } | null {
  if (!b.pair) return null;
  const sw: Swap = { from: b.target.split(/\s+/), to: b.pair.target.split(/\s+/) };
  const target = applySwap(s.target, sw, lang);
  const span = locateTrPiece(s.tr, b.tr);
  if (!target || !span) return { target: b.pair.target, tr: b.pair.tr };
  const tr = s.tr.slice(0, span[0]) + b.pair.tr + s.tr.slice(span[1]);
  return { target, tr: tr[0] ? tr[0].toLocaleUpperCase("tr-TR") + tr.slice(1) : tr };
}

/**
 * "Kendi cümlen" (açık uç): yalnız pratik, kanıt sayılmaz. Hoşgörülü
 * denetim — taşın kelimeleri sırasıyla geçiyor ve tuzak kelime yok.
 */
export function openOk(given: string, b: BuildBlock, lang: LanguageId): boolean {
  const g = canonicalTokens(given, lang);
  const want = canonicalTokens(b.target, lang);
  if (!g.length || !want.length) return false;
  let j = 0;
  for (const t of g) if (t === want[j]) j += 1;
  if (j < want.length) return false;
  const wrong = new Set(
    (b.trapIds ?? []).flatMap((id) => trapById(lang, id)?.wrong ?? []).flatMap((w) => canonicalTokens(w, lang))
  );
  return !g.some((t) => wrong.has(t));
}

// ---------------------------------------------------------------------------
// Günümü anlat
// ---------------------------------------------------------------------------

/**
 * "Hepsini bir kerede": tek kayıttaki metni cümlelere böler. Noktalama
 * cümle sayısını veriyorsa ona, yoksa beklenen cümlelerin uzunluğuna
 * oranla kelime kelime bölünür (ses tanıma çoğu zaman nokta koymaz).
 */
export function splitRetell(heard: string, expected: string[], lang: LanguageId): string[] {
  const n = expected.length;
  if (n <= 1) return [heard];
  const byPunct = (heard.match(/[^.!?؟]+[.!?؟]*/g) ?? []).map((x) => x.trim()).filter(Boolean);
  if (byPunct.length === n) return byPunct;
  const words = heard.split(/\s+/).filter(Boolean);
  const lens = expected.map((e) => Math.max(1, canonicalTokens(e, lang).length));
  const total = lens.reduce((a, b) => a + b, 0);
  const out: string[] = [];
  let at = 0;
  lens.forEach((l, i) => {
    const take = i === n - 1 ? words.length - at : Math.round((l / total) * words.length);
    out.push(words.slice(at, at + Math.max(0, take)).join(" "));
    at += Math.max(0, take);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Set tanıtımı ve ana ekran
// ---------------------------------------------------------------------------

export function tenseLabel(t: TenseFrame): string {
  switch (t) {
    case "habit":
      return "Geniş zaman: her gün yaptıklarımız";
    case "past":
      return "Geçmiş zaman: yaşadıklarımız";
    case "now":
      return "Şimdiki zaman: şu an olanlar";
    case "future":
      return "Gelecek zaman: planlarımız";
    default:
      return "Karışık zaman: hikâye ne isterse";
  }
}

export function roleLabel(r: Role): string {
  return {
    open: "açılış",
    build: "kurma",
    peak: "zirve",
    dip: "soluklanma",
    extension: "uzatma",
    synthesis: "son cümle",
  }[r];
}

/** Okuma kartının başlığı (hocanın cümleye girişi). */
export function readHeading(role: Role, index: number): string {
  if (role === "synthesis") return "Ve geldik son cümlemize";
  if (role === "extension") return "Bir önceki cümlemizle bağlantılı";
  // Birinci cümlenin girişini ("Şimdi birinci cümlemizle başlayalım") set girişi yapar.
  return index === 0 ? "Birinci cümle: bu cümleyi çevirelim" : "Bu cümleyi çevirelim";
}

/** Kontrol listesinin bir satırı (buildmastery.masteryChecklist'ten). */
export type CheckItem = Pick<MasteryCheck, "label" | "ok">;
