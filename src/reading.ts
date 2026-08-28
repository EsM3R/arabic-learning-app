/**
 * Okuma Salonu — kelime defterinden kapsamlı okuma metni üretiminin SAF
 * mantığı (React/RN importu YOK; node ile test edilir: tests/reading.test.ts).
 * API çağrısı src/claude.ts'te; burada girdi hazırlığı, üretim sonrası
 * temizlik, kart eşleme ve kütüphane bakımı var.
 *
 * NOT: node --experimental-strip-types uzantılı import ister (tsconfig
 * yorumu) — çalışma-zamanı importları .ts uzantılı, tip importları
 * import type ile yazılır (silinir).
 */
import { dueCards, strugglingCards } from "./srs.ts";
import { arabicStemCandidates, normalizeTarget, readingCoverage } from "./textnorm.ts";
import type {
  ReadingGenPayload,
  ReadingLength,
  ReadingNewWord,
  ReadingText,
  VocabCard,
} from "./types";

/** Defterde bu sayıdan az kart varken soğuk başlangıç modu. */
export const COLD_START_MIN = 25;
/** Kütüphanede tutulan en fazla metin (tek AsyncStorage anahtarı ~<500KB kalsın). */
export const MAX_READINGS = 20;
/** Prompt'a gönderilecek en fazla bilinen kelime. */
export const MAX_KNOWN_WORDS = 600;
/** complianceRatio bunun altındaysa UI uyarı bandı + manuel yeniden üretim. */
export const COMPLIANCE_WARN = 0.85;

export interface LengthSpec {
  sentences: [number, number]; // [min, max] cümle
  words: [number, number]; // [min, max] kelime (yaklaşık)
  maxNew: number; // yeni kelime tavanı (üst kelime sınırının ~%2-3'ü)
  reviewCap: number; // metne gömülecek en fazla tekrar kelimesi
  questionCount: number; // anlama sorusu sayısı
  label: string; // UI etiketi
}

export const LENGTH_SPECS: Record<ReadingLength, LengthSpec> = {
  kisa: { sentences: [4, 6], words: [50, 80], maxNew: 3, reviewCap: 4, questionCount: 2, label: "Kısa · 4-6 cümle" },
  orta: { sentences: [8, 12], words: [120, 180], maxNew: 5, reviewCap: 8, questionCount: 3, label: "Orta · 8-12 cümle" },
  uzun: { sentences: [14, 18], words: [220, 300], maxNew: 8, reviewCap: 10, questionCount: 4, label: "Uzun · 14-18 cümle" },
};

/**
 * Metne gömülecek tekrar kartları: tekrarı gelenler (due sırasıyla), sonra
 * zorlanılanlar; cap'e kadar, mükerrersiz. Diglossik dillerde (Arapça) havuz
 * yalnız "okuma" parkurudur — fusha metne ammice gömdürmeyiz; ammice kartlar
 * yine BİLİNEN listesinde kalır (çoğu kelime iki registerde ortaktır).
 */
export function selectReviewCards(
  vocab: VocabCard[],
  diglossic: boolean,
  cap: number,
  now = new Date()
): VocabCard[] {
  const pool = diglossic ? vocab.filter((c) => c.track === "okuma") : vocab;
  const picked = new Map<string, VocabCard>();
  for (const c of dueCards(pool, now)) {
    if (picked.size >= cap) break;
    picked.set(c.id, c);
  }
  for (const c of strugglingCards(pool, cap)) {
    if (picked.size >= cap) break;
    if (!picked.has(c.id)) picked.set(c.id, c);
  }
  return Array.from(picked.values());
}

/**
 * Prompt'a gidecek bilinen kelimeler (VocabCard.arabic — hedef dilin kendi
 * yazımı; alan adı tarihseldir, en/es'te de hedef yazım budur). 600'ü aşarsa:
 * tekrar kartları + zorlanılanlar her koşulda kalır, kalan kontenjan en yeni
 * eklenenlerle dolar. Cihazdaki kapsam ÖLÇÜMÜ her zaman TAM defterle yapılır.
 */
