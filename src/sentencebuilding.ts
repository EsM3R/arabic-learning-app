/**
 * CÜMLE KURMA — saf mantık (cihaz modülü yok; tests/sentencebuilding.test.ts).
 *
 * Kullanıcının getirdiği yöntem (Furkan Çetin'in videosunun transkriptinden):
 *
 * 1. Cümleler TEK TEK değil, BİR HİKÂYE olarak gelir — "günlük rutinim":
 *    uyanırım → duş alırım → evden çıkarım → işe giderim → eve gelirim →
 *    televizyon açarım → yatarım. Birbirine bağlı, gerçek hayattan.
 * 2. Her cümle ANA YÜKLEMDEN başlayıp dışarı doğru kurulur:
 *    "Sabahları erken uyanmayı seviyorum" → I like → I like to wake up →
 *    I like to wake up early → I like to wake up early in the morning.
 * 3. Her cümle 1-2 YAPI TAŞI öğretir: bağlaç (before, after, when, because,
 *    however), zaman ifadesi (in the morning, at around 7 pm), kalıp
 *    (take a shower, turn on the TV, leave home, go to bed, by bus).
 * 4. KARIŞTIRILANLAR açıkça ayrılır: ago/before, later/after, with/by,
 *    open/turn on — Türk öğrencinin tam düştüğü yerler.
 * 5. ALTERNATİFLER gösterilir: take/have a shower, sometimes/from time to
 *    time, often/frequently, around/about, like doing/like to do.
 * 6. Bağlacın YERİ değişebilir: "Before I have breakfast, I take a shower"
 *    = "I take a shower before I have breakfast". İkisi de söyletilir.
 * 7. SARMAL: son cümleler önceki yapı taşlarını yeniden birleştirir —
 *    "bunu da öğrendik, artık rahatlıkla çevirebiliriz".
 *
 * Videodan tek fark: videoda öğretmen çevirir, öğrenci izler. Burada öğrenci
 * ÇEVİRİR ve SESLİ SÖYLER — izlemek konuşturmaz. Her adımda cümlenin TAMAMI
 * yeniden söylenir; parçalar tekrarla otomatikleşir.
 *
 * Kalıp merdiveni omurga olarak kalıyor: her set bir kalıba ODAKLANIR ama o
 * kalıbı bir temanın içinde, hikâye cümleleriyle çalıştırır.
 */
import type { ScriptId } from "./scripts.ts";
import { normalizeTarget } from "./textnorm.ts";

export type Band = "A1" | "A2" | "B1" | "B2" | "C1";

export interface Pattern {
  id: string;
  band: Band;
  /** Türkçe başlık — kalıbın ne işe yaradığı. */
  title: string;
  /** Türkçe dilbilgisi ipucu; model hedef dildeki formülü buna göre kurar. */
  concept: string;
}

/**
 * KALIP MERDİVENİ — sıfırdan ileri düzeye.
 *
 * Sıra önemli: her basamak öncekinin üstüne kurulur. "istek" (I want to)
 * geçmiş zamandan önce gelir, çünkü tek başına bile konuşturur; "-ebilmek"
 * olumsuzdan sonra, çünkü "yapamam" onu gerektirir.
 */
