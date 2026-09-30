/**
 * CÜMLE KURMA — dil başına YÖNTEM TABLOSU (saf modül; tests/buildmethod.test.ts).
 *
 * Hocanın hamleleri her dilde aynı: bağlacı bul, yüklemden başla, fiile
 * Türkçe sorular sor, ekleri hedef dile eşle, tuzağı ilk seferde göster,
 * toparla. DEĞİŞEN şey dilin kendisi: yuva sırası, soru sırası, Türk
 * öğrencinin o dilde düştüğü tuzaklar ve Türkçede olmayan sistemler.
 *
 * Neden kodda? Tuzak metinleri, karşıtlıklar ve sistem dersleri her dilde
 * SABİT. Modele yazdırmak hem çıktı bütçesini yer hem de İngilizce
 * tuzakların (ago/before, AM/PM) Arapçaya kopyalanması gibi hatalara açık
 * kapı bırakır. Prompt'a yalnız kısa bir hatırlatma (promptBlock) gider;
 * tespit ve öğrenciye gösterilen metin buradan gelir.
 *
 * Buradaki bütün kelime listeleri GÖRÜNEN biçimde (harekeli) yazılır;
 * buildcheck.ts onları karşılaştırma biçimine kendisi indirir. Yalnız tuzak
 * tespit fonksiyonları doğrudan karşılaştırma biçimindeki tokenlarla çalışır.
 */
import type { LanguageId } from "./languages.ts";
import type { Band, ConnKind } from "./sentencebuilding.ts";
import { normalizeArabic, normalizeCyrillic, normalizeLatin, normalizePersian } from "./textnorm.ts";

/** Türk öğrencinin o dilde düştüğü tuzak — hocanın "aklınıza X gelebilir" anı. */
export interface Trap {
  id: string;
  /** Türkçe tetik: "-madan önce", "-la (vasıta)". */
  tr: string;
  /** Tuzak ve doğru tokenlar (karşılaştırma biçiminde). detect yoksa bunlarla tespit edilir. */
  wrong: string[];
  right: string[];
  /** Yapısal tuzaklar (Arapçada eksik أَنْ, لكن + ayrı zamir) için özel tespit. */
  detect?: (given: string[], expected: string[]) => boolean;
  /** Hocanın üslubunda tek satır: "with değil: -la burada vasıta → by". */
  text: string;
  /** Mini örnek çifti: "5 minutes later ↔ after 5 minutes". */
  mini?: [string, string];
  /** Geri çağırma sorusunun seçenekleri: [doğru, tuzak]. */
  pair?: [string, string];
}

/**
 * Türkçede olmayan bir SİSTEM (12'lik saat, Arapçada sıra sayısıyla saat…).
 * Hocanın 4 parçası: (a) Türkçeden farkı, (b) aralıklar/hücreler, (c) tek
 * çözülmüş örnek, (d) bu cümleye uygulama.
 */
export interface SystemLesson {
  id: string;
  title: string;
  a: string;
  b: string;
  c: string;
  d: (finalTarget: string) => string;
  /** Dersi gerektiren adım: hedefin KARŞILAŞTIRMA biçimi (canonicalTokens.join) üzerinde denenir. */
  trigger: RegExp;
  /** Sistem geri geldiğinde sorulan 2 seçenekli karar ("AM mi PM mi?"). */
  retrieval?: {
    q: string;
    options: [string, string];
    pick: (finalTarget: string) => 0 | 1;
    why: (finalTarget: string) => string;
  };
}

export interface ConnectorInfo {
  /** Hedef dildeki bağlaç (görünen biçim). */
  target: string;
  kind: ConnKind;
  /** Bu bağlacın ilk seferde gösterilen tuzağı. */
  trapId?: string;
  /** Bağlaç eksik/yanlışsa gösterilen kural notu. */
  note?: string;
}