export function knownWordList(vocab: VocabCard[], mustCards: VocabCard[]): string[] {
  if (vocab.length <= MAX_KNOWN_WORDS) return vocab.map((c) => c.arabic);
  const must = new Set(mustCards.map((c) => c.id));
  for (const c of strugglingCards(vocab, 50)) must.add(c.id);
  const kept = vocab.filter((c) => must.has(c.id));
  const rest = vocab
    .filter((c) => !must.has(c.id))
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, Math.max(0, MAX_KNOWN_WORDS - kept.length));
  return [...kept, ...rest].map((c) => c.arabic);
}

export interface ReadingOptions {
  /** Öğrencinin seçtiği konu; boşsa modülden/senaryodan türetilir. */
  topic?: string;
  /** Konu bu müfredat modülünün başlık+hedeflerinden türetilsin. */
  moduleId?: string;
  length: ReadingLength;
  /** Yeniden üretimde önceki plansız bilinmeyenler (normalize biçimler) — modele "kullanma" denir. */
  avoidWords?: string[];
}

export interface ReadingRequest {
  level: string;
  topic: string;
  length: ReadingLength;
  coldStart: boolean;
  /** Defterdeki toplam kart sayısı (soğuk başlangıç metni için prompt'a girer). */
  deckSize: number;
  knownWords: string[];
  /** Gömülecek kartlar; soğuk başlangıçta defterin TAMAMI (iki parkur birden). */
  reviewCards: VocabCard[];
  moduleId?: string;
}

/** Modül başlığı + ilk 2 hedef → konu cümlesi. */
export function topicFromModule(m: { title: string; objectives: string[] }): string {
  const objs = m.objectives.slice(0, 2).join("; ");
  return objs ? `${m.title} — hedefler: ${objs}` : m.title;
}

/**
 * Konu önceliği: öğrenci seçimi > modül konusu > pack.scenarios'tan rastgele.
 * Soğuk başlangıçta reviewCards = defterin tamamı ("hepsini göm" kuralı;
 * diglossik dillerde ammiceye özgü biçimlerin register uyarlaması prompt'ta).
 */
export function buildReadingRequest(
  vocab: VocabCard[],
  opts: ReadingOptions,
  level: string,
  moduleTopic: string | undefined,
  fallbackScenarios: string,
  diglossic: boolean,
  now = new Date()
): ReadingRequest {
  const spec = LENGTH_SPECS[opts.length];
  const coldStart = vocab.length < COLD_START_MIN;
  const reviewCards = coldStart
    ? [...vocab]
    : selectReviewCards(vocab, diglossic, spec.reviewCap, now);
  const pool = fallbackScenarios
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const topic =
    opts.topic?.trim() ||
    moduleTopic ||
    pool[Math.floor(Math.random() * pool.length)] ||
    "günlük hayattan bir kesit";
  return {
    level,
    topic,
    length: opts.length,
    coldStart,
    deckSize: vocab.length,
    knownWords: knownWordList(vocab, reviewCards),
    reviewCards,
    moduleId: opts.moduleId,
  };
}

/**
 * Tekrar kartı ↔ metin eşlemesi. Modele kart id'si GÖNDERİLMEZ (token israfı
 * + id bozma riski); model kelimeleri verilen yazımla bildirir, cihaz hem bu
 * beyanı hem metnin kendisini normalize+klitik soymayla tarar — beyan atlasa
 * bile tarama yakalar. Metnin kendisi hakemdir.
 */