export const PATTERN_LADDER: Pattern[] = [
  // A1 — çekirdek
  { id: "olmak", band: "A1", title: "Ben …-im (olmak)", concept: "olmak fiili, şimdiki durum: 'Ben öğrenciyim', 'O yorgun'" },
  { id: "var-yok", band: "A1", title: "… var / … yok", concept: "varlık-yokluk: 'Masada bir kitap var', 'Evde süt yok'" },
  { id: "sahip", band: "A1", title: "Benim … var (sahiplik)", concept: "sahiplik: 'Bir arabam var', 'Kardeşim yok'" },
  { id: "genis-zaman", band: "A1", title: "Her gün …-rım (geniş zaman)", concept: "alışkanlık, geniş zaman: 'Her sabah kahve içerim'" },
  { id: "istek", band: "A1", title: "…-mek istiyorum", concept: "istek: '-mek istemek' — 'Eve gitmek istiyorum'" },
  { id: "olumsuz", band: "A1", title: "…-mem / değilim (olumsuz)", concept: "olumsuz cümle: 'Et yemem', 'Yorgun değilim'" },
  { id: "evet-hayir-soru", band: "A1", title: "…-mı? (evet/hayır sorusu)", concept: "evet-hayır sorusu: 'Kahve ister misin?', 'Yorgun musun?'" },
  { id: "soru-kelimesi", band: "A1", title: "Ne / nerede / ne zaman …?", concept: "soru kelimeli sorular: ne, nerede, ne zaman, neden, nasıl, kim" },
  { id: "simdiki", band: "A1", title: "Şu an …-yorum (şimdiki zaman)", concept: "şu anda süren eylem: 'Şu an yemek yiyorum'" },
  { id: "ebilmek", band: "A1", title: "…-ebilirim / …-emem (yetenek)", concept: "yetenek ve olasılık: 'Yüzebilirim', 'Gelemem'" },
  { id: "rica", band: "A1", title: "… alabilir miyim? (kibar rica)", concept: "kibar istek: 'Bir su alabilir miyim?', 'Yardım eder misiniz?'" },
  { id: "emir", band: "A1", title: "Gel / Gelme (emir)", concept: "emir ve olumsuz emir: 'Otur', 'Endişelenme', 'Hadi gidelim'" },
  // A2 — zaman ve bağlama
  { id: "gecmis", band: "A2", title: "Dün …-dım (geçmiş zaman)", concept: "görülen geçmiş: 'Dün sinemaya gittim'" },
  { id: "gecmis-olumsuz-soru", band: "A2", title: "…-madım / …-dın mı?", concept: "geçmişin olumsuzu ve sorusu: 'Gitmedim', 'Gördün mü?'" },
  { id: "gelecek-plan", band: "A2", title: "Yarın …-eceğim (plan)", concept: "önceden kararlaştırılmış gelecek plan: 'Yarın annemi ziyaret edeceğim'" },
  { id: "gelecek-karar", band: "A2", title: "…-erim o zaman (anlık karar/tahmin)", concept: "anlık karar ve tahmin: 'Ben açarım', 'Bence yağmur yağacak'" },
  { id: "zorunluluk", band: "A2", title: "…-mem lazım / zorundayım", concept: "zorunluluk: 'Erken kalkmam lazım', 'Çalışmak zorundayım'" },
  { id: "tavsiye", band: "A2", title: "…-malısın (tavsiye)", concept: "tavsiye: 'Doktora gitmelisin', 'Bunu denemelisin'" },
  { id: "sevmek", band: "A2", title: "…-meyi seviyorum", concept: "sevmek/nefret etmek + eylem: 'Kitap okumayı severim'" },
  { id: "karsilastirma", band: "A2", title: "…-den daha … / en …", concept: "karşılaştırma ve en üstünlük: 'Ondan daha uzun', 'En iyi arkadaşım'" },
  { id: "ama-cunku", band: "A2", title: "… ama / çünkü / bu yüzden …", concept: "bağlaçlar: ama, çünkü, bu yüzden, ve, veya" },
  { id: "zaman-baglac", band: "A2", title: "…-ince / …-ken / …-den önce", concept: "zaman bağlaçları: 'Eve gelince', 'Yemekten önce', 'Ben uyurken'" },
  { id: "gecmis-surekli", band: "A2", title: "…-yordum (geçmişte süren)", concept: "geçmişte süren eylem: 'Sen aradığında yemek yiyordum'" },
  { id: "nesne-zamir", band: "A2", title: "Onu / ona / bana … (nesne)", concept: "nesne zamirleri: 'Onu gördüm', 'Bana söyledi'" },
  // B1 — zenginleştirme
  { id: "yakin-gecmis", band: "B1", title: "Hiç …-dın mı? / Az önce …", concept: "deneyim ve yakın geçmiş: 'Hiç Paris'e gittin mi?', 'Az önce bitirdim'" },
  { id: "sure", band: "B1", title: "… -dır …-yorum (süreden beri)", concept: "süregelen durum: 'İki yıldır İngilizce öğreniyorum'" },
  { id: "kosul-1", band: "B1", title: "Eğer …-rsa, …-ır (gerçek koşul)", concept: "gerçek koşul: 'Yağmur yağarsa evde kalırım'" },
  { id: "kosul-2", band: "B1", title: "…-sa …-rdım (hayali koşul)", concept: "hayali koşul: 'Zengin olsam bir ev alırdım'" },
  { id: "edilgen", band: "B1", title: "…-ıldı / …-ılır (edilgen)", concept: "edilgen yapı: 'Bu ev 1990'da yapıldı', 'İngilizce her yerde konuşulur'" },
  { id: "sifat-cumlesi", band: "B1", title: "…-an / …-diğim … (ilgi cümlesi)", concept: "sıfat-fiil / ilgi cümlesi: 'Dün tanıştığım adam', 'Burada çalışan kadın'" },
  { id: "dolayli-soru", band: "B1", title: "… nerede olduğunu biliyor musun?", concept: "dolaylı soru: 'Saatin kaç olduğunu biliyor musun?'" },
  { id: "aktarim", band: "B1", title: "… dedi ki …", concept: "aktarma: 'Yorgun olduğunu söyledi', 'Gelip gelmeyeceğimi sordu'" },
  { id: "amac", band: "B1", title: "…-mek için", concept: "amaç: 'Para biriktirmek için çalışıyorum'" },
  { id: "alisik", band: "B1", title: "Eskiden …-rdım", concept: "geçmiş alışkanlık: 'Eskiden sigara içerdim'" },
  { id: "ettirgen", band: "B1", title: "…-tırmak (yaptırmak)", concept: "ettirgen: 'Saçımı kestirdim', 'Bana bunu yaptırdı'" },
  { id: "tahmin", band: "B1", title: "…-meli / …-miş olmalı (tahmin)", concept: "çıkarım: 'Evde olmalı', 'Unutmuş olmalı'" },
  // B2 — incelik
  { id: "kosul-3", band: "B2", title: "…-saydı …-rdı (geçmiş koşul)", concept: "geçmişe dönük hayali koşul: 'Bilseydim gelirdim'" },
  { id: "keske", band: "B2", title: "Keşke …", concept: "keşke: 'Keşke daha çok zamanım olsa', 'Keşke gitmeseydim'" },
  { id: "mis-gecmis", band: "B2", title: "…-mıştım (geçmişin geçmişi)", concept: "öncesindeki geçmiş: 'Vardığımda film başlamıştı'" },
  { id: "ragmen", band: "B2", title: "…-mesine rağmen / halbuki", concept: "karşıtlık: 'Yorgun olmasına rağmen çalıştı'" },
  { id: "gerekirdi", band: "B2", title: "…-meliydim / …-ebilirdim", concept: "geçmişe dönük modallar: 'Daha erken gelmeliydim', 'Kazanabilirdin'" },
  { id: "vurgu", band: "B2", title: "Asıl … olan …", concept: "vurgulu yapı: 'Beni asıl şaşırtan onun sesiydi'" },
  { id: "isim-fiil", band: "B2", title: "…-mek / …-me (isim-fiil özne)", concept: "eylem özne olarak: 'Erken kalkmak zor', 'Onun gelmesi iyi oldu'" },
  { id: "bagli-kosul", band: "B2", title: "…-mediği sürece / …-mek şartıyla", concept: "şartlı bağlaçlar: 'Yağmur yağmadığı sürece', 'Erken dönmen şartıyla'" },
  // C1 — akıcılık ve üslup
  { id: "devrik", band: "C1", title: "Asla … (vurgulu devrik)", concept: "vurgulu devrik yapı: 'Asla böyle bir şey görmedim', 'Ancak o zaman anladım'" },
  { id: "karma-kosul", band: "C1", title: "…-saydım şimdi …-rdım (karma)", concept: "karma koşul: 'Dün uyusaydım şimdi yorgun olmazdım'" },
  { id: "resmi-ton", band: "C1", title: "Resmî / kibar üslup", concept: "resmî kayıt: 'Bilgilendirmenizi rica ederim', 'Mümkünse …'" },
  { id: "deyim", band: "C1", title: "Günlük deyimler ve kalıplar", concept: "doğal günlük deyimler ve söz öbekleri (phrasal verb vb.)" },
];