export interface LangMethod {
  id: LanguageId;
  /** Yuva sırası — sıra hatasında öğrenciye gösterilir. */
  slotOrder: string;
  /** Türkçe soruların bu dildeki sorulma sırası. */
  questionOrder: string[];
  /** "Kim?" sorusunun bu dildeki karşılığı. */
  subjectRule: string;
  /** Sıklık zarfının yeri — zarf yanlış yerdeyse gösterilen not. */
  adverbRule: string;
  /** Anahtar: Türkçe tetik ("-madan önce", "ama", "çünkü"). */
  connectors: Record<string, ConnectorInfo>;
  /** Yan cümle bağlacının ortaya alınması: serbest, fiil yer değiştirerek, ya da daha az doğal. */
  reorder: "free" | "inversion" | "lessNatural";
  /** Model sıralama göndermezse cihaz iki kısmı kendisi yer değiştirebilir mi. */
  autoReorder: boolean;
  /** Bağlantılı (çünkü) cümlede önceki cümle ile yeni kısım arasına giren ayraç. */
  clauseJoin: string;
  /** Ses tanımanın yutabildiği küçük kelimeler: tek başına farksa "yakın". */
  articles: string[];
  /** Asla "yakın" sayılmayan ek karşılıkları (to, by, at; أَنْ، بِـ …). */
  markers: string[];
  /** Marker eksikse gösterilen kural notu (anahtar: görünen biçim). */
  markerNotes?: Record<string, string>;
  freqAdverbs: string[];
  /** Bölünmeyen kalıplar (in the morning, go to bed …). */
  chunks: string[];
  /** Yalnız SESLİ cevapta eşlenen sesteşler (to/too/two …). */
  homophones: [string, string][];
  /** Süreklilik yapısı (karşılaştırma biçiminde); "alışkanlık" setinde yanlış sayılır. */
  progressive?: RegExp;
  /** 0–12 sayı kelimeleri → rakam (karşılaştırma biçiminde). */
  numberWords?: Record<string, string>;
  /** Saatte sıra sayıları → rakam (Arapça, karşılaştırma biçiminde). */
  hourOrdinals?: Record<string, string>;
  /** "sen/o" geçen cümlede erkek/kadın ayrı biçim var mı. */
  gender?: boolean;
  /** Ses tanımanın ayrı yazabildiği bitişik ön ekler (Arapça ب ل ك و ف). */
  proclitics?: string[];
  traps: Trap[];
  systems: SystemLesson[];
  /** Günlük dil karşılıkları [fushâ, günlük] — yalnız acceptDialect açıkken. */
  dialectSwaps?: [string, string][];
  /** Prompt'a giden Türkçe dil bloğu (≤ 1200 karakter). */
  promptBlock(band: Band): string;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const BAND_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Bant karşılaştırması; C2 henüz Band tipinde olmasa da doğru sıralanır. */
export function bandAtMost(band: string, max: string): boolean {
  const b = BAND_ORDER.indexOf(band);
  return (b < 0 ? 0 : b) <= BAND_ORDER.indexOf(max);
}

const count = (xs: string[], t: string) => xs.filter((x) => x === t).length;

/** Anahtarları karşılaştırma biçimine indirilmiş sözlük. */
function normKeys(raw: Record<string, string>, norm: (s: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) out[norm(k)] = v;
  return out;
}

const ar = normalizeArabic;
const fa = normalizePersian;
const la = normalizeLatin;
const ru = normalizeCyrillic;

/** İlk bulunan saat ifadesi — sistem dersinin (d) parçası için. */
function firstMatch(s: string, re: RegExp): string {
  const m = s.match(re);
  return m ? m[0].trim() : "";
}

// ---------------------------------------------------------------------------
// İngilizce — videonun dili
// ---------------------------------------------------------------------------

const EN_PREFER = /^(prefer|prefers|preferred)$/;
const EN_LEAVE = /^(leave|leaves|left|leaving)$/;
const EN_TURN = /^(turn|turns|turned|turning)$/;
const EN_OPEN = /^(open|opens|opened|opening)$/;

const EN: LangMethod = {
  id: "en",
  slotOrder:
    "[bağlaç] + özne + [sıklık zarfı] + fiil + [nesne / to + fiil / fiil-ing] + [to + yer] + [by + araç | tarz] + [zaman]",
  questionOrder: ["Kim?", "Neyi?", "Nereye?", "Nasıl?/Neyle?", "Ne zaman?"],
  subjectRule: "Kim? Ben → I: özne zamiri hep söylenir, yan cümlede de (before I have breakfast).",
  adverbRule: "Sıklık zarfı özneden hemen sonra, fiilden önce gelir: I sometimes go (hemen vurgu). be'den sonra: I am always …",
  connectors: {
    "-madan önce": { target: "before", kind: "sub", trapId: "en-ago", note: "-madan önce → before + tam cümle (before I have breakfast)." },
    "-dıktan sonra": { target: "after", kind: "sub", trapId: "en-later", note: "-dıktan sonra → after + tam cümle." },
    "-dığımda": { target: "when", kind: "sub", note: "-dığımda → when + tam cümle." },
    "-ince": { target: "when", kind: "sub", note: "-ince → when + tam cümle." },
    "-ken": { target: "while", kind: "sub", note: "-ken → while + tam cümle." },
    "-sa": { target: "if", kind: "sub", note: "-sa (gerçek koşul) → if + geniş zaman." },
    "-ana kadar": { target: "until", kind: "sub", note: "-ana kadar → until + tam cümle." },
    "-masına rağmen": { target: "although", kind: "sub", note: "-masına rağmen → although + tam cümle." },
    ama: { target: "but", kind: "coord", note: "ama → but; alternatif: yeni cümleyle However, …" },
    ancak: { target: "however", kind: "coord", note: "ancak → However, + yeni cümle." },
    "bu yüzden": { target: "so", kind: "coord", note: "bu yüzden → so." },
    çünkü: { target: "because", kind: "causal", note: "çünkü → because + tam cümle; yeri değişmez." },
  },
  reorder: "free",
  autoReorder: true,
  clauseJoin: " ",
  articles: ["a", "an", "the"],
  markers: ["to", "by", "at", "in", "on", "from", "for", "with", "of", "not", "will"],
  markerNotes: {
    to: "-mayı ekini to ile veririz (I like to wake up); -a yön → to (go to work).",
    by: "-la burada vasıta → by, artikelsiz (by metro).",
    at: "Saatlerde at kullanırız (at around 7 PM).",
    in: "in the morning bir kalıp: hep in ile.",
    not: "Olumsuzluk: do/does + not + fiil.",
    will: "-ecek → will + fiil.",
  },
  freqAdverbs: ["always", "usually", "often", "frequently", "sometimes", "rarely", "seldom", "never", "normally", "generally"],
  chunks: [
    "in the morning",
    "in the evening",
    "in the afternoon",
    "at night",
    "go to bed",
    "have breakfast",
    "have lunch",
    "have dinner",
    "take a shower",
    "have a shower",
    "brush my teeth",
    "leave home",
    "go to work",
    "go home",
    "arrive at home",
    "get up",
    "wake up",
    "turn on",
    "turn off",
    "from time to time",
  ],
  homophones: [
    ["to", "too"],
    ["to", "two"],
    ["to", "2"],
    ["too", "2"],
    ["by", "buy"],
    ["by", "bye"],
    ["for", "four"],
    ["for", "4"],
    ["i", "eye"],
    ["know", "no"],
    ["there", "their"],
    ["their", "they're"],
    ["right", "write"],
    ["here", "hear"],
    ["hour", "our"],
    ["new", "knew"],
    ["see", "sea"],
    ["week", "weak"],
  ],
  progressive: /(^| )(am|is|are) \S+ing( |$)/,
  numberWords: {
    zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
    seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
  },
  traps: [
    {
      id: "en-ago",
      tr: "-madan önce",
      wrong: ["ago"],
      right: ["before"],
      text: "ago değil: ago sadece 'X zaman önce' demek (3 days ago). -madan önce anlamı için before + tam cümle.",
      mini: ["3 days ago", "before I have breakfast"],
      pair: ["before", "ago"],
    },
    {
      id: "en-later",
      tr: "-dıktan sonra",
      wrong: ["later"],
      right: ["after"],
      text: "later değil: later 'sonra' demek (5 minutes later = 5 dakika sonra). -dıktan sonra için after + tam cümle.",
      mini: ["5 minutes later", "after 5 minutes"],
      pair: ["after", "later"],
    },
    {
      id: "en-with-by",
      tr: "-la (vasıta)",
      wrong: ["with"],
      right: ["by"],
      text: "with değil: -la burada vasıta, araç → by, artikelsiz (by metro). with = birlikte (with my friend).",
      mini: ["by bus", "with my friend"],
      pair: ["by", "with"],
    },
    {
      id: "en-open",
      tr: "açmak (TV)",
      wrong: ["open"],
      right: ["turn", "on"],
      detect: (g, e) => g.some((t) => EN_OPEN.test(t)) && !e.some((t) => EN_OPEN.test(t)) && e.some((t, i) => EN_TURN.test(t) && (e[i + 1] === "on" || e[i + 1] === "off")),
      text: "open değil: televizyon elektronik bir şey; açarken turn on, kapatırken turn off. open kapı, pencere için.",
      mini: ["turn on the TV", "open the door"],
      pair: ["turn on", "open"],
    },
    {
      id: "en-leave-from",
      tr: "-dan çıkmak",
      wrong: ["leave", "from"],
      right: ["leave"],
      detect: (g, e) => g.some((t, i) => EN_LEAVE.test(t) && g[i + 1] === "from") && !e.some((t, i) => EN_LEAVE.test(t) && e[i + 1] === "from"),
      text: "çıkmak → leave + nesne, edatsız: leave home. leave = ayrılmak, terk etmek; from gerekmez.",
      mini: ["I leave the hospital", "I will leave the mall"],
    },
    {
      id: "en-clock24",
      tr: "saat 13–24",
      wrong: ["19"],
      right: ["7", "pm"],
      detect: (g, e) =>
        e.some((t) => t === "am" || t === "pm") &&
        g.some((t) => /^\d+$/.test(t) && Number(t) >= 13 && Number(t) <= 24) &&
        !e.some((t) => /^\d+$/.test(t) && Number(t) >= 13),
      text: "İngilizcede 13, 14, 15 gibi saatler yok: 12'lik saat + AM/PM. 19 demiyoruz, 7 PM diyoruz.",
      mini: ["19:00", "7 PM"],
    },
  ],
  systems: [
    {
      id: "clock12",
      title: "12'lik saat: AM / PM",
      a: "Türkçede 13, 14, 15 diye sayarız; İngilizcede saat 1'den 12'ye kadar sayılır, 13, 14, 15 gibi kullanımlar yok.",
      b: "AM: gece 00'dan öğlen 12'ye (uyuduğumuz, uyanıp kahvaltı yaptığımız saatler). PM: öğlen 12'den gece 12'ye (iş/okul, işten çıkış, akşam yemeği, yatak).",
      c: "15 derken 3 PM; 19 demiyoruz → 7 PM.",
      d: (t) => {
        const m = firstMatch(t, /\d{1,2}\s*(?:[ap]\.?\s?m\.?)/i);
        return m ? `Bu cümlede: ${m.toUpperCase().replace(/\s+/g, " ")}` : "Bu cümlede: saati 12'lik söyle, ardından AM ya da PM.";
      },
      trigger: /(^| )\d{1,2} (am|pm)( |$)/,
      retrieval: {
        q: "AM mi PM mi?",
        options: ["AM", "PM"],
        pick: (t) => (/\bp\.?\s?m\b/i.test(t) ? 1 : 0),
        why: (t) =>
          /\bp\.?\s?m\b/i.test(t)
            ? "PM: işten çıktığımız, eve gittiğimiz, akşam yemeği yediğimiz, yatağa girdiğimiz saatler."
            : "AM: gece 00'dan öğlene; uyuduğumuz, uyanıp kahvaltı yaptığımız saatler.",
      },
    },
  ],
  promptBlock: () =>
    [
      "DİL: İngilizce.",
      "YUVA SIRASI: [bağlaç] + özne + [sıklık zarfı] + fiil(+parçacık) + [nesne / to+fiil / fiil-ing] + [to + yer] + [by + araç | tarz zarfı] + [zaman]. Soru sırası: Kim? → Neyi? → Nereye? → Nasıl?/Neyle? → Ne zaman?",
      "KİM?: özne zamiri hep yazılır (Ben → I); yan cümlede de sorulur (Kim kahvaltı yapacak? → I have breakfast).",
      "SIKLIK ZARFI: özneden hemen sonra, fiilden önce (I sometimes go): \"hemen vurgu\"; be'den sonra.",
      "EKLER: -mayı(sevmek) → to + fiil (kanonik; -ing a'da) · -meyi(tercih etmek) → -ing · -madan önce → before + tam cümle · -dıktan sonra → after + tam cümle · -dığımda → when · -la(araç) → by, artikelsiz · -a(yön) → to · -dan çıkmak → leave + nesne, edatsız · alışkanlık -iyor → simple present · gibi(saat) → around/about.",
      "SAAT: at + (around/about) + 12'lik saat + AM/PM (\"19\" değil \"7 PM\"); zaman ifadesi kısmın sonunda.",
      "BAĞLAÇ YERİ: before/after/when kısmı ortaya alınabilir (virgül düşer). but/because alınmaz; \"However,\" yeni cümleyle alternatif.",
      "KAYITLI TUZAKLAR (c yazma): ago/before · later/after · with/by · open/turn on · am -ing/geniş zaman.",
      "SİSTEM DERSLERİ: clock12.",
      "ÖRNEK: \"Bazen işe metroyla giderim\" → I sometimes go → Nereye? …to work → Nasıl? …by metro.",
    ].join("\n"),
};

// ---------------------------------------------------------------------------
// Arapça (fushâ) — Türklere özel tuzaklar; İngilizce tuzaklar KOPYALANMAZ
// ---------------------------------------------------------------------------

/** Muzari önekli ya da mazi ekli fiil biçimi (normalize: harekesiz). */
const arVerb = (root: string) => new RegExp(`^(و|ف)?(ا|ي|ت|ن)?${root}(ت|نا|وا|تم|ون|ين|ي)?$`);
const AR_KHARAJA = arVerb("خرج");
const AR_FATAHA = arVerb("فتح");
const AR_SHAGHGHALA = arVerb("شغل");
/**
 * Ardından أَنْ gelmesi gereken kelimeler (normalize). İki ayrı tuzak: zaman
 * bağlacı (-madan önce) ile -mayı fiilleri. Öğrenci -mayı hatası yaptığında
 * henüz görmediği قَبْلَ'den söz etmemek için metinleri ayrı tutulur.
 */
const AR_AN_QABL = new Set(["قَبْلَ", "بَعْدَ"].map(ar));
const AR_AN_VERBS = new Set(
  ["أُحِبُّ", "يُحِبُّ", "تُحِبُّ", "نُحِبُّ", "أُرِيدُ", "يُرِيدُ", "تُرِيدُ", "نُرِيدُ", "أُفَضِّلُ", "يُفَضِّلُ", "تُفَضِّلُ", "نُفَضِّلُ", "يَجِبُ", "أَسْتَطِيعُ"].map(ar)
);

/**
 * أَنْ unutuldu mu: beklenen "X أَنْ FİİL" iken öğrenci "X FİİL" dedi. Yalnız
 * AYNI fiil araya أَنْ girmeden geldiyse tuzak sayılır; قَبْلَ تَنَاوُلِ gibi
 * masdarlı gerçek alternatif (ت ile başlasa da) tuzağa düşmüş sayılmaz.
 */
function arMissingAn(hosts: Set<string>) {
  return (g: string[], e: string[]): boolean => {
    for (let i = 0; i < e.length - 2; i += 1) {
      if (!hosts.has(e[i]) || e[i + 1] !== "ان") continue;
      for (let j = 0; j < g.length - 1; j += 1) {
        if (g[j] === e[i] && g[j + 1] === e[i + 2]) return true;
      }
    }
    return false;
  };
}
const AR_PRONOUNS = new Set(["أَنَا", "هُوَ", "هِيَ", "نَحْنُ", "أَنْتَ", "أَنْتِ", "أَنْتُمْ", "هُمْ"].map(ar));
/** Saatte YANLIŞ olan asıl sayılar (normalize). */
const AR_CARDINALS = new Set(
  ["وَاحِد", "وَاحِدَة", "اِثْنَان", "اِثْنَيْن", "اِثْنَتَان", "اِثْنَتَيْن", "ثَلَاث", "ثَلَاثَة", "أَرْبَع", "أَرْبَعَة", "خَمْس", "خَمْسَة", "سِتّ", "سِتَّة", "سَبْع", "سَبْعَة", "ثَمَان", "ثَمَانِي", "ثَمَانِيَة", "تِسْع", "تِسْعَة", "عَشْر", "عَشَرَة"].map(ar)
);
const AR_SAAT = ar("السَّاعَة");

const AR_HOUR_ORDINALS = normKeys(
  {
    "الأُولَى": "1", "الوَاحِدَة": "1", "الثَّانِيَة": "2", "الثَّالِثَة": "3", "الرَّابِعَة": "4",
    "الخَامِسَة": "5", "السَّادِسَة": "6", "السَّابِعَة": "7", "الثَّامِنَة": "8", "التَّاسِعَة": "9",
    "العَاشِرَة": "10", "الحَادِيَة عَشْرَة": "11", "الثَّانِيَة عَشْرَة": "12",
  },
  ar
);

const AR: LangMethod = {
  id: "ar",
  slotOrder:
    "[bağlaç] + [sıklık zarfı] + FİİL (kişi ekiyle) + [nesne / أَنْ + fiil / masdar] + [إِلَى + yer] + [بِـ + araç | hâl] + [zaman]",
  questionOrder: ["Kim? (fiilin öneki)", "Neyi?", "Nereye?", "Nasıl?/Neyle?", "Ne zaman?"],
  subjectRule: "Kim? Özne fiilin ekinde: أَـ = ben, نَـ = biz, تَـ = sen/o (kadın), يَـ = o; mazide ـتُ = ben. أَنَا gerekmez.",
  adverbRule: "Sıklık zarfı fiilden önce gelir: أَحْيَانًا أَذْهَبُ. Sona da gelebilir ama kalıpta başta.",
  connectors: {
    "-madan önce": { target: "قَبْلَ أَنْ", kind: "sub", trapId: "ar-an", note: "-madan önce → قَبْلَ أَنْ + fiil (fetha)." },
    "-dıktan sonra": { target: "بَعْدَ أَنْ", kind: "sub", trapId: "ar-lahiqan", note: "-dıktan sonra → بَعْدَ أَنْ + fiil." },
    "-dığımda": { target: "عِنْدَمَا", kind: "sub", note: "-dığımda → عِنْدَمَا + fiil." },
    "-ince": { target: "عِنْدَمَا", kind: "sub", note: "-ince → عِنْدَمَا + fiil." },
    "-ken": { target: "بَيْنَمَا", kind: "sub", note: "-ken → بَيْنَمَا." },
    "-sa": { target: "إِذَا", kind: "sub", trapId: "ar-idha-law", note: "-sa (gerçek koşul) → إِذَا + mazi." },
    "-saydı": { target: "لَوْ", kind: "sub", note: "-saydı (hayalî koşul) → لَوْ … لَـ." },
    "-ana kadar": { target: "حَتَّى", kind: "sub", note: "-ana kadar → حَتَّى." },
    "-masına rağmen": { target: "رَغْمَ أَنَّ", kind: "sub", note: "-masına rağmen → رَغْمَ أَنَّ + isim/zamir." },
    ama: { target: "لَكِنْ", kind: "coord", trapId: "ar-lakin", note: "ama → لَكِنْ + fiil, لَكِنَّ + zamir (لَكِنَّنِي)." },
    "bu yüzden": { target: "لِذَلِكَ", kind: "coord", note: "bu yüzden → لِذَلِكَ." },
    çünkü: { target: "لِأَنَّ", kind: "causal", note: "çünkü → لِأَنَّ + zamir/isim (لِأَنَّنِي)." },
  },
  reorder: "free",
  autoReorder: true,
  clauseJoin: " ",
  // ال, و/ف ve gereksiz zamir: ses tanımanın yuttuğu ya da eklediği küçük farklar.
  articles: ["ال", "وَ", "فَ", "أَنَا", "هُوَ"],
  markers: ["أَنْ", "قَبْلَ", "بَعْدَ", "عِنْدَمَا", "لِأَنَّ", "لَكِنْ", "بِـ", "لِـ", "فِي", "مِنْ", "إِلَى", "مَعَ"],
  markerNotes: {
    "أَنْ": "-mayı / -madan önce: araya أَنْ girer, ardından gelen fiil fetha alır.",
    "بِـ": "-la vasıta → بِـ (بِالمِتْرُو); مَعَ = birlikte.",
    "إِلَى": "-e yön → إِلَى; ardından gelen isim kesra alır.",
    "مِنْ": "-den → مِنْ (خَرَجَ مِنَ البَيْتِ).",
    "فِي": "-de / zaman → فِي (فِي الصَّبَاحِ).",
  },
  freqAdverbs: ["أَحْيَانًا", "غَالِبًا", "دَائِمًا", "كَثِيرًا", "عَادَةً", "نَادِرًا", "أَبَدًا"],
  chunks: [
    "فِي الصَّبَاحِ",
    "فِي المَسَاءِ",
    "أَتَنَاوَلُ الفُطُورَ",
    "أُنَظِّفُ أَسْنَانِي",
    "أَخْرُجُ مِنَ البَيْتِ",
    "أَذْهَبُ إِلَى العَمَلِ",
    "أَذْهَبُ إِلَى الفِرَاشِ",
    "أَصِلُ إِلَى البَيْتِ",
    "أُشَغِّلُ التِّلْفَازَ",
    "غَالِبًا مَا",
    "مِنْ حِينٍ لِآخَرَ",
  ],
  // Ses tanıma harekesiz yazar; katlama zaten sesteşleri kapsar.
  homophones: [],
  hourOrdinals: AR_HOUR_ORDINALS,
  gender: true,
  proclitics: ["ب", "ل", "ك", "و", "ف"],
  traps: [
    {
      // Kimlik "ar-an" kalır: bağlaç kartı ve kayıtlı taş ilerlemesi bu kimliği taşıyor.
      id: "ar-an",
      tr: "-madan önce",
      // wrong boş: قَبْلَ doğru cümlede de geçer; tespit yalnız detect ile.
      wrong: [],
      right: [ar("قَبْلَ"), ar("أَنْ")],
      detect: arMissingAn(AR_AN_QABL),
      text: "قَبْلَ'den sonra çekimli fiil doğrudan gelmez; araya أَنْ girer, fiil fetha alır. İsimle doğrudan gelir: قَبْلَ الفُطُورِ (masdarla da olur: قَبْلَ تَنَاوُلِ الفُطُورِ).",
      mini: ["قَبْلَ أَنْ أَتَنَاوَلَ الفُطُورَ", "قَبْلَ الفُطُورِ"],
      pair: ["قَبْلَ أَنْ", "قَبْلَ"],
    },
    {
      id: "ar-an-verb",
      tr: "-mayı (sevmek, istemek)",
      wrong: [],
      right: [ar("أَنْ")],
      detect: arMissingAn(AR_AN_VERBS),
      text: "-mayı ekini أَنْ + fiil ile veririz; fiil fetha alır. Masdar da olur: أُحِبُّ الاسْتِيقَاظَ.",
      mini: ["أُحِبُّ أَنْ أَسْتَيْقِظَ مُبَكِّرًا", "أُحِبُّ الاسْتِيقَاظَ مُبَكِّرًا"],
    },
    {
      id: "ar-maa-bi",
      tr: "-la (vasıta)",
      wrong: [ar("مَعَ")],
      right: ["ب"],
      detect: (g, e) => {
        const maa = ar("مَعَ");
        if (count(g, maa) <= count(e, maa)) return false;
        if (count(e, "ب") > count(g, "ب")) return true;
        for (let j = 0; j < g.length - 1; j += 1) {
          if (g[j] !== maa) continue;
          const bare = g[j + 1].replace(/^ال/, "");
          if (e.includes("ب" + g[j + 1]) || e.includes("ب" + bare)) return true;
        }
        return false;
      },
      text: "-la vasıta → بِـ (بِالمِتْرُو); مَعَ = birlikte (مَعَ صَدِيقِي).",
      mini: ["بِالحَافِلَةِ", "مَعَ صَدِيقِي"],
      pair: ["بِـ", "مَعَ"],
    },
    {
      id: "ar-khuruj",
      tr: "-den çıkmak",
      wrong: [ar("خَرَجَ")],
      right: [ar("خَرَجَ"), ar("مِنْ")],
      detect: (g, e) => {
        const expects = e.some((t, i) => AR_KHARAJA.test(t) && e[i + 1] === "من");
        if (!expects) return false;
        return g.some((t, j) => AR_KHARAJA.test(t) && j + 1 < g.length && g[j + 1] !== "من" && !g[j + 1].startsWith("من"));
      },
      text: "çıkmak → خَرَجَ مِنَ البَيْتِ ya da غَادَرَ البَيْتَ (leave gibi, edatsız).",
      mini: ["أَخْرُجُ مِنَ البَيْتِ", "أُغَادِرُ البَيْتَ"],
    },
    {
      id: "ar-shaghghala",
      tr: "açmak (TV)",
      wrong: [ar("أَفْتَحُ")],
      right: [ar("أُشَغِّلُ")],
      detect: (g, e) => g.some((t) => AR_FATAHA.test(t)) && e.some((t) => AR_SHAGHGHALA.test(t)) && !e.some((t) => AR_FATAHA.test(t)),
      text: "TV açmak → أُشَغِّلُ; أَفْتَحُ kapı/pencere için; kapatmak أُطْفِئُ.",
      mini: ["أُشَغِّلُ التِّلْفَازَ", "أَفْتَحُ البَابَ"],
      pair: ["أُشَغِّلُ", "أَفْتَحُ"],
    },
    {
      id: "ar-lahiqan",
      tr: "-dıktan sonra",
      wrong: [ar("لَاحِقًا")],
      right: [ar("بَعْدَ")],
      text: "لَاحِقًا = sonra (belirsiz); -dıktan sonra → بَعْدَ أَنْ.",
      mini: ["سَأَتَّصِلُ بِكَ لَاحِقًا", "بَعْدَ أَنْ أُنَظِّفَ أَسْنَانِي"],
    },
    {
      id: "ar-lakin",
      tr: "ama + zamir",
      wrong: [ar("لَكِنْ"), ar("أَنَا")],
      right: [ar("لَكِنَّنِي")],
      detect: (g, e) =>
        e.some((t) => /^و?لكن(ني|ي|ه|ها|نا|ك|كم|هم)$/.test(t)) &&
        g.some((t, j) => /^و?لكن$/.test(t) && AR_PRONOUNS.has(g[j + 1] ?? "")),
      text: "zamirle لَكِنَّ(نِي), fiille لَكِنْ.",
      mini: ["لَكِنَّنِي أُفَضِّلُ", "لَكِنْ أُفَضِّلُ"],
    },
    {
      id: "ar-ordinal",
      tr: "saat yedi",
      wrong: [ar("سَبْعَة")],
      right: [ar("السَّابِعَة")],
      detect: (g, e) =>
        g.some((t, j) => t === AR_SAAT && AR_CARDINALS.has(g[j + 1] ?? "")) &&
        e.some((t, i) => t === AR_SAAT && /^\d+$/.test(e[i + 1] ?? "")),
      text: "saatte sıra sayısı: السَّاعَةُ السَّابِعَةُ (سَبْعَة değil).",
      mini: ["السَّاعَةُ السَّابِعَةُ", "سَبْعَةُ كُتُبٍ"],
      pair: ["السَّابِعَة", "سَبْعَة"],
    },
    {
      id: "ar-idha-law",
      tr: "-sa (gerçek koşul)",
      wrong: [ar("لَوْ")],
      right: [ar("إِذَا")],
      text: "إِذَا gerçek, لَوْ hayalî koşul.",
      mini: ["إِذَا اسْتَيْقَظْتُ مُبَكِّرًا", "لَوْ كُنْتُ غَنِيًّا"],
    },
  ],
  systems: [
    {
      id: "saat-sira",
      title: "Saat: sıra sayısı + صَبَاحًا / مَسَاءً",
      a: "Türkçe 'saat yedi' der; Arapça saatte SIRA sayısı kullanır: السَّاعَةُ السَّابِعَةُ (yedinci saat).",
      b: "صَبَاحًا: gece yarısından öğlene (uyku, uyanma, kahvaltı). مَسَاءً: akşam (işten çıkış, eve dönüş, akşam yemeği, yatak).",
      c: "19:00 → السَّابِعَةُ مَسَاءً; gibi → حَوَالَيْ.",
      d: (t) => {
        const m = firstMatch(t, /(?:حَ?وَ?ا?لَ?يْ?\S*\s+)?ال?سَّ?ا?عَ?ة\S*\s+\S+(?:\s+(?:صَبَاحًا|مَسَاءً|صباحا|مساء))?/);
        return m ? `Bu cümlede: ${m}` : "Bu cümlede: السَّاعَة + dişil sıra sayısı + صَبَاحًا/مَسَاءً.";
      },
      trigger: /(^| )الساعه \d|(^| )(صباحا|مساء)( |$)/,
      retrieval: {
        q: "صَبَاحًا mı مَسَاءً mı?",
        options: ["صَبَاحًا", "مَسَاءً"],
        pick: (t) => (ar(t).includes("مساء") ? 1 : 0),
        why: (t) =>
          ar(t).includes("مساء")
            ? "مَسَاءً: işten çıktığımız, eve döndüğümüz, akşam yemeği yediğimiz, yatağa girdiğimiz saatler."
            : "صَبَاحًا: uyuduğumuz, uyanıp kahvaltı yaptığımız saatler.",
      },
    },
    {
      id: "ikil",
      title: "İkil (müsenna)",
      a: "Türkçede tekil ve çoğul var; Arapçada İKİ için ayrı bir biçim, ikil var.",
      b: "Kim? (merfû) → ـَانِ: كِتَابَانِ · Neyi? / edattan sonra → ـَيْنِ: كِتَابَيْنِ · üç ve üstü → çoğul.",
      c: "iki kitap → كِتَابَانِ (ayrıca اِثْنَانِ demeye gerek yok).",
      d: (t) => {
        const m = firstMatch(t, /\S+َ(?:ا|يْ)نِ(?=\s|$|[،.])/);
        return m ? `Bu cümlede: ${m} (ikil)` : "Bu cümlede: iki şey sayılıyorsa isme ـَانِ / ـَيْنِ ekle.";
      },
      trigger: /(^| )(اثنان|اثنين|اثنتان|اثنتين)( |$)|\S{3,}(ان|ين)( |$)/,
    },
    {
      id: "sayi-cinsiyet",
      title: "Sayı–cinsiyet (3–10)",
      a: "Türkçede sayı hiç değişmez; Arapçada 3–10 arası sayı, saydığı ismin TERSİ cinsiyeti alır.",
      b: "Eril isim → sayı ة'li: ثَلَاثَةُ كُتُبٍ · Dişil isim → sayı ة'siz: ثَلَاثُ سَيَّارَاتٍ · 1–2 isimle uyumlu; sayılan isim çoğul ve kesralı.",
      c: "üç kitap → ثَلَاثَةُ كُتُبٍ (كِتَابٌ eril, sayı ة alır).",
      d: (t) => {
        const m = firstMatch(ar(t), /(ثلاث|اربع|خمس|ست|سبع|ثماني|ثمان|تسع|عشر)ه? \S+/);
        return m ? `Bu cümlede: ${m}; ismin cinsiyetine bak, sayı tersini alır.` : "Bu cümlede: sayılan ismin cinsiyetine bak, sayı tersini alır.";
      },
      trigger: /(^| )(ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه|ثماني|ثمانيه|تسع|تسعه|عشر|عشره) \S+/,
    },
    {
      id: "olumsuzluk",
      title: "Olumsuzluk: لَا / لَمْ / لَنْ / لَيْسَ",
      a: "Türkçede olumsuzluk tek ek (-ma/-me); Arapçada zamana göre ayrı edat gelir.",
      b: "şimdi/geniş → لَا + muzari · geçmiş → لَمْ + meczum muzari · gelecek → لَنْ + mansub muzari · isim cümlesi → لَيْسَ.",
      c: "gitmedim → لَمْ أَذْهَبْ (mazi değil, muzari + sükûn).",
      d: (t) => {
        const m = firstMatch(t, /(?:^|\s)(لَا|لَمْ|لَنْ|لَيْسَ|لَسْتُ|لا|لم|لن|ليس|لست)\s+\S+/);
        return m ? `Bu cümlede: ${m}` : "Bu cümlede: zamana göre لَا / لَمْ / لَنْ seç.";
      },
      trigger: /(^| )(لا|لم|لن|ليس|لست)( |$)/,
    },
    {
      id: "irab",
      title: "İ'rab: soruların cevabı harekede",
      a: "Türkçede hâl ekleri kelimenin sonunda görünür; Arapçada da öyle, ama kısa ünlü (hareke) olarak.",
      b: "Kim? → ‑u (merfû) · Neyi? → ‑a (mansûb) · Kimin? / edattan sonra → ‑i (mecrûr).",
      c: "Öğrenci kitabı okudu → قَرَأَ الطَّالِبُ الكِتَابَ (Kim: ‑u, Neyi: ‑a).",
      d: (t) => {
        const m = firstMatch(t, /(?:^|\s)(إِلَى|فِي|مِنْ|مِنَ|عَلَى|عَنْ|مَعَ)\s+\S+/);
        return m ? `Bu cümlede: ${m.trim()} (edattan sonra ‑i)` : "Bu cümlede: Kim? ‑u, Neyi? ‑a, edattan sonra ‑i.";
      },
      trigger: /(^| )(في|من|الي|علي|عن|مع)( |$)/,
    },
    {
      id: "fiil-kaliplari",
      title: "Fiil kalıpları (I–X): bir ek tablosu",
      a: "Türkçede anlam fiile ek eklenerek değişir (yap-tır, yap-ıl); Arapçada kök aynı kalır, KALIP değişir.",
      b: "I فَعَلَ temel · II فَعَّلَ ettirgen/yoğun · III فَاعَلَ karşılıklı · IV أَفْعَلَ ettirgen · V تَفَعَّلَ · VI تَفَاعَلَ birlikte · VII اِنْفَعَلَ edilgen · VIII اِفْتَعَلَ · X اِسْتَفْعَلَ istemek/saymak.",
      c: "öğrendi دَرَسَ → öğretti دَرَّسَ (II: ettirgen).",
      d: (t) => {
        const m = firstMatch(t, /\S*[اأيتن]?ِ?سْ?تَ\S{3,}/);
        return m ? `Bu cümlede: ${m} (X. kalıp)` : "Bu cümlede: fiilin kökünü bul, kalıbı anlamı söyler.";
      },
      trigger: /(^| )[ايتن]?ست\S{3,}( |$)/,
    },
  ],
  dialectSwaps: [
    ["أُشَغِّلُ", "أَفْتَحُ"],
    ["أُرِيدُ", "بَدِّي"],
    ["لَكِنْ", "بَسّ"],
  ],
  promptBlock: (band) =>
    [
      `DİL: Arapça (fushâ). ${bandAtMost(band, "B1") ? "Hedef metin TAM harekeli." : "Hareke: öğretilen ve anlamı ayıran kelimelerde."}`,
      "YUVA SIRASI: [bağlaç] + [sıklık zarfı] + FİİL + [nesne / أَنْ + fiil / masdar] + [إِلَى + yer] + [بِـ + araç | hâl] + [zaman]. Soru sırası: Kim? → Neyi? → Nereye? → Nasıl?/Neyle? → Ne zaman?",
      "KİM?: özne fiilin ekinde (أَـ ben, نَـ biz, تَـ sen/o(k), يَـ o; mazide ـتُ ben); أَنَا YAZMA. sen/o varsa erkek hâli t'de, kadın hâli sw'de (dişil).",
      "SIKLIK ZARFI: fiilden önce; sonda olursa sw.",
      "EKLER: -mayı (أُحِبُّ/أُرِيدُ) → أَنْ + mansub, masdar a'da · أُفَضِّلُ + masdar, أَنْ a'da · -madan önce → قَبْلَ أَنْ + mansub (a: قَبْلَ + masdar) · -dıktan sonra → بَعْدَ أَنْ · ama → لَكِنْ / لَكِنَّنِي · çünkü → لِأَنَّ + zamir · araç → بِـ, birliktelik → مَعَ · çıkmak → خَرَجَ مِنْ.",
      "SAAT: السَّاعَةِ + DİŞİL SIRA SAYISI + صَبَاحًا/مَسَاءً; gibi → حَوَالَيْ.",
      "BAĞLAÇ YERİ: -dığımda → عِنْدَمَا; yan cümle sona alınabilir; لَكِنْ/لِأَنَّ yer değiştirmez.",
      "KAYITLI TUZAKLAR (c yazma): أَنْ eksik · araçta مَعَ · خَرَجَ مِنْ · TV için أُشَغِّلُ · saatte sıra sayısı · لَكِنَّ + zamir · إِذَا/لَوْ · لَاحِقًا. Başka dilin tuzağını taşıma.",
      "SİSTEM DERSLERİ: saat-sira, ikil, sayi-cinsiyet, olumsuzluk, irab, fiil-kaliplari.",
    ].join("\n"),
};

// ---------------------------------------------------------------------------
// Almanca — V2, TeKaMoLo, yan cümlede fiil sonda
// ---------------------------------------------------------------------------

const DE: LangMethod = {
  id: "de",
  slotOrder: "[bağlaç/zaman] + çekimli FİİL (2.) + özne + [sıklık zarfı] + [zaman] + [tarz] + [yer] + [ayrılan ön ek / mastar SONDA]",
  questionOrder: ["Kim?", "Ne zaman?", "Nasıl?/Neyle?", "Nereye?", "Neyi?"],
  subjectRule: "Kim? Ben → ich: özne zamiri hep söylenir.",
  adverbRule: "Sıklık zarfı çekimli fiilden hemen sonra gelir: ich fahre manchmal …",
  connectors: {
    "-madan önce": { target: "bevor", kind: "sub", trapId: "de-vor-bevor", note: "-madan önce → bevor; yan cümlede fiil SONDA." },
    "-dıktan sonra": { target: "nachdem", kind: "sub", note: "-dıktan sonra → nachdem + (geçmiş); fiil sonda." },
    "-dığımda": { target: "wenn", kind: "sub", trapId: "de-wenn-als", note: "-dığımda (her seferinde) → wenn; fiil sonda." },
    "-ken": { target: "während", kind: "sub", note: "-ken → während; fiil sonda." },
    "-sa": { target: "wenn", kind: "sub", note: "-sa → wenn; fiil sonda." },
    ama: { target: "aber", kind: "coord", note: "ama → aber; sıra değişmez." },
    çünkü: { target: "weil", kind: "causal", note: "çünkü → weil; fiil yan cümlenin SONUNA gider." },
  },
  reorder: "inversion",
  autoReorder: false,
  clauseJoin: ", ",
  articles: ["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines"],
  markers: ["zu", "nach", "um", "mit", "in", "im", "am", "auf", "aus", "von", "nicht", "kein"],
  markerNotes: {
    um: "Saatte um: um 7 Uhr.",
    mit: "-la araç → mit dem Bus: Türkçe gibi.",
    zu: "-mayı → zu + mastar (ich versuche zu …).",
  },
  freqAdverbs: ["immer", "oft", "manchmal", "selten", "nie", "meistens", "normalerweise"],
  chunks: ["am morgen", "am abend", "ins bett gehen", "zur arbeit", "nach hause", "zu hause"],
  homophones: [
    ["das", "dass"],
    ["seid", "seit"],
    ["wieder", "wider"],
    ["mal", "mahl"],
    ["wird", "wirt"],
  ],
  numberWords: {
    null: "0", eins: "1", zwei: "2", drei: "3", vier: "4", fünf: "5", sechs: "6",
    sieben: "7", acht: "8", neun: "9", zehn: "10", elf: "11", zwölf: "12",
  },
  traps: [
    {
      id: "de-wenn-als",
      tr: "-dığımda",
      wrong: ["als"],
      right: ["wenn"],
      text: "Alışkanlık, her seferinde (-dığımda) → wenn; geçmişte TEK bir kez → als.",
      mini: ["Wenn ich nach Hause komme, …", "Als ich ein Kind war, …"],
      pair: ["wenn", "als"],
    },
    {
      id: "de-oeffnen",
      tr: "açmak (TV)",
      wrong: [la("öffne")],
      right: [la("schalte"), "ein"],
      detect: (g, e) => g.some((t) => /^offne/.test(t)) && e.some((t) => /^(schalt|einschalt)/.test(t)) && !e.some((t) => /^offne/.test(t)),
      text: "TV açmak: öffnen değil, einschalten (ich schalte den Fernseher ein). öffnen kapı, pencere için.",
      mini: ["Ich schalte den Fernseher ein.", "Ich öffne die Tür."],
      pair: ["einschalten", "öffnen"],
    },
    {
      id: "de-vor-bevor",
      tr: "-madan önce",
      wrong: ["vor"],
      right: ["bevor"],
      text: "vor + isim (vor dem Frühstück; vor 5 Minuten = 5 dakika önce). -madan önce + cümle → bevor, fiil sonda.",
      mini: ["vor 5 Minuten", "bevor ich frühstücke"],
      pair: ["bevor", "vor"],
    },
  ],
  systems: [
    {
      id: "v2-fiil-sonda",
      title: "Fiilin yeri: ikinci sıra / sonda",
      a: "Türkçede fiil hep sonda. Almancada ana cümlede çekimli fiil İKİNCİ sırada, yan cümlede (weil, wenn, bevor) SONDA.",
      b: "Ana cümle: Ich dusche morgens · Yan cümle: …, weil ich Nachrichten sehe · Yan cümle başa gelirse ana cümlede fiil özneden önce: Bevor ich frühstücke, dusche ich.",
      c: "Kahvaltı yapmadan önce duş alırım → Bevor ich frühstücke, dusche ich.",
      d: (t) => {
        const m = firstMatch(t, /\b(weil|wenn|bevor|nachdem|als|dass|während)\b[^,.]*/i);
        return m ? `Bu cümlede: ${m} (fiil sonda)` : "Bu cümlede: çekimli fiil ikinci sırada.";
      },
      trigger: /(^| )(weil|wenn|bevor|nachdem|als|dass|wahrend|ob)( |$)/,
    },
  ],
  promptBlock: () =>
    [
      "DİL: Almanca.",
      "YUVA SIRASI (V2): [bağlaç/zaman] + çekimli FİİL İKİNCİ + özne + [sıklık zarfı] + [zaman] + [tarz: mit dem Bus] + [yer] + [ayrılan ön ek/mastar SONDA]. TeKaMoLo: Soru sırası: Kim? → Ne zaman? → Nasıl?/Neyle? → Nereye? → Neyi?",
      "KİM?: özne zamiri hep yazılır (ich).",
      "AYRILAN FİİL: çapa ikili kurulur: ich stehe … auf (aufstehen); ön ek hep sonda.",
      "SIKLIK ZARFI: çekimli fiilden hemen sonra (ich fahre manchmal …).",
      "EKLER: -madan önce → bevor + fiil sonda · -dıktan sonra → nachdem · -dığımda (her seferinde) → wenn · çünkü → weil, fiil sonda · -la araç → mit dem Bus (Türkçe gibi; with/by tuzağı yok) · alışkanlık -iyor → Präsens.",
      "SAAT: um + saat (um 7 Uhr abends); gibi → gegen.",
      "BAĞLAÇ YERİ: yan cümle başa gelince ana cümlede fiil öne geçer (Bevor ich frühstücke, dusche ich); ortaya alınca fiil yerine döner: öğretilen nokta bu. aber/weil kısmı başa alınmaz.",
      "KAYITLI TUZAKLAR (c yazma): wenn/als · öffnen/einschalten · vor/bevor.",
      "SİSTEM DERSLERİ: v2-fiil-sonda.",
    ].join("\n"),
};

// ---------------------------------------------------------------------------
// Farsça — SOV: fiil çapa ama hep SONDA; with/by tuzağı YOK
// ---------------------------------------------------------------------------

const FA: LangMethod = {
  id: "fa",
  slotOrder: "özne + [zaman] + [sıklık zarfı] + [tarz: با + araç] + [nesne (+ را) / yön] + FİİL (sonda)",
  questionOrder: ["Kim? (fiilin kişi eki)", "Ne zaman?", "Nasıl?/Neyle?", "Neyi?", "Nereye?"],
  subjectRule: "Kim? Kişi eki fiilde: ‑am ben, ‑i sen, ‑ad o, ‑im biz; من yazmak gerekmez.",
  adverbRule: "Sıklık zarfı fiilden önce, genelde zamandan sonra gelir: گاهی با مترو می‌روم.",
  connectors: {
    "-madan önce": { target: "قبل از اینکه", kind: "sub", note: "-madan önce → قبل از اینکه + dilek kipi." },
    "-dıktan sonra": { target: "بعد از اینکه", kind: "sub", note: "-dıktan sonra → بعد از اینکه." },
    "-dığımda": { target: "وقتی", kind: "sub", note: "-dığımda → وقتی (که)." },
    "-sa": { target: "اگر", kind: "sub", note: "-sa → اگر." },
    ama: { target: "اما", kind: "coord", note: "ama → اما / ولی." },
    çünkü: { target: "چون", kind: "causal", note: "çünkü → چون / زیرا." },
  },
  reorder: "lessNatural",
  autoReorder: false,
  clauseJoin: " ",
  articles: [],
  markers: ["را", "به", "از", "با", "در", "تا"],
  markerNotes: {
    "را": "Belirli nesne → را (کتاب را); Türkçedeki -ı gibi.",
    "به": "-e yön → به.",
    "با": "-la → با (hem vasıta hem birliktelik).",
  },
  freqAdverbs: ["همیشه", "اغلب", "گاهی", "معمولا", "هرگز", "بیشتر"],
  chunks: ["صبحانه می‌خورم", "دوش می‌گیرم", "سر کار", "به خانه"],
  homophones: [],
  traps: [
    {
      id: "fa-ra",
      tr: "-ı (belirli nesne)",
      wrong: [],
      right: [fa("را")],
      detect: (g, e) => count(e, fa("را")) > count(g, fa("را")) && g.length >= e.length - 1,
      text: "Belirli nesne → را: کتاب را خواندم (kitabı okudum). Belirsizse را yok: کتابی خواندم.",
      mini: ["کتاب را خواندم", "کتابی خواندم"],
    },
    {
      id: "fa-mi",
      tr: "geniş zaman (alışkanlık)",
      wrong: [],
      right: [fa("می")],
      detect: (g, e) =>
        e.some((t) => t.startsWith(fa("می")) && t.length > 3 && g.includes(t.slice(2))),
      text: "Alışkanlık → می + şimdiki gövde: هر روز می‌روم. می olmadan dilek kipi olur.",
      mini: ["هر روز می‌روم", "بروم"],
    },
  ],
  systems: [
    {
      id: "ezafe-ra",
      title: "Ezafe ve را",
      a: "Türkçede tamlama ve sıfat isimden ÖNCE gelir, belirli nesne -ı alır. Farsçada sıra ters: isim + ‑e + sıfat; belirli nesneden sonra را.",
      b: "ezafe: کتابِ من (benim kitabım), خانهٔ بزرگ (büyük ev) · belirli nesne: کتاب را خواندم · belirsiz: کتابی خواندم.",
      c: "Büyük evi gördüm → خانهٔ بزرگ را دیدم.",
      d: (t) => {
        const m = firstMatch(t, /\S+\s+را/);
        return m ? `Bu cümlede: ${m}` : "Bu cümlede: belirli nesne varsa را ekle; sıfat isimden sonra, ‑e ile.";
      },
      trigger: /(^| )را( |$)/,
    },
  ],
  promptBlock: () =>
    [
      "DİL: Farsça.",
      "YUVA SIRASI (SOV): özne + [zaman] + [sıklık zarfı] + [با + araç] + [nesne (+ را) / به + yer] + FİİL. Fiil çapadır: ÖNCE kurulur ama hep SONDA kalır; yeni parçalar fiilin ÖNÜNE eklenir.",
      "Soru sırası: Kim? (kişi eki) → Ne zaman? → Nasıl?/Neyle? → Neyi? → Nereye?",
      "KİM?: kişi eki fiilde (‑am ben, ‑im biz); من yazmak gerekmez, a'da olur.",
      "EKLER: belirli nesne → را · tamlama/sıfat → ezafe (‑e) · alışkanlık → می + şimdiki gövde · -madan önce → قبل از اینکه + dilek kipi · -dıktan sonra → بعد از اینکه · -dığımda → وقتی · -la → با (vasıta da birliktelik de).",
      "BAĞLAÇ YERİ: bağlaçlı kısım neredeyse hep başta; ortaya almak mümkün ama daha az doğal (isteğe bağlı).",
      "KAYITLI TUZAKLAR (c yazma): را eksik · می eksik. با tek edat: vasıta/birliktelik ayrımı YOK.",
      "SİSTEM DERSLERİ: ezafe-ra.",
    ].join("\n"),
};

// ---------------------------------------------------------------------------
// Rusça — Nasıl? sorusu fiili seçer (yaya/araç, bir kez/alışkanlık)
// ---------------------------------------------------------------------------

const RU_HODIT = /^(хожу|ходишь|ходит|ходим|ходите|ходят|ходить|езжу|ездишь|ездит|ездим|ездите|ездят|ездить)$/;
const RU_IDTI = /^(иду|идешь|идет|идем|идете|идут|идти|еду|едешь|едет|едем|едете|едут|ехать)$/;

const RU: LangMethod = {
  id: "ru",
  slotOrder: "[bağlaç] + özne + [sıklık zarfı] + fiil + [nesne] + [yön: в/на + yer] + [araç: на + araç] + [zaman]; yeni bilgi sona",
  questionOrder: ["Kim?", "Nasıl? (yaya mı araçla mı?)", "Ne sıklıkla? (bir kez mi alışkanlık mı?)", "Nereye?", "Ne zaman?"],
  subjectRule: "Kim? Ben → я: zamir genelde söylenir (я люблю).",
  adverbRule: "Sıklık zarfı fiilden önce gelir: я иногда езжу …",
  connectors: {
    "-madan önce": { target: "перед тем как", kind: "sub", note: "-madan önce → перед тем как + mastar." },
    "-dıktan sonra": { target: "после того как", kind: "sub", note: "-dıktan sonra → после того как." },
    "-dığımda": { target: "когда", kind: "sub", note: "-dığımda → когда." },
    "-sa": { target: "если", kind: "sub", note: "-sa → если." },
    ama: { target: "но", kind: "coord", note: "ama → но; virgülle." },
    çünkü: { target: "потому что", kind: "causal", note: "çünkü → потому что; virgülle." },
  },
  reorder: "free",
  autoReorder: true,
  clauseJoin: ", ",
  articles: [],
  markers: ["в", "на", "с", "к", "из", "от", "до", "не"],
  markerNotes: {
    "на": "Araçla → на + araç (на автобусе, на метро).",
    "в": "Yön/yer → в + yer (в школу, в школе).",
  },
  freqAdverbs: ["всегда", "часто", "иногда", "редко", "никогда", "обычно"],
  chunks: ["по утрам", "на работу", "домой", "ложусь спать"],
  homophones: [],
  traps: [
    {
      id: "ru-hodit-idti",
      tr: "gitmek (alışkanlık / şu an)",
      wrong: [ru("иду")],
      right: [ru("хожу")],
      detect: (g, e) =>
        (e.some((t) => RU_HODIT.test(t)) && g.some((t) => RU_IDTI.test(t)) && !e.some((t) => RU_IDTI.test(t))) ||
        (e.some((t) => RU_IDTI.test(t)) && g.some((t) => RU_HODIT.test(t)) && !e.some((t) => RU_HODIT.test(t))),
      text: "Alışkanlık, gidip gelme → ходить (хожу); şu an tek yöne → идти (иду). Araçla: ездить / ехать.",
      mini: ["Я каждый день хожу в школу.", "Я сейчас иду в школу."],
      pair: ["хожу", "иду"],
    },
    {
      id: "ru-na-transport",
      tr: "-la (vasıta)",
      wrong: [ru("с")],
      right: [ru("на")],
      text: "Araçla → на + araç (на автобусе) ya da автобусом; с = birlikte (с другом).",
      mini: ["на автобусе", "с другом"],
      pair: ["на", "с"],
    },
  ],
  systems: [
    {
      id: "hareket-gorunus",
      title: "Hareket fiilleri ve görünüş",
      a: "Türkçede 'gitmek' tek fiil; Rusçada yaya/araçla ve bir kez/alışkanlık ayrı fiillerdir.",
      b: "yaya: идти (şu an, tek yön) / ходить (alışkanlık) · araçla: ехать (şu an) / ездить (alışkanlık).",
      c: "Her gün işe otobüsle giderim → Каждый день я езжу на работу на автобусе.",
      d: (t) => {
        const m = firstMatch(ru(t), /(^| )(иду|идешь|идет|идем|идут|хожу|ходит|ходим|ходят|еду|едет|едем|едут|езжу|ездит|ездим|ездят)( |$)/);
        return m ? `Bu cümlede: ${m.trim()}` : "Bu cümlede: önce 'yaya mı araçla mı', sonra 'bir kez mi alışkanlık mı' diye sor.";
      },
      trigger: /(^| )(иду|идешь|идет|идем|идете|идут|хожу|ходишь|ходит|ходим|ходите|ходят|еду|едешь|едет|едем|едете|едут|езжу|ездишь|ездит|ездим|ездите|ездят)( |$)/,
      retrieval: {
        q: "Yaya mı araçla mı?",
        options: ["идти / ходить", "ехать / ездить"],
        pick: (t) => (/(^| )(еду|едешь|едет|едем|едете|едут|ехать|езжу|ездишь|ездит|ездим|ездите|ездят|ездить)( |$)/.test(ru(t)) ? 1 : 0),
        why: (t) =>
          /(^| )(еду|едет|езжу|ездит|ездим|едем|едут|ездят)( |$)/.test(ru(t))
            ? "Araçla: ехать / ездить (на автобусе, на метро)."
            : "Yaya: идти / ходить.",
      },
    },
  ],
  promptBlock: () =>
    [
      "DİL: Rusça.",
      "YUVA SIRASI: [bağlaç] + özne + [sıklık zarfı] + fiil + [nesne] + [в/на + yer] + [на + araç] + [zaman]; yeni/odak bilgi sona.",
      "Soru sırası: Kim? → Nasıl? (yaya mı araçla mı? fiili bu seçer) → bir kez mi alışkanlık mı? → Nereye? → Ne zaman?",
      "KİM?: zamir genelde yazılır (я люблю).",
      "EKLER: -madan önce → перед тем как + mastar · -dıktan sonra → после того как · -dığımda → когда · çünkü → , потому что · ama → , но · -la araç → на + araç · alışkanlık → ходить/ездить, şu an → идти/ехать.",
      "BAĞLAÇ YERİ: когда / перед тем как kısmı ortaya alınabilir (virgül kalır). но / потому что yer değiştirmez.",
      "KAYITLI TUZAKLAR (c yazma): ходить/идти · araçta с.",
      "SİSTEM DERSLERİ: hareket-gorunus.",
    ].join("\n"),
};

// ---------------------------------------------------------------------------
// İspanyolca, İtalyanca, Fransızca
// ---------------------------------------------------------------------------

const ES: LangMethod = {
  id: "es",
  slotOrder: "[bağlaç] + [özne] + [sıklık zarfı] + fiil + [nesne / mastar] + [a + yer] + [en + araç] + [zaman]",
  questionOrder: ["Kim? (fiil eki)", "Neyi?", "Nereye?", "Nasıl?/Neyle?", "Ne zaman?"],
  subjectRule: "Kim? Özne fiilin ekinde (voy = giderim); yo söylemek gerekmez, a'da olur.",
  adverbRule: "Sıklık zarfı fiilden önce ya da sonra gelebilir: a veces voy / voy a veces.",
  connectors: {
    "-madan önce": { target: "antes de", kind: "sub", trapId: "es-hace-antes", note: "-madan önce → antes de + mastar (aynı özne)." },
    "-dıktan sonra": { target: "después de", kind: "sub", note: "-dıktan sonra → después de + mastar." },
    "-dığımda": { target: "cuando", kind: "sub", note: "-dığımda → cuando." },
    "-sa": { target: "si", kind: "sub", note: "-sa → si." },
    ama: { target: "pero", kind: "coord", note: "ama → pero." },
    çünkü: { target: "porque", kind: "causal", note: "çünkü → porque." },
  },
  reorder: "free",
  autoReorder: true,
  clauseJoin: " ",
  articles: ["el", "la", "los", "las", "un", "una", "unos", "unas"],
  markers: ["a", "al", "de", "del", "en", "con", "por", "para", "no"],
  markerNotes: { en: "-la vasıta → en (en metro).", a: "-e yön → a (voy al trabajo)." },
  freqAdverbs: ["siempre", "veces", "menudo", "frecuentemente", "nunca", "normalmente"],
  chunks: ["por la manana", "a veces", "al trabajo", "a casa", "me ducho", "me acuesto"],
  homophones: [
    ["a", "ha"],
    ["e", "he"],
    ["o", "ho"],
  ],
  progressive: /(^| )(estoy|estas|esta|estamos|estais|estan) \S+(ando|iendo)( |$)/,
  numberWords: {
    cero: "0", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6",
    siete: "7", ocho: "8", nueve: "9", diez: "10", once: "11", doce: "12",
  },
  traps: [
    {
      id: "es-hace-antes",
      tr: "-madan önce",
      wrong: ["hace"],
      right: ["antes"],
      text: "hace = 'X zaman önce' (hace cinco minutos). -madan önce → antes de + mastar.",
      mini: ["hace cinco minutos", "antes de desayunar"],
      pair: ["antes de", "hace"],
    },
    {
      id: "es-con-en",
      tr: "-la (vasıta)",
      wrong: ["con"],
      right: ["en"],
      text: "-la vasıta → en (en metro); con = birlikte (con mi amigo).",
      mini: ["en autobús", "con mi amigo"],
      pair: ["en", "con"],
    },
    {
      id: "es-abrir-encender",
      tr: "açmak (TV)",
      wrong: ["abro"],
      right: ["enciendo"],
      detect: (g, e) => g.some((t) => /^abr/.test(t)) && e.some((t) => /^(enciend|encend|prend)/.test(t)) && !e.some((t) => /^abr/.test(t)),
      text: "TV açmak → encender (enciendo la tele); abrir kapı, pencere için.",
      mini: ["enciendo la tele", "abro la puerta"],
      pair: ["enciendo", "abro"],
    },
  ],
  systems: [
    {
      id: "ser-estar",
      title: "ser / estar",
      a: "Türkçede 'olmak' tek; İspanyolcada kalıcı nitelik ser, geçici durum ve yer estar.",
      b: "ser: kimlik, meslek, milliyet, saat (soy profesor, son las siete) · estar: yer, geçici durum (estoy cansado, estoy en casa).",
      c: "Yorgunum → Estoy cansado (geçici).",
      d: (t) => {
        const m = firstMatch(la(t), /(^| )(soy|eres|es|somos|son|estoy|estas|esta|estamos|estan) \S+/);
        return m ? `Bu cümlede: ${m.trim()}` : "Bu cümlede: kalıcı mı geçici mi diye sor.";
      },
      trigger: /(^| )(soy|eres|es|somos|son|estoy|estas|esta|estamos|estan)( |$)/,
    },
  ],
  promptBlock: () =>
    [
      "DİL: İspanyolca.",
      "YUVA SIRASI: [bağlaç] + [özne] + [sıklık zarfı] + fiil + [nesne / mastar] + [a + yer] + [en + araç] + [zaman]. Soru sırası: Kim? (fiil eki) → Neyi? → Nereye? → Nasıl?/Neyle? → Ne zaman?",
      "KİM?: özne fiilin ekinde (voy); yo yazma, sw'de ver.",
      "SIKLIK ZARFI: fiilden önce ya da sonra (a veces voy / voy a veces); ikisi de doğru.",
      "EKLER: -madan önce → antes de + mastar · -dıktan sonra → después de + mastar · -dığımda → cuando · -mayı sevmek → me gusta + mastar · -la araç → en · alışkanlık -iyor → presente.",
      "SAAT: a las + saat (a las siete de la tarde); gibi → sobre / alrededor de.",
      "BAĞLAÇ YERİ: antes de / después de / cuando kısmı ortaya alınabilir. pero / porque yer değiştirmez.",
      "KAYITLI TUZAKLAR (c yazma): hace/antes · con/en · abrir/encender.",
      "SİSTEM DERSLERİ: ser-estar.",
    ].join("\n"),
};

const IT: LangMethod = {
  id: "it",
  slotOrder: "[bağlaç] + [özne] + fiil + [sıklık zarfı] + [nesne / mastar] + [a/in + yer] + [in + araç] + [zaman]",
  questionOrder: ["Kim? (fiil eki)", "Neyi?", "Nereye?", "Nasıl?/Neyle?", "Ne zaman?"],
  subjectRule: "Kim? Özne fiilin ekinde (vado = giderim); io söylemek gerekmez, a'da olur.",
  adverbRule: "Sıklık zarfı genelde fiilden sonra, başta da olabilir: vado spesso / a volte vado.",
  connectors: {
    "-madan önce": { target: "prima di", kind: "sub", trapId: "it-fa-prima", note: "-madan önce → prima di + mastar." },
    "-dıktan sonra": { target: "dopo", kind: "sub", note: "-dıktan sonra → dopo aver + ortaç." },
    "-dığımda": { target: "quando", kind: "sub", note: "-dığımda → quando." },
    "-sa": { target: "se", kind: "sub", note: "-sa → se." },
    ama: { target: "ma", kind: "coord", note: "ama → ma." },
    çünkü: { target: "perché", kind: "causal", note: "çünkü → perché." },
  },
  reorder: "free",
  autoReorder: true,
  clauseJoin: " ",
  articles: ["il", "lo", "la", "i", "gli", "le", "l", "un", "uno", "una"],
  markers: ["a", "al", "in", "di", "da", "con", "per", "non"],
  markerNotes: { in: "-la vasıta → in (in metro).", a: "-e yön → a (vado a casa)." },
  freqAdverbs: ["sempre", "spesso", "volte", "mai", "raramente", "solito"],
  chunks: ["la mattina", "a casa", "a letto", "al lavoro", "faccio colazione", "faccio la doccia"],
  homophones: [
    ["a", "ha"],
    ["o", "ho"],
    ["anno", "hanno"],
    ["e", "he"],
  ],
  progressive: /(^| )(sto|stai|sta|stiamo|state|stanno) \S+(ando|endo)( |$)/,
  numberWords: {
    zero: "0", due: "2", tre: "3", quattro: "4", cinque: "5", sei: "6",
    sette: "7", otto: "8", nove: "9", dieci: "10", undici: "11", dodici: "12",
  },
  traps: [
    {
      id: "it-fa-prima",
      tr: "-madan önce",
      wrong: ["fa"],
      right: ["prima"],
      text: "fa = 'X zaman önce' (cinque minuti fa). -madan önce → prima di + mastar.",
      mini: ["cinque minuti fa", "prima di fare colazione"],
      pair: ["prima di", "fa"],
    },
    {
      id: "it-con-in",
      tr: "-la (vasıta)",
      wrong: ["con"],
      right: ["in"],
      text: "-la vasıta → in (in metro); con = birlikte (con un amico).",
      mini: ["in autobus", "con un amico"],
      pair: ["in", "con"],
    },
    {
      id: "it-aprire-accendere",
      tr: "açmak (TV)",
      wrong: ["apro"],
      right: ["accendo"],
      detect: (g, e) => g.some((t) => /^apr/.test(t)) && e.some((t) => /^accend/.test(t)) && !e.some((t) => /^apr/.test(t)),
      text: "TV açmak → accendere (accendo la TV); aprire kapı, pencere için.",
      mini: ["accendo la TV", "apro la porta"],
      pair: ["accendo", "apro"],
    },
  ],
  systems: [
    {
      id: "artikel-birlesme",
      title: "Edat + artikel birleşmesi",
      a: "Türkçede edat kelimeye ek olur (işe); İtalyancada edat artikelle birleşir.",
      b: "a + il → al · in + il → nel · di + il → del · da + il → dal · su + il → sul (la → alla, nella …).",
      c: "işe giderim → vado al lavoro (a + il).",
      d: (t) => {
        const m = firstMatch(la(t), /(^| )(al|allo|alla|ai|agli|alle|nel|nella|nei|del|della|dei|dal|dalla|sul|sulla) \S+/);
        return m ? `Bu cümlede: ${m.trim()}` : "Bu cümlede: edat + artikel birleşiyor mu bak.";
      },
      trigger: /(^| )(al|allo|alla|ai|agli|alle|nel|nella|nei|del|della|dei|dal|dalla|sul|sulla)( |$)/,
    },
  ],
  promptBlock: () =>
    [
      "DİL: İtalyanca.",
      "YUVA SIRASI: [bağlaç] + [özne] + fiil + [sıklık zarfı] + [nesne / mastar] + [a/in + yer] + [in + araç] + [zaman]. Soru sırası: Kim? (fiil eki) → Neyi? → Nereye? → Nasıl?/Neyle? → Ne zaman?",
      "KİM?: özne fiilin ekinde (vado); io yazma, sw'de ver.",
      "SIKLIK ZARFI: genelde fiilden sonra (vado spesso); başta da olur (sw).",
      "EKLER: -madan önce → prima di + mastar · -dıktan sonra → dopo aver + ortaç · -dığımda → quando · -mayı sevmek → mi piace + mastar · -la araç → in · alışkanlık -iyor → presente.",
      "SAAT: alle + saat (alle sette di sera); gibi → verso.",
      "BAĞLAÇ YERİ: prima di / dopo / quando kısmı ortaya alınabilir. ma / perché yer değiştirmez.",
      "KAYITLI TUZAKLAR (c yazma): fa/prima · con/in · aprire/accendere.",
      "SİSTEM DERSLERİ: artikel-birlesme.",
    ].join("\n"),
};

const FR: LangMethod = {
  id: "fr",
  slotOrder: "[bağlaç] + özne + fiil + [sıklık zarfı] + [nesne / mastar] + [à + yer] + [en + araç] + [zaman]",
  questionOrder: ["Kim?", "Neyi?", "Nereye?", "Nasıl?/Neyle?", "Ne zaman?"],
  subjectRule: "Kim? Ben → je: özne zamiri hep söylenir.",
  adverbRule: "Sıklık zarfı fiilden SONRA gelir: je vais souvent …",
  connectors: {
    "-madan önce": { target: "avant de", kind: "sub", trapId: "fr-ilya-avant", note: "-madan önce → avant de + mastar." },
    "-dıktan sonra": { target: "après", kind: "sub", note: "-dıktan sonra → après avoir + ortaç." },
    "-dığımda": { target: "quand", kind: "sub", note: "-dığımda → quand." },
    "-sa": { target: "si", kind: "sub", note: "-sa → si." },
    ama: { target: "mais", kind: "coord", note: "ama → mais." },
    çünkü: { target: "parce que", kind: "causal", note: "çünkü → parce que." },
  },
  reorder: "free",
  autoReorder: true,
  clauseJoin: " ",
  articles: ["le", "la", "les", "l", "un", "une", "des"],
  markers: ["a", "au", "aux", "de", "du", "en", "avec", "pour", "ne", "pas"],
  markerNotes: { en: "-la vasıta → en (en métro); yaya → à pied.", a: "-e yön → à (je vais au travail)." },
  freqAdverbs: ["toujours", "souvent", "parfois", "jamais", "rarement", "generalement"],
  chunks: ["le matin", "le soir", "au travail", "a la maison", "je me douche", "je me couche"],
  homophones: [
    ["et", "est"],
    ["ces", "ses"],
    ["sont", "son"],
    ["vers", "verre"],
    ["vers", "vert"],
    ["cent", "sans"],
    ["mais", "mes"],
  ],
  progressive: /(^| )en train de( |$)/,
  numberWords: {
    zero: "0", deux: "2", trois: "3", quatre: "4", cinq: "5", six: "6",
    sept: "7", huit: "8", neuf: "9", dix: "10", onze: "11", douze: "12",
  },
  traps: [
    {
      id: "fr-ilya-avant",
      tr: "-madan önce",
      wrong: ["il", "y", "a"],
      right: ["avant"],
      text: "il y a = 'X zaman önce' (il y a cinq minutes). -madan önce → avant de + mastar.",
      mini: ["il y a cinq minutes", "avant de prendre le petit-déjeuner"],
      pair: ["avant de", "il y a"],
    },
    {
      id: "fr-avec-en",
      tr: "-la (vasıta)",
      wrong: ["avec"],
      right: ["en"],
      text: "-la vasıta → en (en métro), yaya → à pied; avec = birlikte (avec un ami).",
      mini: ["en bus", "avec un ami"],
      pair: ["en", "avec"],
    },
    {
      id: "fr-ouvrir-allumer",
      tr: "açmak (TV)",
      wrong: ["ouvre"],
      right: ["allume"],
      detect: (g, e) => g.some((t) => /^ouvr/.test(t)) && e.some((t) => /^allum/.test(t)) && !e.some((t) => /^ouvr/.test(t)),
      text: "TV açmak → allumer (j'allume la télé); ouvrir kapı, pencere için.",
      mini: ["j'allume la télé", "j'ouvre la porte"],
      pair: ["allume", "ouvre"],
    },
  ],
  systems: [
    {
      id: "artikel-birlesme",
      title: "Edat + artikel birleşmesi",
      a: "Türkçede edat kelimeye ek olur (işe); Fransızcada à / de edatı le / les ile birleşir.",
      b: "à + le → au · à + les → aux · de + le → du · de + les → des (la ve l' birleşmez: à la maison).",
      c: "işe giderim → je vais au travail (à + le).",
      d: (t) => {
        const m = firstMatch(la(t), /(^| )(au|aux|du|des) \S+/);
        return m ? `Bu cümlede: ${m.trim()}` : "Bu cümlede: à/de + le birleşiyor mu bak.";
      },
      trigger: /(^| )(au|aux|du|des)( |$)/,
    },
  ],
  promptBlock: () =>
    [
      "DİL: Fransızca.",
      "YUVA SIRASI: [bağlaç] + özne + fiil + [sıklık zarfı] + [nesne / mastar] + [à + yer] + [en + araç] + [zaman]. Soru sırası: Kim? → Neyi? → Nereye? → Nasıl?/Neyle? → Ne zaman?",
      "KİM?: özne zamiri hep yazılır (je).",
      "SIKLIK ZARFI: fiilden SONRA (je vais souvent).",
      "EKLER: -madan önce → avant de + mastar · -dıktan sonra → après avoir + ortaç · -dığımda → quand · -la araç → en (yaya: à pied) · sabahları → le matin (edatsız; İngilizceden farklı) · alışkanlık -iyor → présent.",
      "SAAT: à + saat (à sept heures du soir); gibi → vers.",
      "BAĞLAÇ YERİ: avant de / après / quand kısmı ortaya alınabilir. mais / parce que yer değiştirmez.",
      "KAYITLI TUZAKLAR (c yazma): il y a/avant · avec/en · ouvrir/allumer.",
      "SİSTEM DERSLERİ: artikel-birlesme.",
    ].join("\n"),
};

// ---------------------------------------------------------------------------

export const METHOD: Record<LanguageId, LangMethod> = {
  en: EN,
  ar: AR,
  de: DE,
  fa: FA,
  ru: RU,
  es: ES,
  fr: FR,
  it: IT,
};

/** Dilin yöntem tablosu; bilinmeyen kimlikte İngilizceye düşer. */
export function methodFor(id: LanguageId | string | undefined): LangMethod {
  return (id && (METHOD as Record<string, LangMethod>)[id]) || METHOD.en;
}

/** Kimliğiyle sistem dersi (4 parçalı); yoksa undefined. */
export function systemById(lang: LanguageId, id: string): SystemLesson | undefined {
  return methodFor(lang).systems.find((s) => s.id === id);
}

/** Kimliğiyle tuzak. */
export function trapById(lang: LanguageId, id: string): Trap | undefined {
  return methodFor(lang).traps.find((t) => t.id === id);
}

/**
 * Bağlacın ortaya alınma biçimi: YALNIZ yan cümle bağlacı (before/after/when)
 * yer değiştirir. "ama" ve "çünkü" hiçbir dilde yer değiştirmez — hoca
 * yalnız before/after/when için "cümle ortasında da" dedi.
 */
export function connectorReorder(m: LangMethod, trKey: string): "none" | LangMethod["reorder"] {
  const c = m.connectors[trKey];
  if (!c || c.kind !== "sub") return "none";
  return m.reorder;
}

/**
 * Promptta "SİSTEM DERSLERİ:" satırında listelenen kimlikler — testin her
 * kimliğin koddaki bir derse çözüldüğünü doğrulaması için.
 */
export function promptSystemIds(m: LangMethod, band: Band = "A2"): string[] {
  const line = m.promptBlock(band).split("\n").find((l) => l.startsWith("SİSTEM DERSLERİ:"));
  if (!line) return [];
  return line
    .replace("SİSTEM DERSLERİ:", "")
    .replace(/\.$/, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