export function matchReviewCards(
  reviewCards: VocabCard[],
  declared: string[],
  sentenceTargets: string[],
  arabicScript: boolean
): string[] {
  const singleWord = new Map<string, string>(); // norm → id
  const multiWord: { norm: string; id: string }[] = [];
  for (const c of reviewCards) {
    const n = normalizeTarget(c.arabic, arabicScript);
    if (!n) continue;
    if (n.includes(" ")) multiWord.push({ norm: n, id: c.id });
    else singleWord.set(n, c.id);
  }
  const ids = new Set<string>();
  const tryToken = (tok: string) => {
    const cands = arabicScript ? arabicStemCandidates(tok) : [tok];
    for (const cand of cands) {
      const id = singleWord.get(cand);
      if (id) ids.add(id);
    }
  };
  for (const d of declared) tryToken(normalizeTarget(d, arabicScript));
  const fullNorm = sentenceTargets.map((s) => normalizeTarget(s, arabicScript)).join(" ");
  for (const tok of fullNorm.split(" ")) if (tok) tryToken(tok);
  for (const m of multiWord) if (fullNorm.includes(m.norm)) ids.add(m.id);
  return Array.from(ids);
}

/** Modelin "yeni" dediği ama defterde zaten olanları ve liste içi mükerrerleri eler. */
export function dedupeNewWords(
  newWords: ReadingNewWord[],
  vocab: VocabCard[],
  arabicScript: boolean
): ReadingNewWord[] {
  const known = new Set(
    vocab.map((c) => normalizeTarget(c.arabic, arabicScript)).filter(Boolean)
  );
  const seen = new Set<string>();
  return newWords.filter((w) => {
    const n = normalizeTarget(w.word, arabicScript);
    if (!n || known.has(n) || seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

export function makeReadingId(now = new Date()): string {
  return `r${now.getTime()}${Math.floor(Math.random() * 1000)}`;
}

/**
 * Ham üretim → kütüphane kaydı: boş cümleleri at, yeni kelimeleri temizle,
 * bozuk soruları at, kapsamı TAM defterle ölç, kartları eşle.
 */
export function finalizeReading(
  raw: ReadingGenPayload,
  req: ReadingRequest,
  vocab: VocabCard[],
  arabicScript: boolean,
  now = new Date()
): ReadingText {
  const sentences = raw.sentences.filter((s) => s.target.trim().length > 0);
  const newWords = dedupeNewWords(raw.newWords, vocab, arabicScript);
  const questions = raw.questions
    .filter((q) => q.choices.length >= 2 && q.answer >= 0 && q.answer < q.choices.length)
    .slice(0, 5);
  const targets = sentences.map((s) => s.target);
  const cov = readingCoverage(
    targets.join(" "),
    vocab.map((c) => c.arabic), // her zaman TAM defter — kırpılmış prompt listesi değil
    newWords.map((w) => w.word),
    arabicScript
  );
  return {
    ...raw,
    sentences,
    newWords,
    questions,
    id: makeReadingId(now),
    topic: req.topic,
    moduleId: req.moduleId,
    level: req.level,
    length: req.length,
    coldStart: req.coldStart,
    createdAt: now.toISOString(),
    knownRatio: cov.knownRatio,
    complianceRatio: cov.complianceRatio,
    unplannedUnknown: cov.unplannedUnknown.slice(0, 20),
    reviewCardIds: matchReviewCards(req.reviewCards, raw.usedReviewWords, targets, arabicScript),
    addedWordIds: [],
  };
}

/**
 * En fazla MAX_READINGS metin (yeni → eski sıralı döner). Taşarsa önce en
 * eski BİTMİŞ metinler düşer (bitmemiş emek korunur), yetmezse en eskiler.
 */
export function pruneReadings(list: ReadingText[]): ReadingText[] {
  const sorted = [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (sorted.length <= MAX_READINGS) return sorted;
  let excess = sorted.length - MAX_READINGS;
  const drop = new Set<string>();
  for (let i = sorted.length - 1; i >= 0 && excess > 0; i--) {
    if (sorted[i].finishedAt) {
      drop.add(sorted[i].id);
      excess--;
    }
  }
  for (let i = sorted.length - 1; i >= 0 && excess > 0; i--) {
    if (!drop.has(sorted[i].id)) {
      drop.add(sorted[i].id);
      excess--;
    }
  }
  return sorted.filter((r) => !drop.has(r.id));
}