/** Hikâye temaları — setin cümleleri bu temada birbirine bağlı ilerler. */
export interface Theme {
  id: string;
  title: string;
  emoji: string;
  /** Türkçe: hikâyenin akışı; model cümleleri bu sırayla kurar. */
  arc: string;
}

export const THEMES: Theme[] = [
  { id: "rutin", title: "Günlük rutinim", emoji: "⏰", arc: "uyanmak, duş, kahvaltı, evden çıkmak, işe/okula gitmek, eve dönmek, akşam, yatmak" },
  { id: "haftasonu", title: "Hafta sonum", emoji: "🌤️", arc: "geç uyanmak, arkadaşlarla buluşmak, dışarıda yemek, alışveriş, film, erken yatmamak" },
  { id: "is", title: "İş günüm", emoji: "💼", arc: "işe varmak, toplantı, e-postalar, öğle arası, bir sorun çıkması, eve dönüş" },
  { id: "tatil", title: "Geçen tatilim", emoji: "✈️", arc: "yolculuğa hazırlık, havaalanı, otele varmak, gezmek, yemek, bir aksilik, dönüş" },
  { id: "aile", title: "Ailem", emoji: "👨‍👩‍👧", arc: "aile bireyleri, nerede yaşadıkları, ne iş yaptıkları, birlikte ne yaptığımız, bir anı" },
  { id: "yemek", title: "Yemek ve mutfak", emoji: "🍳", arc: "market alışverişi, yemek yapmak, tarif, sofrayı kurmak, bulaşık, sevdiğim yemekler" },
  { id: "saglik", title: "Sağlık ve spor", emoji: "🏃", arc: "hastalanmak, doktora gitmek, ilaç, iyileşmek, spora başlamak, alışkanlıklar" },
  { id: "sehir", title: "Şehirde bir gün", emoji: "🏙️", arc: "toplu taşıma, yol sormak, bir yere geç kalmak, kafe, müze, eve dönüş" },
  { id: "gelecek", title: "Planlarım", emoji: "🎯", arc: "gelecek yıl, yeni bir dil, iş değiştirmek, taşınmak, hayaller ve koşullar" },
  { id: "anilar", title: "Çocukluğum", emoji: "🧸", arc: "eskiden yaptıklarım, okul, arkadaşlar, bir olay, şimdi ne değişti" },
];

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

const BANDS: Band[] = ["A1", "A2", "B1", "B2", "C1"];

export function toBand(level: string | undefined): Band {
  const l = (level ?? "").toUpperCase().slice(0, 2);
  if (l === "A0" || l === "") return "A1";
  if (l === "C2") return "C1";
  return (BANDS as string[]).includes(l) ? (l as Band) : "A1";
}

export function patternById(id: string): Pattern | undefined {
  return PATTERN_LADDER.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Alıştırma verisi (model üretir, cihaz doğrular)
// ---------------------------------------------------------------------------

/** Bir basamak: Türkçe cümlenin şimdiye kadarki parçası ve hedef dildeki tam hâli. */
export interface BuildStep {
  /**
   * Bu adıma geçiren SORU — videodaki hocanın asıl hamlesi: "Seviyorum.
   * NEYİ seviyorum? Uyanmayı. NASIL? Erken. NE ZAMAN? Sabahları." İlk adımda
   * ya da bağlaç adımında "" olabilir.
   */
  question: string;
  /** Bu adımda eklenen Türkçe parça (vurgulanır). */
  trPiece: string;
  /** Türkçe cümlenin bu adıma kadar kurulmuş hâli. */
  trSoFar: string;
  /** Hedef dilde bu adıma kadarki TAM cümle — öğrenci bunu söyler. */
  target: string;
  /** Kabul edilebilir diğer söyleyişler (kısaltma, eş anlamlı yapı). */
  alts: string[];
  /** Latin dışı dillerde okunuş; Latin dillerde "". */
  translit: string;
  /** Bu adımda neyin eklendiğine dair tek cümlelik Türkçe not. */
  note: string;
}

/** Cümlenin öğrettiği yapı taşı: bağlaç, zaman ifadesi ya da kalıp. */
export interface BuildBlock {
  /** Hedef dilde parça, örn. "before", "turn on", "at around 7 pm". */
  target: string;
  /** Türkçe karşılığı, örn. "-madan önce". */
  tr: string;
  /** Türkçe kısa açıklama. */
  note: string;
  /** Karıştırılan şey ve farkı: "ago sadece 'önce' demek (3 gün önce)". Yoksa "". */
  contrast: string;
  /** Eş seçenekler: "have a shower", "from time to time". */
  alts: string[];
}

export interface BuildSentence {
  /** Tam Türkçe cümle. */
  tr: string;
  steps: BuildStep[];
  /** Bu cümlenin öğrettiği 1-2 yapı taşı. */
  blocks: BuildBlock[];
  /**
   * Bağlaç cümlenin başından ortasına alınabiliyorsa o sıralama (hedef
   * dilde). Son adımdan sonra ayrıca söyletilir. Yoksa "".
   */
  reorder: string;
}

export interface BuildSet {
  patternId: string;
  themeId: string;
  /** Setin kısa Türkçe tanıtımı — hangi hikâye, hangi kalıp. */
  intro: string;
  sentences: BuildSentence[];
  createdAt: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Model çıktısını güvenli biçime toparlar. Hedefi boş adım atılır (boş
 * hedefle karşılaştırma her cevabı "yanlış" sayardı); tek adımlı cümle
 * bırakılmaz (parça parça kurmanın anlamı kalmaz).
 */
export function normalizeBuildSet(
  raw: unknown,
  patternId: string,
  themeId: string,
  now = new Date()
): BuildSet {
  const r = (raw ?? {}) as Record<string, unknown>;
  const sentences: BuildSentence[] = arr(r.sentences)
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const steps: BuildStep[] = arr(o.steps)
        .map((st) => {
          const x = (st ?? {}) as Record<string, unknown>;
          return {
            question: str(x.question),
            trPiece: str(x.trPiece),
            trSoFar: str(x.trSoFar),
            target: str(x.target),
            alts: arr(x.alts).map(str).filter(Boolean).slice(0, 4),
            translit: str(x.translit),
            note: str(x.note),
          };
        })
        .filter((st) => st.target && st.trSoFar)
        .slice(0, 8);
      const blocks: BuildBlock[] = arr(o.blocks)
        .map((bl) => {
          const x = (bl ?? {}) as Record<string, unknown>;
          return {
            target: str(x.target),
            tr: str(x.tr),
            note: str(x.note),
            contrast: str(x.contrast),
            alts: arr(x.alts).map(str).filter(Boolean).slice(0, 4),
          };
        })
        .filter((bl) => bl.target && bl.tr)
        .slice(0, 3);
      return { tr: str(o.tr), steps, blocks, reorder: str(o.reorder) };
    })
    .filter((s) => s.tr && s.steps.length >= 2)
    .slice(0, 10);
  return { patternId, themeId, intro: str(r.intro), sentences, createdAt: now.toISOString() };
}

/**
 * Bağlacın yerini değiştirme adımı — basamak gibi denetlensin diye BuildStep
 * biçiminde. Yalnız öteki sıralama kabul edilir: aynı cümleyi tekrar etmek
 * alıştırmayı boşa çıkarırdı.
 */
export function reorderStep(sentence: BuildSentence): BuildStep | null {
  if (!sentence.reorder) return null;
  return {
    question: "",
    trPiece: "",
    trSoFar: sentence.tr,
    target: sentence.reorder,
    alts: [],
    translit: "",
    note: "Aynı cümle, bağlaç bu kez ortada.",
  };
}

// ---------------------------------------------------------------------------
// Cevap denetimi
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

/** Karşılaştırma için kayıplı biçim: büyük/küçük, noktalama, kısaltma farkı yok. */
export function canonical(s: string, script: ScriptId): string {
  let t = s.replace(/[’`]/g, "'");
  if (script === "latin") {
    t = t.toLowerCase();
    for (const [re, rep] of EN_CONTRACTIONS) t = t.replace(re, rep);
  }
  return normalizeTarget(t, script);
}

export type StepVerdict = "dogru" | "yakin" | "yanlis";

/** Kelime düzeyi düzenleme uzaklığı — "bir kelime eksik" ayrımı için. */
function wordDistance(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * Öğrencinin cevabı ile beklenen: "dogru" (birebir ya da kabul edilen
 * alternatif), "yakin" (uzun cümlede tek kelime farkı — ses tanıma hatası ya
 * da küçük bir kayma olabilir; öğrenciye doğrusu gösterilir ama cezalanmaz),
 * "yanlis".
 */
export function checkStep(step: BuildStep, given: string, script: ScriptId): StepVerdict {
  const g = canonical(given, script);
  if (!g) return "yanlis";
  const accepted = [step.target, ...step.alts].map((x) => canonical(x, script)).filter(Boolean);
  if (accepted.includes(g)) return "dogru";
  const gw = g.split(" ");
  for (const a of accepted) {
    const aw = a.split(" ");
    if (aw.length >= 6 && wordDistance(aw, gw) === 1) return "yakin";
  }
  return "yanlis";
}

// ---------------------------------------------------------------------------
// İlerleme
// ---------------------------------------------------------------------------

export interface PatternProgress {
  attempts: number;
  correct: number;
  /** Tamamlanan cümle sayısı (bütün adımları bitirilen). */
  sentencesDone: number;
  lastAt: string;
}

export type ProgressMap = Record<string, PatternProgress>;

/** Bir kalıp "oturdu" sayılır: en az 4 cümle kurulmuş ve isabet %80+. */
export const MASTER_SENTENCES = 4;
export const MASTER_ACCURACY = 0.8;

export function isMastered(p: PatternProgress | undefined): boolean {
  if (!p || p.attempts === 0) return false;
  return p.sentencesDone >= MASTER_SENTENCES && p.correct / p.attempts >= MASTER_ACCURACY;
}

export function recordAttempt(
  map: ProgressMap,
  patternId: string,
  verdict: StepVerdict,
  sentenceFinished: boolean,
  now = new Date()
): ProgressMap {
  const prev = map[patternId] ?? { attempts: 0, correct: 0, sentencesDone: 0, lastAt: "" };
  return {
    ...map,
    [patternId]: {
      attempts: prev.attempts + 1,
      // "yakın" doğru sayılır: tek kelimelik kayma çoğu zaman ses tanımadan.
      correct: prev.correct + (verdict === "yanlis" ? 0 : 1),
      sentencesDone: prev.sentencesDone + (sentenceFinished ? 1 : 0),
      lastAt: now.toISOString(),
    },
  };
}

/**
 * Sıradaki kalıp: merdivende oturmamış İLK kalıp. Seviyenin altındaki
 * kalıplar da atlanmaz — B1 öğrencisinin "istek" kalıbı oturmamışsa oradan
 * başlamak, üstüne kurmaktan iyidir; ama oturmuş olanlar zaten geçilir.
 */
export function nextPattern(map: ProgressMap): Pattern {
  return PATTERN_LADDER.find((p) => !isMastered(map[p.id])) ?? PATTERN_LADDER[PATTERN_LADDER.length - 1];
}

/**
 * Tekrar zamanı gelmiş oturmuş kalıplar: 7 günden uzun süredir çalışılmamış
 * olanlar. Kalıp da kelime gibi kullanılmazsa unutulur.
 */
export function patternsDueForReview(map: ProgressMap, now = new Date(), days = 7): Pattern[] {
  const limit = now.getTime() - days * 86_400_000;
  return PATTERN_LADDER.filter((p) => {
    const pr = map[p.id];
    return isMastered(pr) && pr && new Date(pr.lastAt).getTime() < limit;
  });
}

/** Seviye bandına göre merdivendeki ilerleme özeti. */
export function ladderSummary(map: ProgressMap): { band: Band; done: number; total: number }[] {
  return BANDS.map((band) => {
    const ps = PATTERN_LADDER.filter((p) => p.band === band);
    return { band, done: ps.filter((p) => isMastered(map[p.id])).length, total: ps.length };
  });
}
