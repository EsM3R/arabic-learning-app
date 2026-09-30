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
 *
 * v2 (bu dosyanın ikinci yarısı): set artık önce PLANLANIR (roller: açılış,
 * kurma, zirve, çukur, uzatma, sentez), sonra cümleler tek tek üretilip
 * cihazda toparlanır (normalizeSentence) ve ekranda bir KART SIRASINA
 * çevrilir (compileSentence). Modelin yazmadığı her şey — Türkçe "şu ana
 * kadar", tuzak metni, geri çağırma soruları, okunuş hizası — burada türetilir.
 */
import {
  addedTokens,
  canonicalTokens,
  checkAnswer,
  deriveSwaps,
  diffAdded,
  findConnector,
  langForScript,
  locateTrPiece,
  scriptOf,
} from "./buildcheck.ts";
import { methodFor, systemById, trapById } from "./buildmethod.ts";
import type { LanguageId } from "./languages.ts";
import type { ScriptId } from "./scripts.ts";

export type Band = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/**
 * Bağlaç türü — hocanın üç ayrı davranışı: "-madan önce" gibi YAN cümle
 * bağlacı (bağlaçla başlanır, sonra ortaya alınabilir), "ama" gibi SIRALI
 * bağlaç (önce birinci kısım, yer değiştirmez), "çünkü" gibi önceki cümleye
 * BAĞLANAN bağlaç (önceki cümle söylenip devam edilir).
 */
export type ConnKind = "sub" | "coord" | "causal" | "none";

/** Setin tek zaman çerçevesi; "habit" iken -iyor'lu cevap geniş zamana çevrilir. */
export type TenseFrame = "habit" | "now" | "past" | "future" | "mixed";

/** Hikâyedeki yer: hocanın yük eğrisi (kolay açılış → zirve → çukur → uzatma → sentez). */
export type Role = "open" | "build" | "peak" | "dip" | "extension" | "synthesis";

/** Yapı taşı türü — notun nasıl verileceğini belirler (bkz. yöntem §3.2). */
export type BlockKind =
  | "connector"
  | "suffix"
  | "caseSplit"
  | "chunk"
  | "rule"
  | "complement"
  | "adverb"
  | "lexical"
  | "paraphrase";

export const BLOCK_KINDS: BlockKind[] = [
  "connector",
  "suffix",
  "caseSplit",
  "chunk",
  "rule",
  "complement",
  "adverb",
  "lexical",
  "paraphrase",
];

/**
 * Eşdeğer söyleyiş: kalıptaki parça (from) yerine öğrencinin söyleyebileceği
 * alternatif (to). Bir adımda seçilen alternatif sonraki bütün adımlarda da
 * geçerli kalsın diye cümle düzeyinde tutulur ("have a shower").
 */
export interface Swap {
  from: string[];
  to: string[];
  label?: "resmî" | "günlük" | "edebî" | "dişil";
}

export interface Pattern {
  id: string;
  band: Band;
  /** Türkçe başlık — kalıbın ne işe yaradığı. */
  title: string;
  /** Türkçe dilbilgisi ipucu; model hedef dildeki formülü buna göre kurar. */
  concept: string;
  /** Türkçe tetik: "-madan önce", "-mayı (sevmek)". */
  trigger: string;
  /** Hocanın fiile sorduğu soru: "Neyi?", "Neye rağmen?". Özel soru yoksa "". */
  question: string;
  /** Kalıbın KENDİSİ bir bağlaçsa türü; değilse "none". */
  conn: ConnKind;
  /** Kalıp bir zamanı zorluyorsa (geçmiş, gelecek…). */
  tense?: TenseFrame;
  /** "dialogue": kalıp hikâyede birine DOĞRUDAN söylenen replik olur (soru, rica, emir). */
  placement: "narrative" | "dialogue";
  /** Hedef dildeki kısa formül (≤60 karakter), promptta ipucu olur. */
  map?: Partial<Record<LanguageId, string>>;
  /** Yerleştirme yoklamasında sorulan temel kalıplardan mı. */
  probe?: boolean;
}

type P = Pattern;
const nar = "narrative" as const;
const dia = "dialogue" as const;

/**
 * KALIP MERDİVENİ — sıfırdan ileri düzeye (A1 → C2).
 *
 * Sıra önemli: her basamak öncekinin üstüne kurulur. "istek" (I want to)
 * geçmiş zamandan önce gelir, çünkü tek başına bile konuşturur; "-ebilmek"
 * olumsuzdan sonra, çünkü "yapamam" onu gerektirir. İlk 48 kimlik v1'den
 * aynen kalır (ilerleme anahtarları bozulmasın); yeni basamaklar, hocanın
 * videoda sorduğu hâl sorularını (Neyi? Nereye? Nasıl?) ve üst seviyelerin
 * bağlaçlarını ekler.
 */
export const PATTERN_LADDER: Pattern[] = [
  // A1 — Kim? + yüklem, hâl soruları
  { id: "olmak", band: "A1", title: "Ben …-im (olmak)", concept: "olmak fiili, şimdiki durum: 'Ben öğrenciyim', 'O yorgun'", trigger: "-(y)ım / -dır", question: "Kim? Ne?", conn: "none", placement: nar, map: { en: "be: I am a student", ar: "isim cümlesi: أَنَا طَالِبٌ" } },
  { id: "var-yok", band: "A1", title: "… var / … yok", concept: "varlık-yokluk: 'Masada bir kitap var', 'Evde süt yok'", trigger: "var / yok", question: "Nerede ne var?", conn: "none", placement: nar, map: { en: "there is / there are", ar: "يُوجَدُ، هُنَاكَ" } },
  { id: "sahip", band: "A1", title: "Benim … var (sahiplik)", concept: "sahiplik: 'Bir arabam var', 'Kardeşim yok'", trigger: "-ım var", question: "Kimin var?", conn: "none", placement: nar, map: { en: "I have", ar: "عِنْدِي" } },
  { id: "genis-zaman", band: "A1", title: "Her gün …-rım (geniş zaman)", concept: "alışkanlık, geniş zaman: 'Her sabah kahve içerim'", trigger: "-ır (alışkanlık bildiren -iyor)", question: "Ne yaparım?", conn: "none", tense: "habit", placement: nar, map: { en: "simple present", ar: "muzari: أَشْرَبُ" }, probe: true },
  { id: "belirtme", band: "A1", title: "…-ı (belirtme: Neyi?)", concept: "belirtme hâli, nesne: 'Kitabı okurum', 'Kahveyi severim'", trigger: "-ı / -i", question: "Neyi?", conn: "none", placement: nar, map: { en: "fiil + nesne: I read the book", ar: "mansub nesne: أَقْرَأُ الكِتَابَ" }, probe: true },
  { id: "yon-yer", band: "A1", title: "…-e / -de / -den (yön ve yer)", concept: "yönelme, bulunma, ayrılma: 'İşe giderim', 'Evdeyim', 'Okuldan çıktım'", trigger: "-e / -de / -den", question: "Nereye? Nerede? Nereden?", conn: "none", placement: nar, map: { en: "to / in, at / from", ar: "إِلَى، فِي، مِنْ + kesra" }, probe: true },
  { id: "vasita", band: "A1", title: "…-la (araçla / biriyle)", concept: "vasıta ve birliktelik: 'Otobüsle giderim' (by), 'Arkadaşımla gittim' (with)", trigger: "-la / -le", question: "Nasıl? Kiminle?", conn: "none", placement: nar, map: { en: "by bus / with my friend", ar: "بِـ (araç) / مَعَ (birlikte)" }, probe: true },
  { id: "iyelik", band: "A1", title: "Benim …-ım / evin kapısı (iyelik)", concept: "iyelik ve tamlama: 'Kardeşim', 'Evin kapısı'", trigger: "-ım, -ın … -ı", question: "Kimin?", conn: "none", placement: nar, map: { en: "my / of", ar: "ـِي، izafet: بَابُ البَيْتِ" } },
  { id: "siklik", band: "A1", title: "Bazen / sık sık / her zaman (sıklık)", concept: "sıklık zarfları ve yerleri: 'Bazen işe yürürüm', 'Her zaman kahve içerim'", trigger: "bazen / sık sık / her zaman", question: "Ne sıklıkla?", conn: "none", placement: nar, map: { en: "özneden sonra: I sometimes go", ar: "fiilden önce: أَحْيَانًا، دَائِمًا" } },
  { id: "saat", band: "A1", title: "Saat … gibi (saat söyleme)", concept: "saat ve yaklaşık zaman: 'Saat 7 gibi çıkarım', 'Saat 10'da yatarım'", trigger: "saat X (gibi)", question: "Ne zaman?", conn: "none", placement: nar, map: { en: "at (around) 7 PM", ar: "فِي السَّاعَةِ السَّابِعَةِ مَسَاءً" } },
  { id: "istek", band: "A1", title: "…-mek istiyorum", concept: "istek: '-mek istemek' — 'Eve gitmek istiyorum'", trigger: "-mek istiyorum", question: "Neyi istiyorum?", conn: "none", placement: nar, map: { en: "want to + fiil", ar: "أُرِيدُ أَنْ + mansub" }, probe: true },
  { id: "olumsuz", band: "A1", title: "…-mem / değilim (olumsuz)", concept: "olumsuz cümle: 'Et yemem', 'Yorgun değilim'", trigger: "-me / değil", question: "", conn: "none", placement: nar, map: { en: "don't / not", ar: "لَا، لَيْسَ" }, probe: true },
  { id: "evet-hayir-soru", band: "A1", title: "…-mı? (evet/hayır sorusu)", concept: "evet-hayır sorusu: 'Kahve ister misin?', 'Yorgun musun?'", trigger: "-mı?", question: "", conn: "none", placement: dia, map: { en: "Do …? / Are …?", ar: "هَلْ" } },
  { id: "soru-kelimesi", band: "A1", title: "Ne / nerede / ne zaman …?", concept: "soru kelimeli sorular: ne, nerede, ne zaman, neden, nasıl, kim", trigger: "ne / nerede / ne zaman", question: "", conn: "none", placement: dia, map: { en: "what / where / when", ar: "مَاذَا، أَيْنَ، مَتَى" } },
  { id: "simdiki", band: "A1", title: "Şu an …-yorum (şimdiki zaman)", concept: "şu anda süren eylem: 'Şu an yemek yiyorum'", trigger: "şu an -iyor", question: "Şu an ne yapıyorum?", conn: "none", tense: "now", placement: nar, map: { en: "am / is / are + -ing", ar: "muzari + الآنَ" } },
  { id: "ebilmek", band: "A1", title: "…-ebilirim / …-emem (yetenek)", concept: "yetenek ve olasılık: 'Yüzebilirim', 'Gelemem'", trigger: "-ebil", question: "Neyi yapabilirim?", conn: "none", placement: nar, map: { en: "can + fiil", ar: "أَسْتَطِيعُ أَنْ + mansub" } },
  { id: "rica", band: "A1", title: "… alabilir miyim? (kibar rica)", concept: "kibar istek: 'Bir su alabilir miyim?', 'Yardım eder misiniz?'", trigger: "-abilir miyim?", question: "", conn: "none", placement: dia, map: { en: "Can I …? / Could you …?", ar: "هَلْ يُمْكِنُنِي أَنْ" } },
  { id: "emir", band: "A1", title: "Gel / Gelme (emir)", concept: "emir ve olumsuz emir: 'Otur', 'Endişelenme', 'Hadi gidelim'", trigger: "emir kipi", question: "", conn: "none", placement: dia, map: { en: "imperative: Sit! / Don't worry", ar: "emir: اِجْلِسْ / لَا تَقْلَقْ" } },
  // A2 — videonun seviyesi: günlük rutin, bağlaçlar
  { id: "gecmis", band: "A2", title: "Dün …-dım (geçmiş zaman)", concept: "görülen geçmiş: 'Dün sinemaya gittim'", trigger: "-dı", question: "Ne zaman?", conn: "none", tense: "past", placement: nar, map: { en: "simple past", ar: "mazi: ذَهَبْتُ" }, probe: true },
  { id: "gecmis-olumsuz-soru", band: "A2", title: "…-madım / …-dın mı?", concept: "geçmişin olumsuzu ve sorusu: 'Gitmedim', 'Gördün mü?'", trigger: "-madı / -dı mı", question: "", conn: "none", tense: "past", placement: nar, map: { en: "didn't / Did …?", ar: "لَمْ + meczum" } },
  { id: "gelecek-plan", band: "A2", title: "Yarın …-eceğim (plan)", concept: "önceden kararlaştırılmış gelecek plan: 'Yarın annemi ziyaret edeceğim'", trigger: "-ecek (plan)", question: "", conn: "none", tense: "future", placement: nar, map: { en: "be going to", ar: "سَـ / سَوْفَ" }, probe: true },
  { id: "gelecek-karar", band: "A2", title: "…-erim o zaman (anlık karar/tahmin)", concept: "anlık karar ve tahmin: 'Ben açarım', 'Bence yağmur yağacak'", trigger: "-ırım o zaman", question: "", conn: "none", tense: "future", placement: nar, map: { en: "will", ar: "سَـ" } },
  { id: "zorunluluk", band: "A2", title: "…-mem lazım / zorundayım", concept: "zorunluluk: 'Erken kalkmam lazım', 'Çalışmak zorundayım'", trigger: "-mem lazım", question: "", conn: "none", placement: nar, map: { en: "have to", ar: "يَجِبُ أَنْ" } },
  { id: "tavsiye", band: "A2", title: "…-malısın (tavsiye)", concept: "tavsiye: 'Doktora gitmelisin', 'Bunu denemelisin'", trigger: "-malısın", question: "", conn: "none", placement: nar, map: { en: "should", ar: "عَلَيْكَ أَنْ" } },
  { id: "sevmek", band: "A2", title: "…-meyi seviyorum", concept: "sevmek/nefret etmek + eylem: 'Kitap okumayı severim'", trigger: "-mayı (sevmek)", question: "Neyi seviyorum?", conn: "none", placement: nar, map: { en: "like to V (a: V-ing)", ar: "أُحِبُّ أَنْ + mansub (a: masdar)" }, probe: true },
  { id: "tercih", band: "A2", title: "…-meyi tercih ederim", concept: "tercih: 'Otobüsle gitmeyi tercih ederim', 'Çay içmeyi tercih ederim'", trigger: "-meyi tercih etmek", question: "Neyi tercih ederim?", conn: "none", placement: nar, map: { en: "prefer + V-ing", ar: "أُفَضِّلُ + masdar (a: أَنْ)" } },
  { id: "karsilastirma", band: "A2", title: "…-den daha … / en …", concept: "karşılaştırma ve en üstünlük: 'Ondan daha uzun', 'En iyi arkadaşım'", trigger: "-den daha / en", question: "", conn: "none", placement: nar, map: { en: "-er than / the most", ar: "أَفْعَلُ مِنْ" } },
  { id: "ama-cunku", band: "A2", title: "… ama / çünkü / bu yüzden …", concept: "bağlaçlar: ama, çünkü, bu yüzden, ve, veya", trigger: "ama / çünkü", question: "", conn: "coord", placement: nar, map: { en: "but (a: However,) / because", ar: "لَكِنْ، لَكِنَّ / لِأَنَّ" }, probe: true },
  { id: "zaman-baglac", band: "A2", title: "…-ince / …-ken / …-den önce", concept: "zaman bağlaçları: 'Eve gelince', 'Yemekten önce', 'Ben uyurken'", trigger: "-madan önce / -dıktan sonra", question: "Neyden önce? Neyden sonra?", conn: "sub", placement: nar, map: { en: "before / after + tam cümle", ar: "قَبْلَ أَنْ / بَعْدَ أَنْ" }, probe: true },
  { id: "diginda", band: "A2", title: "…-dığımda / …-ince", concept: "zaman bağlacı: 'Eve vardığımda televizyonu açarım', 'Gelince ararım'", trigger: "-dığımda / -ince", question: "Ne zaman?", conn: "sub", placement: nar, map: { en: "when + tam cümle", ar: "عِنْدَمَا" } },
  { id: "gecmis-surekli", band: "A2", title: "…-yordum (geçmişte süren)", concept: "geçmişte süren eylem: 'Sen aradığında yemek yiyordum'", trigger: "-iyordu", question: "", conn: "none", tense: "past", placement: nar, map: { en: "was / were + -ing", ar: "كَانَ + muzari" } },
  { id: "nesne-zamir", band: "A2", title: "Onu / ona / bana … (nesne)", concept: "nesne zamirleri: 'Onu gördüm', 'Bana söyledi'", trigger: "onu / ona", question: "", conn: "none", placement: nar, map: { en: "him / her / it", ar: "ـهُ، ـهَا" } },
  // B1 — zenginleştirme
  { id: "yakin-gecmis", band: "B1", title: "Hiç …-dın mı? / Az önce …", concept: "deneyim ve yakın geçmiş: 'Hiç Paris'e gittin mi?', 'Az önce bitirdim'", trigger: "hiç -dın mı / az önce", question: "", conn: "none", placement: nar, map: { en: "have ever / just", ar: "هَلْ سَبَقَ أَنْ / لِلتَّوِّ" } },
  { id: "sure", band: "B1", title: "… -dır …-yorum (süreden beri)", concept: "süregelen durum: 'İki yıldır İngilizce öğreniyorum'", trigger: "-dır -iyorum", question: "Ne zamandan beri?", conn: "none", placement: nar, map: { en: "for / since + present perfect", ar: "مُنْذُ" }, probe: true },
  { id: "digindan-beri", band: "B1", title: "…-dığından beri", concept: "başlangıç noktası: 'Buraya taşındığımdan beri yürüyorum'", trigger: "-dığından beri", question: "Ne zamandan beri?", conn: "sub", placement: nar, map: { en: "since + tam cümle", ar: "مُنْذُ أَنْ" } },
  { id: "kosul-1", band: "B1", title: "Eğer …-rsa, …-ır (gerçek koşul)", concept: "gerçek koşul: 'Yağmur yağarsa evde kalırım'", trigger: "-sa", question: "Hangi şartla?", conn: "sub", placement: nar, map: { en: "if + present", ar: "إِذَا + mazi" }, probe: true },
  { id: "kosul-2", band: "B1", title: "…-sa …-rdım (hayali koşul)", concept: "hayali koşul: 'Zengin olsam bir ev alırdım'", trigger: "-sa … -rdı", question: "", conn: "sub", placement: nar, map: { en: "if + past, would", ar: "لَوْ … لَـ" } },
  { id: "edilgen", band: "B1", title: "…-ıldı / …-ılır (edilgen)", concept: "edilgen yapı: 'Bu ev 1990'da yapıldı', 'İngilizce her yerde konuşulur'", trigger: "-ıl", question: "Kim tarafından?", conn: "none", placement: nar, map: { en: "passive: is made / was built", ar: "meçhul (a: تَمَّ + masdar)" } },
  { id: "sifat-cumlesi", band: "B1", title: "…-an / …-diğim … (ilgi cümlesi)", concept: "sıfat-fiil / ilgi cümlesi: 'Dün tanıştığım adam', 'Burada çalışan kadın'", trigger: "-an / -dığı", question: "Hangi?", conn: "none", placement: nar, map: { en: "who / which / that", ar: "الَّذِي + dönen zamir" }, probe: true },
  { id: "dolayli-soru", band: "B1", title: "… nerede olduğunu biliyor musun?", concept: "dolaylı soru: 'Saatin kaç olduğunu biliyor musun?'", trigger: "… olduğunu biliyor musun", question: "", conn: "none", placement: dia, map: { en: "Do you know where …?", ar: "هَلْ تَعْرِفُ أَيْنَ" } },
  { id: "aktarim", band: "B1", title: "… dedi ki …", concept: "aktarma: 'Yorgun olduğunu söyledi', 'Gelip gelmeyeceğimi sordu'", trigger: "-dığını söyledi", question: "Ne dedi?", conn: "none", placement: nar, map: { en: "said that", ar: "قَالَ إِنَّ" } },
  { id: "amac", band: "B1", title: "…-mek için", concept: "amaç: 'Para biriktirmek için çalışıyorum'", trigger: "-mak için", question: "Ne için?", conn: "none", placement: nar, map: { en: "to / so that", ar: "لِـ، لِكَيْ + mansub" }, probe: true },
  { id: "ken", band: "B1", title: "…-ken", concept: "eş zamanlı eylem: 'Kahvaltı yaparken haberleri dinlerim'", trigger: "-ken", question: "Ne yaparken?", conn: "sub", placement: nar, map: { en: "while + tam cümle", ar: "بَيْنَمَا" } },
  { id: "ana-kadar", band: "B1", title: "…-ana kadar", concept: "bitiş noktası: 'Otobüs gelene kadar beklerim'", trigger: "-ana kadar", question: "Ne zamana kadar?", conn: "sub", placement: nar, map: { en: "until + tam cümle", ar: "حَتَّى" } },
  { id: "digi-icin", band: "B1", title: "…-dığı için", concept: "sebep: 'Yorgun olduğum için erken yattım'", trigger: "-dığı için", question: "Neden?", conn: "causal", placement: nar, map: { en: "since / because", ar: "بِمَا أَنَّ" } },
  { id: "alisik", band: "B1", title: "Eskiden …-rdım", concept: "geçmiş alışkanlık: 'Eskiden sigara içerdim'", trigger: "eskiden -ırdım", question: "", conn: "none", tense: "past", placement: nar, map: { en: "used to", ar: "كُنْتُ + muzari" } },
  { id: "ettirgen", band: "B1", title: "…-tırmak (yaptırmak)", concept: "ettirgen: 'Saçımı kestirdim', 'Bana bunu yaptırdı'", trigger: "-tır", question: "", conn: "none", placement: nar, map: { en: "get / have sth done", ar: "جَعَلَ، II/IV. kalıp" } },
  { id: "tahmin", band: "B1", title: "…-meli / …-miş olmalı (tahmin)", concept: "çıkarım: 'Evde olmalı', 'Unutmuş olmalı'", trigger: "-meli / -miş olmalı", question: "", conn: "none", placement: nar, map: { en: "must be / must have", ar: "لَا بُدَّ أَنَّ" } },
  // B2 — incelik, önce tek seferde
  { id: "kosul-3", band: "B2", title: "…-saydı …-rdı (geçmiş koşul)", concept: "geçmişe dönük hayali koşul: 'Bilseydim gelirdim'", trigger: "-saydı -rdı", question: "", conn: "sub", placement: nar, map: { en: "if + had done, would have", ar: "لَوْ … لَـ + mazi" }, probe: true },
  { id: "keske", band: "B2", title: "Keşke …", concept: "keşke: 'Keşke daha çok zamanım olsa', 'Keşke gitmeseydim'", trigger: "keşke", question: "", conn: "none", placement: nar, map: { en: "I wish", ar: "لَيْتَ" } },
  { id: "mis-gecmis", band: "B2", title: "…-mıştım (geçmişin geçmişi)", concept: "öncesindeki geçmiş: 'Vardığımda film başlamıştı'", trigger: "-mıştı", question: "", conn: "none", tense: "past", placement: nar, map: { en: "had done", ar: "كَانَ قَدْ" }, probe: true },
  { id: "ragmen", band: "B2", title: "…-mesine rağmen / halbuki", concept: "karşıtlık: 'Yorgun olmasına rağmen çalıştı'", trigger: "-masına rağmen", question: "Neye rağmen?", conn: "sub", placement: nar, map: { en: "although + tam cümle", ar: "رَغْمَ أَنَّ" }, probe: true },
  { id: "gerekirdi", band: "B2", title: "…-meliydim / …-ebilirdim", concept: "geçmişe dönük modallar: 'Daha erken gelmeliydim', 'Kazanabilirdin'", trigger: "-meliydim / -ebilirdim", question: "", conn: "none", placement: nar, map: { en: "should have / could have", ar: "كَانَ عَلَيَّ أَنْ" } },
  { id: "vurgu", band: "B2", title: "Asıl … olan …", concept: "vurgulu yapı: 'Beni asıl şaşırtan onun sesiydi'", trigger: "asıl … olan", question: "", conn: "none", placement: nar, map: { en: "cleft: It was … that", ar: "إِنَّمَا" } },
  { id: "isim-fiil", band: "B2", title: "…-mek / …-me (isim-fiil özne)", concept: "eylem özne olarak: 'Erken kalkmak zor', 'Onun gelmesi iyi oldu'", trigger: "-mek (özne)", question: "", conn: "none", placement: nar, map: { en: "gerund özne: Waking up is hard", ar: "masdar mübteda" } },
  { id: "bagli-kosul", band: "B2", title: "…-mediği sürece / …-mek şartıyla", concept: "şartlı bağlaçlar: 'Yağmur yağmadığı sürece', 'Erken dönmen şartıyla'", trigger: "-madıkça / -mek şartıyla", question: "", conn: "sub", placement: nar, map: { en: "unless / provided that", ar: "إِلَّا إِذَا / شَرِيطَةَ أَنْ" } },
  { id: "arak", band: "B2", title: "…-arak", concept: "tarz: 'Gülümseyerek içeri girdi', 'Koşarak geldim'", trigger: "-arak", question: "Nasıl?", conn: "none", placement: nar, map: { en: "V-ing / by V-ing", ar: "hâl: مُبْتَسِمًا (a: وَهُوَ يَبْتَسِمُ)" } },
  { id: "ir-maz", band: "B2", title: "…-ır …-maz", concept: "hemen ardından: 'Eve varır varmaz duş alırım'", trigger: "-ır -maz", question: "Ne zaman?", conn: "sub", placement: nar, map: { en: "as soon as + tam cümle", ar: "بِمُجَرَّدِ أَنْ" } },
  // C1 — üslup ve tartışma
  { id: "devrik", band: "C1", title: "Asla … (vurgulu devrik)", concept: "vurgulu devrik yapı: 'Asla böyle bir şey görmedim', 'Ancak o zaman anladım'", trigger: "asla …, ancak o zaman", question: "", conn: "none", placement: nar, map: { en: "inversion: Never have I …", ar: "öne alma: الشَّايَ أُحِبُّ، مَا … إِلَّا" }, probe: true },
  { id: "karma-kosul", band: "C1", title: "…-saydım şimdi …-rdım (karma)", concept: "karma koşul: 'Dün uyusaydım şimdi yorgun olmazdım'", trigger: "-saydı şimdi -rdı", question: "", conn: "none", placement: nar, map: { en: "mixed conditional", ar: "لَوْ … لَـ + şimdiki" } },
  { id: "resmi-ton", band: "C1", title: "Resmî / kibar üslup", concept: "resmî kayıt: 'Bilgilendirmenizi rica ederim', 'Mümkünse …'", trigger: "resmî kayıt", question: "", conn: "none", placement: nar, map: { en: "resmî üslup (etiketli)", ar: "resmî üslup (etiketli)" } },
  { id: "deyim", band: "C1", title: "Günlük deyimler ve kalıplar", concept: "doğal günlük deyimler ve söz öbekleri (phrasal verb vb.)", trigger: "deyim", question: "", conn: "none", placement: nar, map: { en: "deyimler: kalıp, bölünmez", ar: "deyimler: kalıp, bölünmez" } },
  { id: "sa-bile", band: "C1", title: "…-sa bile", concept: "karşı koşul: 'Yağmur yağsa bile yürürüm'", trigger: "-sa bile", question: "Neye rağmen?", conn: "sub", placement: nar, map: { en: "even if", ar: "حَتَّى لَوْ، وَإِنْ" }, probe: true },
  { id: "digi-halde", band: "C1", title: "…-dığı halde", concept: "karşıtlık: 'Çok çalıştığı halde kazanamadı'", trigger: "-dığı halde", question: "", conn: "sub", placement: nar, map: { en: "whereas / even though", ar: "فِي حِينِ أَنَّ" } },
  { id: "sadece-degil", band: "C1", title: "…-dığı gibi … da", concept: "ekleme: 'İngilizce konuştuğu gibi Arapça da konuşur'", trigger: "-dığı gibi … da", question: "", conn: "coord", placement: nar, map: { en: "not only … but also", ar: "لَا … فَحَسْبُ بَلْ … أَيْضًا" } },
  { id: "sartiyla", band: "C1", title: "…-ması şartıyla", concept: "şart: 'Erken dönmen şartıyla gidebilirsin'", trigger: "-ması şartıyla", question: "", conn: "sub", placement: nar, map: { en: "provided that", ar: "شَرِيطَةَ أَنْ" } },
  // C2 — üslup çiftleri; sistem üslubun kendisi
  { id: "kayit-cifti", band: "C2", title: "Aynı cümle iki üslupta", concept: "nötr ↔ resmî çift: 'Toplantıyı yaptık' ↔ 'Toplantı gerçekleştirildi'", trigger: "nötr ↔ resmî", question: "", conn: "none", placement: nar, map: { en: "neutral ↔ formal (etiketli)", ar: "قَامَ بِـ + masdar; تَمَّ + masdar" } },
  { id: "ihtiyat", band: "C2", title: "Galiba / sanki (ihtiyatlı dil)", concept: "kesinliği yumuşatma: 'Galiba geç kalacak', 'Sanki yağmur yağacak'", trigger: "galiba / sanki", question: "Ne kadar emin?", conn: "none", placement: nar, map: { en: "hedging: It seems / might", ar: "يَبْدُو أَنَّ، لَعَلَّ، رُبَّمَا" }, probe: true },
  { id: "edebi-baglac", band: "C2", title: "…-ır …-maz (edebî)", concept: "edebî söyleyiş: 'Kapıyı açar açmaz telefon çaldı'", trigger: "-ır -maz (edebî)", question: "", conn: "sub", placement: nar, map: { en: "no sooner … than", ar: "مَا إِنْ … حَتَّى" } },
  { id: "deyim-ileri", band: "C2", title: "İleri deyimler ve eşdizimler", concept: "doğal eşdizimler ve deyimler; kalıp olarak bütün öğrenilir", trigger: "deyim ve eşdizim", question: "", conn: "none", placement: nar, map: { en: "idioms / collocations (kalıp)", ar: "deyim ve eşdizim (kalıp)" } },
  { id: "anlati-iki-ton", band: "C2", title: "Bir hikâyeyi iki üslupla anlat", concept: "bitmiş bir seti öteki üslupta yeniden anlatma; bütün merdiveni geri getirir", trigger: "üslup değişimi", question: "", conn: "none", placement: nar, map: { en: "retell: nötr ↔ resmî", ar: "yeniden anlatım: nötr ↔ resmî" } },
];

/**
 * v1'in 48 kimliği. Yeni basamaklar öğrencinin zaten geçtiği bir yerin
 * altına düşüyorsa ona dayatılmaz (bkz. nextPattern): "olmak"ı çoktan
 * oturtmuş birine birden "belirtme" çıkarmak geri adım gibi görünür.
 */
export const LEGACY_PATTERN_IDS: string[] = [
  "olmak", "var-yok", "sahip", "genis-zaman", "istek", "olumsuz", "evet-hayir-soru", "soru-kelimesi",
  "simdiki", "ebilmek", "rica", "emir", "gecmis", "gecmis-olumsuz-soru", "gelecek-plan", "gelecek-karar",
  "zorunluluk", "tavsiye", "sevmek", "karsilastirma", "ama-cunku", "zaman-baglac", "gecmis-surekli",
  "nesne-zamir", "yakin-gecmis", "sure", "kosul-1", "kosul-2", "edilgen", "sifat-cumlesi", "dolayli-soru",
  "aktarim", "amac", "alisik", "ettirgen", "tahmin", "kosul-3", "keske", "mis-gecmis", "ragmen", "gerekirdi",
  "vurgu", "isim-fiil", "bagli-kosul", "devrik", "karma-kosul", "resmi-ton", "deyim",
];
const LEGACY_SET = new Set(LEGACY_PATTERN_IDS);

/** Hikâye temaları — setin cümleleri bu temada birbirine bağlı ilerler. */
export interface Theme {
  id: string;
  title: string;
  emoji: string;
  /** Türkçe: hikâyenin akışı (stages.join) — eski prompt ve ekran bunu okur. */
  arc: string;
  /** Sahneler sırayla; plan cümleleri bu sırayla kurar. */
  stages: string[];
  /** Temanın doğal olduğu seviyeler (sıralama için; hiçbir tema gizlenmez). */
  bands: Band[];
  /** Temanın doğal zaman çerçevesi. */
  tense: TenseFrame;
}

const theme = (id: string, title: string, emoji: string, stages: string[], bands: Band[], tense: TenseFrame): Theme => ({
  id,
  title,
  emoji,
  arc: stages.join(", "),
  stages,
  bands,
  tense,
});

export const THEMES: Theme[] = [
  theme("rutin", "Günlük rutinim", "⏰", ["uyanmak", "duş", "kahvaltı", "evden çıkmak", "işe/okula gitmek", "eve dönmek", "akşam", "yatmak"], ["A1", "A2", "B1"], "habit"),
  theme("haftasonu", "Hafta sonum", "🌤️", ["geç uyanmak", "arkadaşlarla buluşmak", "dışarıda yemek", "alışveriş", "film", "erken yatmamak"], ["A2", "B1"], "habit"),
  theme("is", "İş günüm", "💼", ["işe varmak", "toplantı", "e-postalar", "öğle arası", "bir sorun çıkması", "eve dönüş"], ["A2", "B1", "B2"], "habit"),
  theme("tatil", "Geçen tatilim", "✈️", ["yolculuğa hazırlık", "havaalanı", "otele varmak", "gezmek", "yemek", "bir aksilik", "dönüş"], ["A2", "B1", "B2"], "past"),
  theme("aile", "Ailem", "👨‍👩‍👧", ["aile bireyleri", "nerede yaşadıkları", "ne iş yaptıkları", "birlikte ne yaptığımız", "bir anı"], ["A1", "A2", "B1"], "mixed"),
  theme("yemek", "Yemek ve mutfak", "🍳", ["market alışverişi", "yemek yapmak", "tarif", "sofrayı kurmak", "bulaşık", "sevdiğim yemekler"], ["A1", "A2", "B1"], "habit"),
  theme("saglik", "Sağlık ve spor", "🏃", ["hastalanmak", "doktora gitmek", "ilaç", "iyileşmek", "spora başlamak", "alışkanlıklar"], ["A2", "B1"], "habit"),
  theme("sehir", "Şehirde bir gün", "🏙️", ["toplu taşıma", "yol sormak", "bir yere geç kalmak", "kafe", "müze", "eve dönüş"], ["A1", "A2", "B1"], "habit"),
  theme("gelecek", "Planlarım", "🎯", ["gelecek yıl", "yeni bir dil", "iş değiştirmek", "taşınmak", "hayaller ve koşullar"], ["A2", "B1", "B2"], "future"),
  theme("anilar", "Çocukluğum", "🧸", ["eskiden yaptıklarım", "okul", "arkadaşlar", "bir olay", "şimdi ne değişti"], ["B1", "B2"], "past"),
  theme("is-kriz", "İşte bir kriz", "📉", ["sabah gelen haber", "acil toplantı", "hatanın ortaya çıkması", "tartışma", "çözüm arayışı", "karar", "sonuç"], ["B2"], "past"),
  theme("haber", "Haberlerde", "📰", ["olayın duyurulması", "ne oldu", "kimler etkilendi", "yetkililer ne dedi", "alınan önlemler", "son durum"], ["B2"], "past"),
  theme("tartisma", "Bir tartışma", "💬", ["konu", "benim görüşüm", "karşı görüş", "örnekler", "itiraz", "uzlaşma"], ["C1"], "mixed"),
  theme("iki-uslup", "Aynı olay iki üslupla", "🎭", ["olay", "arkadaşa anlatım", "resmî rapor", "ayrıntılar", "sonuç", "değerlendirme"], ["C2"], "past"),
];

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

/**
 * Temanın kalıba uygunluğu: seviye tutuyorsa +2, zaman çerçevesi çatışmıyorsa
 * +1. Hiçbir tema GİZLENMEZ — çatışan tema sona düşer ama seçilebilir; zaman
 * çatışmasını planın çerçeve satırı çözer ("o tatilde yapmayı planladıklarım").
 */
export function themeFits(pattern: Pattern, t: Theme): number {
  const band = t.bands.includes(pattern.band) ? 2 : 0;
  const tense = !pattern.tense || t.tense === "mixed" || t.tense === pattern.tense ? 1 : 0;
  return band + tense;
}

/** Temalar uygunluğa göre (eşitlikte özgün sırayla). */
export function rankThemes(pattern: Pattern, themes: Theme[] = THEMES): Theme[] {
  return themes
    .map((t, i) => ({ t, i, s: themeFits(pattern, t) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
}

export const BANDS: Band[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function bandIndex(b: Band | string): number {
  const i = BANDS.indexOf(b as Band);
  return i < 0 ? 0 : i;
}

export function toBand(level: string | undefined): Band {
  const l = (level ?? "").toUpperCase().slice(0, 2);
  if (l === "A0" || l === "") return "A1";
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
  /** Kabul edilebilir diğer söyleyişler (v1; v2'de swap'lar kullanılır). */
  alts: string[];
  /** Latin dışı dillerde okunuş; Latin dillerde "". */
  translit: string;
  /** Bu adımda neyin eklendiğine dair tek cümlelik Türkçe not. */
  note: string;
  // --- v2 (çoğu cihazda türetilir) ---
  /** Hocanın hamlesi: bağlaç, bağlantılı tekrar, çekirdek, yuva, araya ekleme, kalıp, toparla. */
  move?: "connector" | "linked" | "anchor" | "slot" | "insert" | "chunk" | "toparla";
  /** Bu adım bir kısmı bitiriyor ("Birinci kısmımız oldu"). */
  clauseEnd?: boolean;
  /** trPiece'in Türkçe cümledeki yeri [başlangıç, bitiş). */
  trSpan?: [number, number] | null;
  /** Hedefte bu adımda EKLENEN kelimelerin sırası (vurgu için). */
  added?: number[];
  /** Eklenen kelime sona değil araya girdi ("araya girdi" etiketi). */
  inserted?: boolean;
  /** Önceki adımla ortaklık düşük (Arapçada ek/hareke değişimi olabilir). */
  reshaped?: boolean;
  /** Bu adımda tam zamanında öğretilen taşların anahtarları. */
  blockIds?: string[];
}

/** Cümlenin öğrettiği yapı taşı (v1 biçimi). */
export interface BuildBlockV1 {
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

export interface BuildSentenceV1 {
  /** Tam Türkçe cümle. */
  tr: string;
  steps: BuildStep[];
  /** Bu cümlenin öğrettiği 1-2 yapı taşı. */
  blocks: BuildBlockV1[];
  /**
   * Bağlaç cümlenin başından ortasına alınabiliyorsa o sıralama (hedef
   * dilde). Son adımdan sonra ayrıca söyletilir. Yoksa "".
   */
  reorder: string;
}

/** Tek çağrıda üretilen eski set; ekran v2'ye geçene kadar bununla çalışır. */
export interface BuildSetV1 {
  patternId: string;
  themeId: string;
  /** Setin kısa Türkçe tanıtımı — hangi hikâye, hangi kalıp. */
  intro: string;
  sentences: BuildSentenceV1[];
  createdAt: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

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
): BuildSetV1 {
  const r = (raw ?? {}) as Record<string, unknown>;
  const sentences: BuildSentenceV1[] = arr(r.sentences)
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
      const blocks: BuildBlockV1[] = arr(o.blocks)
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
export function reorderStep(sentence: BuildSentenceV1 | BuildSentence): BuildStep | null {
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

/**
 * Karşılaştırma için kayıplı biçim: büyük/küçük, noktalama, kısaltma, saat
 * yazımı, hareke farkı yok. Asıl iş src/buildcheck.ts'te (canonicalTokens);
 * burada eski imza korunuyor ki cümle anahtarları aynı kalsın.
 */
export function canonical(s: string, script: ScriptId, lang?: LanguageId): string {
  return canonicalTokens(s, lang ?? langForScript(script), script).join(" ");
}

export type StepVerdict = "dogru" | "yakin" | "yanlis";

export interface CheckStepOptions {
  /** Hedef dil; verilmezse yazı sisteminden tahmin edilir (Latin → en). */
  lang?: LanguageId;
  /** Mikrofonla mı söylendi — sesteş kelime ve artikel yutma yalnız seste affedilir. */
  spoken?: boolean;
  /** Bir önceki adımın hedefi: bu adımda EKLENEN kelimeler ondan çıkarılır. */
  prev?: string;
  /** Cümle düzeyindeki eşdeğer söyleyişler. */
  swaps?: Swap[];
  /** Setin zaman çerçevesi ("habit" iken -iyor'lu cevap yanlış sayılır). */
  tense?: TenseFrame;
}

/**
 * Eski ekranın denetimi — artık checkAnswer'ın ince bir sarmalayıcısı.
 * "Uzun cümlede tek kelime farkı yakın" kuralı KALDIRILDI: hocanın uyardığı
 * tuzak kelime (with/by, ago/before), bağlaç ya da bu adımda eklenen kelime
 * tek kelime olsa da yanlıştır; yalnız artikel gibi ses tanıma gürültüsü
 * "yakın" sayılır (bkz. buildcheck.ts, 8 kurallı öncelik tablosu).
 */
export function checkStep(
  step: BuildStep,
  given: string,
  script: ScriptId,
  opts: CheckStepOptions = {}
): StepVerdict {
  const r = checkAnswer(step.target, step.alts, given, {
    lang: opts.lang ?? langForScript(script),
    script,
    spoken: opts.spoken,
    prev: opts.prev,
    swaps: opts.swaps,
    tense: opts.tense,
  });
  return r ? r.verdict : "yanlis";
}

// ---------------------------------------------------------------------------
// İlerleme (v1 — ekran v2'ye geçene kadar; v2 ilerleme buildmastery.ts'te)
// ---------------------------------------------------------------------------

export interface PatternProgress {
  attempts: number;
  correct: number;
  /** Tamamlanan cümle sayısı (bütün adımları bitirilen). */
  sentencesDone: number;
  lastAt: string;
  /**
   * Son denemeler (1 doğru, 0 yanlış), en fazla RECENT_WINDOW. Oturma kararı
   * TOPLAM isabete değil buna bakar: ilk günlerin yanlışları, kalıbı artık
   * bilen öğrenciyi sonsuza kadar tutmasın; eski doğrular da unutulmuş bir
   * kalıbı "oturdu" göstermesin.
   */
  recent?: number[];
}

export type ProgressMap = Record<string, PatternProgress>;

/**
 * Bir kalıp "OTURDU" sayılır: en az 12 cümle kurulmuş VE son 20 denemede
 * isabet %85+. Kullanıcının isteği: "tam kavradığımı çözsün". Eski ölçüt
 * (4 cümle, %80) birkaç şanslı doğruyla geçiliyordu.
 */
export const MASTER_SENTENCES = 12;
export const MASTER_ACCURACY = 0.85;
export const RECENT_WINDOW = 20;
/** Son-deneme isabeti ancak bu kadar deneme birikince anlamlı. */
const MIN_RECENT = 10;

function recentAccuracy(p: PatternProgress): number | null {
  const r = p.recent ?? [];
  if (r.length < MIN_RECENT) return p.attempts >= MIN_RECENT ? p.correct / p.attempts : null;
  return r.reduce((a, b) => a + b, 0) / r.length;
}

export function isMastered(p: PatternProgress | undefined): boolean {
  if (!p || p.attempts === 0) return false;
  const acc = recentAccuracy(p);
  return p.sentencesDone >= MASTER_SENTENCES && acc !== null && acc >= MASTER_ACCURACY;
}

/** Ekranda gösterilecek ilerleme: kaç cümle kaldı, son isabet. */
export function masteryStatus(p: PatternProgress | undefined): {
  sentences: number;
  needSentences: number;
  accuracy: number | null;
  mastered: boolean;
} {
  return {
    sentences: p?.sentencesDone ?? 0,
    needSentences: MASTER_SENTENCES,
    accuracy: p ? recentAccuracy(p) : null,
    mastered: isMastered(p),
  };
}

export function recordAttempt(
  map: ProgressMap,
  patternId: string,
  verdict: StepVerdict,
  sentenceFinished: boolean,
  now = new Date()
): ProgressMap {
  const prev = map[patternId] ?? { attempts: 0, correct: 0, sentencesDone: 0, lastAt: "" };
  // "yakın" doğru sayılır: tek kelimelik kayma çoğu zaman ses tanımadan.
  const hit = verdict === "yanlis" ? 0 : 1;
  return {
    ...map,
    [patternId]: {
      attempts: prev.attempts + 1,
      correct: prev.correct + hit,
      sentencesDone: prev.sentencesDone + (sentenceFinished ? 1 : 0),
      lastAt: now.toISOString(),
      recent: [...(prev.recent ?? []), hit].slice(-RECENT_WINDOW),
    },
  };
}

/**
 * Sıradaki kalıp: merdivende oturmamış İLK kalıp. Seviyenin altındaki
 * kalıplar da atlanmaz — B1 öğrencisinin "istek" kalıbı oturmamışsa oradan
 * başlamak, üstüne kurmaktan iyidir; ama oturmuş olanlar zaten geçilir.
 * v2'de eklenen basamaklar, öğrencinin oturttuğu en üst kalıbın ALTINDA
 * kalıyorsa atlanır: onları yerleştirme yoklaması yakalar, dayatılmaz.
 */
export function nextPattern(map: ProgressMap): Pattern {
  let highest = -1;
  PATTERN_LADDER.forEach((p, i) => {
    if (isMastered(map[p.id])) highest = i;
  });
  return (
    PATTERN_LADDER.find((p, i) => !isMastered(map[p.id]) && (LEGACY_SET.has(p.id) || i > highest)) ??
    PATTERN_LADDER[PATTERN_LADDER.length - 1]
  );
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

// ===========================================================================
// v2 — plan + cümle cümle üretim, cihazda toparlama, kart sırası
// ===========================================================================

/** Planın bağlaç alanı: k tür, tr Türkçe bağlaç/ek, t hedefteki karşılığı, p1/p2 iki kısım (mastar). */
export interface PlanConn {
  k: ConnKind;
  tr: string;
  t: string;
  p1?: string;
  p2?: string;
}

export interface SentencePlan {
  tr: string;
  role: Role;
  conn?: PlanConn;
  /** Bu cümlede İLK kez öğretilen taşlar (hedef dilde kısa biçim). */
  new: string[];
  /** Geri gelen taşlar ("Bunu öğrendik"). */
  rec: string[];
  /** Odak kalıp bu cümlede geçiyor mu. */
  focus: boolean;
  /** Odak kalıp bu cümlede mi GİRİYOR. */
  focusNew: boolean;
  /** Sistem dersi kimliği; sette en fazla bir tane, yalnız çukur cümlesinde. */
  sys?: string;
}

export interface SetPlan {
  intro: string;
  ozet: string;
  tense: TenseFrame;
  sentences: SentencePlan[];
}

/** Bağlaç kartı — hocanın "Burada bir bağlacımız var" anı. */
export interface ConnectorCard {
  kind: ConnKind;
  tr: string;
  target: string;
  /** İki kısım Türkçe mastar hâlinde ("kahvaltı yapmak", "duş almak"). */
  part1: string;
  part2: string;
  /** Tuzak/karşıtlık metni; bağlaç öğrencinin geçmişinde İLK kez geçiyorsa dolu. */
  contrast: string;
  trapId?: string;
  /** Öğrencinin 3. bağlaçlı cümlesinden itibaren bağlacı kendisi bulur. */
  learnerSplit: boolean;
}

/** İki seçenekli geri çağırma: "AM mi PM mi?" — gerektiren adımdan ÖNCE. */
export interface Retrieval {
  step: number;
  q: string;
  options: [string, string];
  answer: 0 | 1;
  why: string;
  src: "system" | "trap" | "model";
  refKey?: string;
}

export interface BuildBlock {
  target: string;
  tr: string;
  note: string;
  contrast: string;
  /** Görünen eşdeğerler (en fazla 2); kabul swap'larla yapılır. */
  alts: string[];
  kind: BlockKind;
  /** Öğretildiği adım; bağlaç taşı -1 (kartta öğretilir). */
  step: number;
  /** blockKey(target): karşılaştırma biçimi — taş ilerlemesinin anahtarı. */
  key: string;
  /** Doğru tokenları bu taşta geçen kod tuzakları. */
  trapIds?: string[];
  /** Daha önce öğretildi: not ve karşıtlık GÖSTERİLMEZ, ilk hâli burada saklanır (-1 = önceki set). */
  recycled?: { fromSentence: number; firstNote: string; firstContrast: string };
  pair?: { target: string; tr: string };
  transfer?: { target: string; tr: string };
}

export interface BuildSentence {
  tr: string;
  steps: BuildStep[];
  blocks: BuildBlock[];
  reorder: string;
  role: Role;
  connector: ConnectorCard | null;
  /** Önceki cümleye bağlı (çünkü): 0. adım önceki cümlenin tekrarı. */
  linkPrev: boolean;
  usesFocus: boolean;
  focusIsNew: boolean;
  /** "Öğrendik ✓" çiplerinin taş anahtarları. */
  recallKeys: string[];
  target: string;
  /** canonical(son hedef) — farklı cümle sayımı ve tekrar anahtarı. */
  key: string;
  translitWords: string[];
  reorderTranslit: string;
  swaps: Swap[];
  retrievals: Retrieval[];
  systemLesson?: { id: string; step: number };
  /** Önce tek seferde denenir (sentez, B2+, kanıtlama aşaması). */
  tryFirst: boolean;
  status: "ready" | "pending" | "failed";
}

export interface BuildSet {
  v: 2;
  id: string;
  /** Karma modda "karma:a+b". */
  patternId: string;
  themeId: string;
  lang: LanguageId;
  level: Band;
  tense: TenseFrame;
  episode: number;
  intro: string;
  plan: SetPlan;
  sentences: BuildSentence[];
  createdAt: string;
  origin?: "v1";
}

export type Card =
  | { t: "read" }
  | { t: "recall"; keys: string[] }
  | { t: "connector"; card: ConnectorCard }
  | { t: "oneshot" }
  | { t: "kurus" }
  | { t: "system"; id: string; part: "abc" | "d" }
  | { t: "retrieval"; r: Retrieval }
  | { t: "step"; i: number }
  | { t: "reorder"; first: boolean }
  | { t: "pair" | "transfer" | "open"; blockKey: string }
  | { t: "recap" };

// ---------------------------------------------------------------------------
// Küçük yardımcılar
// ---------------------------------------------------------------------------

/** Taşın anahtarı: karşılaştırma biçimi (hareke, büyük harf, noktalama yok). */
export function blockKey(target: string, lang: LanguageId): string {
  return canonicalTokens(target, lang).join(" ");
}

/** Türkçe küçük harf (I → ı, İ → i). */
function trLower(s: string): string {
  return s.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
}

function trUpperFirst(s: string): string {
  if (!s) return s;
  const c = s[0];
  const u = c === "i" ? "İ" : c === "ı" ? "I" : c.toUpperCase();
  return u + s.slice(1);
}

function trLowerFirst(s: string): string {
  if (!s) return s;
  const c = s[0];
  const l = c === "I" ? "ı" : c === "İ" ? "i" : c.toLowerCase();
  return l + s.slice(1);
}

/**
 * Türkçe cümlenin tekrar anahtarı (BuildHistory.trKeys): büyük/küçük ve
 * noktalama farkı aynı cümle sayılır. Kısa bir özet (djb2) — 500 cümle
 * saklanır, metnin kendisi gerekmez.
 */
export function trKey(tr: string): string {
  const norm = trLower(tr)
    .replace(/[.,!?;:…"'“”‘’()«»\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i += 1) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const END_PUNCT = /[\s.!?。؟…]+$/;
const TRAIL = /[.,!?;:،؛؟…]+$/;
const words = (s: string) => s.split(/\s+/).filter(Boolean);
const bare = (w: string) => w.replace(TRAIL, "").replace(/^[«"“(]+/, "");
const sameToks = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function sortedToks(s: string, lang: LanguageId): string {
  return [...canonicalTokens(s, lang)].sort().join(" ");
}

/** İki söyleyiş aynı kelimelerin başka sırası mı (Almancada fiil yeri değişse de). */
export function isPermutation(a: string, b: string, lang: LanguageId): boolean {
  const x = sortedToks(a, lang);
  return x.length > 0 && x === sortedToks(b, lang) && blockKey(a, lang) !== blockKey(b, lang);
}

/** Basit, deterministik özet: seçenek karıştırma testte tekrarlanabilir olsun. */
function hashNum(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Türkçe soru eki (mı/mi/mu/mü) — son ünlüye göre; ünlüsüz (Arapça) kelimede "mı". */
function questionParticle(word: string): string {
  const v = trLower(word).match(/[aeıioöuü](?=[^aeıioöuü]*$)/);
  if (!v) return "mı";
  return { a: "mı", ı: "mı", e: "mi", i: "mi", o: "mu", u: "mu", ö: "mü", ü: "mü" }[v[0]] ?? "mı";
}

// ---------------------------------------------------------------------------
// Set boyu, roller, bağlaç dizisi
// ---------------------------------------------------------------------------

/**
 * Set boyu: A2'de videonun 8 cümlesi; diğerlerinde en az 6 — her sette
 * açılış, kurma, zirve, çukur, uzatma ve sentez olsun. Arapçada da aynı:
 * cümle cümle üretim kesilme baskısını kaldırıyor.
 */
export function setSize(band: Band): number {
  return { A1: 6, A2: 8, B1: 7, B2: 6, C1: 6, C2: 6 }[band] ?? 6;
}

/** Videonun 8 cümlelik yük eğrisi: roller ve yuva başına bağlaç türü. */
const ARC8: { role: Role; kind: ConnKind }[] = [
  { role: "open", kind: "none" },
  { role: "build", kind: "sub" },
  { role: "build", kind: "sub" },
  { role: "peak", kind: "coord" },
  { role: "dip", kind: "none" },
  { role: "build", kind: "sub" },
  { role: "extension", kind: "causal" },
  { role: "synthesis", kind: "none" },
];

/**
 * n cümlelik setin 8'li eğrideki yerleri. 7: çukurdan sonraki kurma düşer;
 * 6: aynalı ikinci kurma da düşer. 6'dan küçüğü (bozuk plan) için en önemli
 * roller kalır; 8'den büyüğünde çukurdan sonra kurma eklenir.
 */
function arcLayout(n: number): number[] {
  if (n >= 8) return [0, 1, 2, 3, 4, ...Array.from({ length: n - 7 }, () => 5), 6, 7];
  const table: Record<number, number[]> = {
    7: [0, 1, 2, 3, 4, 6, 7],
    6: [0, 1, 3, 4, 6, 7],
    5: [0, 1, 3, 6, 7],
    4: [0, 3, 6, 7],
    3: [0, 6, 7],
    2: [0, 7],
    1: [0],
  };
  return table[Math.max(1, n)] ?? [];
}

/** n cümlenin rolleri, sırayla. Her 6+ sette çukur, uzatma ve sentez vardır. */
export function arcRoles(n: number): Role[] {
  return arcLayout(n).map((i) => ARC8[i].role);
}

/** Bant başına bağlaç ailesi (8 yuva; "" = bağlaçsız). Tablo: tasarım §2.1. */
const CONN_TR: Record<Band, string[]> = {
  A1: ["", "", "", "ama", "", "", "ve / sonra", ""],
  A2: ["", "-madan önce", "-dıktan sonra", "ama", "", "-dığımda", "çünkü", ""],
  B1: ["", "-sa", "-ken", "ama / ancak", "", "-ana kadar", "çünkü / -dığı için", ""],
  B2: ["", "-masına rağmen", "-ır -maz", "ancak / oysa", "", "-madıkça", "-dığı için", ""],
  C1: ["", "-sa bile", "-dığı halde", "-dığı gibi … da", "", "-ması şartıyla", "çünkü", ""],
  C2: ["", "-sa bile", "-dığı halde", "-dığı gibi … da", "", "-ması şartıyla", "çünkü", ""],
};

export interface ConnSlot {
  role: Role;
  kind: ConnKind;
  /** Türkçe bağlaç ("" = bağlaçsız). */
  tr: string;
  /** Önceki kurmanın aynası (önce ↔ sonra). */
  mirror?: boolean;
  /** Önceki cümleye bağlı (uzatma). */
  linked?: boolean;
  /** Sistem dersinin yeri (çukur). */
  sys?: boolean;
}

/**
 * Setin bağlaç dizisi. A1'de kurma yuvaları bağlaçsızdır (yeni bir hâl
 * sorusu) ve uzatma "ve / sonra" ile bağlanır. Odak kalıp kendisi bir
 * bağlaçsa kendi türündeki ilk yuvayı alır — kalıp hikâyeye zorla değil,
 * yerine oturur.
 */
export function connSeq(band: Band, n: number, focus: Pattern[] = []): ConnSlot[] {
  const layout = arcLayout(n);
  const trs = CONN_TR[band] ?? CONN_TR.A2;
  const slots: ConnSlot[] = layout.map((i, pos) => {
    const base = ARC8[i];
    let kind: ConnKind = trs[i] ? base.kind : "none";
    if (band === "A1" && base.role === "extension") kind = "coord";
    const s: ConnSlot = { role: base.role, kind, tr: trs[i] };
    if (i === 2 && layout[pos - 1] === 1) s.mirror = true;
    if (base.role === "extension") s.linked = true;
    if (base.role === "dip") s.sys = true;
    return s;
  });
  for (const f of focus) {
    if (f.conn === "none") continue;
    const want: Role = f.conn === "sub" ? "build" : f.conn === "coord" ? "peak" : "extension";
    const slot = slots.find((s) => s.role === want && (f.conn !== "sub" || s.kind === "sub")) ?? slots.find((s) => s.role === want);
    if (slot) {
      slot.tr = f.trigger;
      slot.kind = f.conn;
    }
  }
  return slots;
}

/** Plan promptundaki "Bağlaçlar sırayla" satırı. */
export function connSeqLine(slots: ConnSlot[]): string {
  return slots
    .map((s) => (s.role === "synthesis" ? "sentez (sette öğretilmiş bir bağlaç geri gelebilir)" : s.tr || "—"))
    .join(" · ");
}

// ---------------------------------------------------------------------------
// validatePlan — planın cihazda düzeltilmesi (tasarım §2.6)
// ---------------------------------------------------------------------------

export interface ValidatePlanOpts {
  lang: LanguageId;
  band: Band;
  /** Tema çerçevesi (planda tense yoksa). */
  tense?: TenseFrame;
  /** BuildHistory.trKeys: daha önce kurulmuş Türkçe cümleler tekrar edilmez. */
  trKeys?: string[];
}

export interface ValidatedPlan {
  plan: SetPlan;
  /** Öğrenciye gösterilebilecek uyarılar (set yine kullanılır). */
  warnings: string[];
  /** Tarihçede zaten olduğu için atılan Türkçe cümleler. */
  dropped: string[];
  /** 1'den fazla cümle atıldıysa: planı bu listeyle bir kez yeniden iste. */
  replan: boolean;
}

const ROLES: Role[] = ["open", "build", "peak", "dip", "extension", "synthesis"];
const KINDS: ConnKind[] = ["sub", "coord", "causal", "none"];
const TENSES: TenseFrame[] = ["habit", "now", "past", "future", "mixed"];

/** Bağlaç kısmındaki sıklık zarfları — kısım adında gereksiz ("bazen" değil "işe gitmek"). */
const TR_FREQ = /^(bazen|sıklıkla|sık|sık sık|her zaman|mutlaka|genellikle|genelde|hep|asla|hiç|çoğu zaman|ara sıra)$/;
const TR_VOWELS = "aeıioöuü";

const vowelCount = (s: string) => [...s].filter((c) => TR_VOWELS.includes(c)).length;

function infinitive(stem: string): string {
  const v = [...stem].reverse().find((c) => TR_VOWELS.includes(c));
  return stem + (v && "aıou".includes(v) ? "mak" : "mek");
}

/** Yumuşayan kök: gid(er) → git, ed(iyor) → et. */
function hardenStem(s: string): string {
  if (s === "gid") return "git";
  if (s === "ed") return "et";
  return s;
}

/**
 * Çekimli yüklemden kök — yalnız YEDEK: plan p1/p2'yi mastar olarak yazar;
 * yazmazsa bu kural "alırım → al, giderim → git, seviyorum → sev" yapar.
 * Sözlüksüz olduğu için kusurlu olabilir; sonuç boşsa Türkçe parçanın
 * kendisi kullanılır.
 */
function verbStem(word: string): string {
  let s = trLower(word).replace(/[.,!?;:…]+$/, "");
  s = s.replace(/(sınız|siniz|sunuz|sünüz|ız|iz|uz|üz|ım|im|um|üm|sın|sin|sun|sün|lar|ler)$/, "");
  if (/(ıyor|iyor|uyor|üyor)$/.test(s)) s = s.slice(0, -4);
  else if (/yor$/.test(s)) s = s.slice(0, -3);
  else if (/(acak|ecek)$/.test(s)) s = s.slice(0, -4);
  else if (/(dı|di|du|dü|tı|ti|tu|tü)$/.test(s)) s = s.slice(0, -2);
  else if (/(ar|er)$/.test(s)) {
    const rem = s.slice(0, -2);
    s = vowelCount(rem) === 1 ? rem : s.slice(0, -1);
  } else if (/(ır|ir|ur|ür)$/.test(s)) s = s.slice(0, -2);
  else if (/[aeıioöuü]r$/.test(s)) s = s.slice(0, -1);
  return hardenStem(s);
}

/** Bağlaç ekini taşıyan kelimeden kök: yapmadan → yap, vardığımda → var. */
const CONN_SUFFIXES: RegExp[] = [
  /m[ae]d[ae]n$/,
  /[dt][ıiuü]kt[ae]n$/,
  /[dt][ıiuü]ğ[ıiuü](m|n|mız|miz|nız|niz)?nd[ae]n$/,
  /[dt][ıiuü]ğ[ıiuü](m|n|mız|miz|nız|niz)?[dt][ae]$/,
  /[dt][ıiuü]ğ[ıiuü](m|n|mız|miz|nız|niz)?$/,
  /m[ae]s[ıi]n[ae]$/,
  /m[ae]d[ıi]k[çc][ae]$/,
  /m[ae]s[ıi]$/,
  /y?[ıiuü]n[cç][ae]$/,
  /([ıiuüae]?r)?ken$/,
  /y?[ae]n[ae]$/,
  /s[ae]$/,
  /[ıiuüae]r$/,
];

function connStem(word: string): string {
  const w = trLower(word).replace(/[.,!?;:…]+$/, "");
  for (const re of CONN_SUFFIXES) {
    if (re.test(w)) return hardenStem(w.replace(re, ""));
  }
  return "";
}

/** Bir kısmı mastara çevirir: "Bazen işe metroyla giderim" → "işe metroyla gitmek". */
function clauseInfinitive(clause: string): string {
  const ws = words(clause.replace(/[.,!?;:…]+$/, "")).map(trLower);
  const kept: string[] = [];
  for (let i = 0; i < ws.length; i += 1) {
    if (TR_FREQ.test(ws[i]) || (i + 1 < ws.length && TR_FREQ.test(`${ws[i]} ${ws[i + 1]}`))) {
      if (i + 1 < ws.length && TR_FREQ.test(`${ws[i]} ${ws[i + 1]}`)) i += 1;
      continue;
    }
    kept.push(ws[i]);
  }
  if (!kept.length) return "";
  const stem = verbStem(kept[kept.length - 1]);
  if (!stem) return "";
  return [...kept.slice(0, -1), infinitive(stem)].join(" ");
}

/**
 * p1/p2 yedeği (tasarım §2.6 adım 9): bağlaç ekli kök + -mak/-mek; yüklem
 * kökü + -mak/-mek. Olmazsa Türkçe parçanın kendisi.
 */
export function fallbackParts(tr: string, conn: PlanConn, prevTr = ""): { p1: string; p2: string } {
  const clean = tr.replace(/[.!?…]+$/, "").trim();
  if (conn.k === "causal") {
    const rest = clean.replace(/^\s*(çünkü|Çünkü|zira)\s+/, "");
    const prev = prevTr.replace(/[.!?…]+$/, "").trim();
    return { p1: clauseInfinitive(prev) || trLowerFirst(prev), p2: clauseInfinitive(rest) || trLowerFirst(rest) };
  }
  if (conn.k === "coord") {
    const head = trLower(conn.tr).split(/\s*\/\s*/)[0].trim();
    const idx = head ? trLower(clean).search(new RegExp(`(^|[\\s,])${head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|,|$)`)) : -1;
    if (idx >= 0) {
      const a = clean.slice(0, idx).replace(/[,\s]+$/, "");
      const b = clean.slice(idx).replace(/^[,\s]+/, "").slice(head.length).trim();
      return { p1: clauseInfinitive(a) || trLowerFirst(a), p2: clauseInfinitive(b) || trLowerFirst(b) };
    }
    return { p1: trLowerFirst(clean), p2: "" };
  }
  const span = locateTrPiece(clean, conn.tr.split(/\s*\/\s*/)[0] ?? conn.tr);
  if (!span) return { p1: trLowerFirst(clean), p2: "" };
  const before = clean.slice(0, span[0]).trim();
  const spanText = clean.slice(span[0], span[1]);
  const after = clean.slice(span[1]).replace(/^[,\s]+/, "").trim();
  const hostWord = words(spanText)[0] ?? "";
  const stem = connStem(hostWord);
  const p1 = stem ? [...words(trLower(before)), infinitive(stem)].filter(Boolean).join(" ") : trLowerFirst(`${before} ${spanText}`.trim());
  const p2 = clauseInfinitive(after) || trLowerFirst(after);
  return { p1, p2 };
}

function parseConn(v: unknown, lang: LanguageId): PlanConn | undefined {
  // Model iki bağlaç yazdıysa (dizi) yalnız ilki kalır: cümle başına EN FAZLA BİR bağlaç.
  const o = obj(Array.isArray(v) ? v[0] : v);
  const k = str(o.k ?? o.kind) as ConnKind;
  if (!KINDS.includes(k) || k === "none") return undefined;
  const tr = str(o.tr);
  const t = str(o.t ?? o.target) || methodFor(lang).connectors[tr]?.target || "";
  if (!tr || !t) return undefined;
  const c: PlanConn = { k, tr, t };
  const p1 = str(o.p1);
  const p2 = str(o.p2);
  if (p1) c.p1 = p1;
  if (p2) c.p2 = p2;
  return c;
}

/**
 * Modelin planını yöntemin kalıbına oturtur: roller konuma göre zorlanır,
 * bağlaç türü yuvasına uyar, sentezde yeni bağlaç olmaz, bir taş setin
 * yalnız bir cümlesinde "yeni" olur, sistem dersi çukura taşınır, daha önce
 * kurulmuş Türkçe cümle tekrarlanmaz.
 */
export function validatePlan(raw: unknown, n: number, opts: ValidatePlanOpts): ValidatedPlan {
  const r = obj(raw);
  const warnings: string[] = [];
  const m = methodFor(opts.lang);
  const key = (s: string) => blockKey(s, opts.lang);
  const hist = new Set(opts.trKeys ?? []);
  const dropped: string[] = [];

  // 8. Tarihçe: daha önce kurulmuş cümle atılır.
  const rawS = arr(r.s ?? r.sentences)
    .map(obj)
    .filter((x) => str(x.tr))
    .filter((x) => {
      if (!hist.has(trKey(str(x.tr)))) return true;
      dropped.push(str(x.tr));
      return false;
    })
    .slice(0, Math.max(1, n));

  // 1. Roller konuma göre.
  const roles = arcRoles(rawS.length);
  const sentences: SentencePlan[] = rawS.map((x, i) => {
    const list = (v: unknown) => arr(v).map(str).filter(Boolean);
    const sp: SentencePlan = {
      tr: str(x.tr),
      role: roles[i],
      new: list(x.new),
      rec: list(x.rec),
      focus: x.focus === true,
      focusNew: x.fn === true || x.focusNew === true,
    };
    // 2. En fazla bir bağlaç (parseConn diziden ilkini alır).
    const conn = parseConn(x.conn, opts.lang);
    if (conn) sp.conn = conn;
    const sys = str(x.sys);
    if (sys) sp.sys = sys;
    if (sp.focusNew) sp.focus = true;
    return sp;
  });

  const seenConn = new Set<string>();
  sentences.forEach((sp, i) => {
    // 3. Bağlaç türü yuvasına uyar.
    if (sp.role === "extension") {
      if (!sp.conn && /^\s*çünkü(\s|,|$)/i.test(sp.tr)) {
        const c = m.connectors["çünkü"];
        if (c) sp.conn = { k: "causal", tr: "çünkü", t: c.target };
      }
      if (sp.conn && sp.conn.k !== "causal" && !(opts.band === "A1" && sp.conn.k === "coord")) sp.conn.k = "causal";
    }
    if (i === 0 && sp.conn?.k === "causal") delete sp.conn;
    // 4. Sentez: yeni bağlaç yok (setteki bağlaç geri gelebilir), en fazla 2 yeni taş.
    if (sp.role === "synthesis") {
      if (sp.conn && !seenConn.has(key(sp.conn.t))) {
        warnings.push("Son cümledeki yeni bağlaç çıkarıldı: sentezde yalnız öğrenilenler birleşir.");
        delete sp.conn;
      }
      if (sp.new.length > 2) sp.new = sp.new.slice(0, 2);
    }
    if (sp.conn) seenConn.add(key(sp.conn.t));
    // 9. Kısım adları yoksa kök kuralı.
    if (sp.conn && (!sp.conn.p1 || !sp.conn.p2)) {
      const fb = fallbackParts(sp.tr, sp.conn, sentences[i - 1]?.tr ?? "");
      if (!sp.conn.p1) sp.conn.p1 = fb.p1;
      if (!sp.conn.p2) sp.conn.p2 = fb.p2;
    }
  });

  // 5. Bir taş yalnız ilk cümlesinde "yeni"; sonrakilerde "geri gelen".
  const firstNew = new Set<string>();
  for (const sp of sentences) {
    const keep: string[] = [];
    for (const nw of sp.new) {
      const k = key(nw);
      if (!k) continue;
      if (firstNew.has(k)) {
        if (!sp.rec.some((x) => key(x) === k)) sp.rec.push(nw);
      } else {
        firstNew.add(k);
        keep.push(nw);
      }
    }
    sp.new = keep;
  }

  // 6. Odak kalıp: bir cümlede girer, en az 3 cümlede geçer (uyarı; set yine kullanılır).
  const fn = sentences.filter((s) => s.focusNew).length;
  const fc = sentences.filter((s) => s.focus).length;
  if (fn !== 1) warnings.push(`Odak kalıp ${fn === 0 ? "hiçbir cümlede girmiyor" : `${fn} cümlede yeni`}; bir kez girmesi beklenirdi.`);
  if (fc < 3) warnings.push(`Odak kalıp yalnız ${fc} cümlede geçiyor; en az 3 beklenirdi.`);

  // 7. Tek sistem dersi, bilinen kimlik, çukurda.
  const sysId = sentences.map((s) => s.sys).find((s) => s && m.systems.some((x) => x.id === s));
  for (const s of sentences) delete s.sys;
  if (sysId) {
    const dip = sentences.find((s) => s.role === "dip");
    if (dip) dip.sys = sysId;
  }

  const tense = TENSES.includes(str(r.tense) as TenseFrame) ? (str(r.tense) as TenseFrame) : opts.tense ?? "habit";
  return {
    plan: { intro: str(r.intro), ozet: str(r.ozet), tense, sentences },
    warnings,
    dropped,
    replan: dropped.length > 1,
  };
}

// ---------------------------------------------------------------------------
// normalizeSentence — modelin tek cümlesi → BuildSentence (tasarım §2.6)
// ---------------------------------------------------------------------------

/** Önceki setlerden bilinen taş (BuildBlockProgress ile uyumlu en küçük biçim). */
export interface KnownBlock {
  note?: string;
  contrast?: string;
  contrastShown?: boolean;
}

export interface NormalizeStores {
  band: Band;
  /** Taş ilerlemesi (anahtar: blockKey). */
  blocks?: Record<string, KnownBlock>;
  /** BuildUi.connSeen: bağlaç hedefinin anahtarı → kaç cümlede görüldü. */
  connSeen?: Record<string, number>;
  acceptDialect?: boolean;
  /** Odak kalıbın durumu (proving/verify/mastered → önce tek seferde). */
  patternStatus?: string;
  /** Karşıtlığı daha önce gösterilmiş tuzaklar. */
  shownTrapIds?: string[];
  /** Tekrar oturumu: her cümle tek seferde. */
  review?: boolean;
}

const LINK_WORD = /^(çünkü|ve|sonra|ama|ancak|fakat|zira)(\s|,|$)/i;
const LEGACY_NO_REORDER = new Set(["because", "but", "however", "لان", "لكن", "ولكن"]);

interface RawStep {
  q: string;
  p: string;
  t: string;
  n: string;
  e: boolean;
  tx: string;
}

interface RawBlock {
  t: string;
  tr: string;
  k: string;
  s: number | null;
  n: string;
  c: string;
  a: string[];
  pair?: { target: string; tr: string };
  x?: { target: string; tr: string };
}

function pairOf(v: unknown): { target: string; tr: string } | undefined {
  const o = obj(v);
  const target = str(o.t ?? o.target);
  const tr = str(o.tr);
  return target && tr ? { target, tr } : undefined;
}

/** Kapsanan Türkçe aralıklar → "şu ana kadar": bitişikse aradaki virgül korunur. */
function spansText(tr: string, spans: [number, number][]): string {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  let out = "";
  merged.forEach(([a, b], i) => {
    if (i > 0) {
      const gap = tr.slice(merged[i - 1][1], a);
      out += /^[\s,;:]*$/.test(gap) ? gap : " ";
    }
    out += tr.slice(a, b);
  });
  return trUpperFirst(out.trim());
}

/**
 * Adımların hamlesi, eklenen kelimeleri ve tutarlılığı (LCS). Arapçada
 * ek ve hareke meşru biçimde değiştiği için tutarsız adım ATILMAZ, yalnız
 * "reshaped" işaretlenir.
 */
function enrichSteps(steps: BuildStep[], lang: LanguageId, connToks: string[][], chunkToks: string[][]): void {
  steps.forEach((st, i) => {
    const prev = i > 0 ? steps[i - 1].target : "";
    const d = diffAdded(prev, st.target, lang);
    st.added = d.added;
    st.inserted = i > 0 && d.inserted;
    const prevToks = canonicalTokens(prev, lang);
    const curToks = canonicalTokens(st.target, lang);
    const add = addedTokens(prev, st.target, lang);
    const lcs = curToks.length - add.length;
    if (i > 0 && prevToks.length > 0 && lcs / prevToks.length < 0.6) st.reshaped = true;
    if (st.move === "linked") return;
    const isConn = add.length > 0 && connToks.some((c) => c.length > 0 && add.every((t) => c.includes(t)));
    const prevMove = steps[i - 1]?.move;
    if (isConn) st.move = "connector";
    else if (i === steps.length - 1 && i > 0) st.move = "toparla";
    else if (i === 0 || prevMove === "connector" || prevMove === "linked" || steps[i - 1]?.clauseEnd) st.move = "anchor";
    else if (st.inserted) st.move = "insert";
    else if (add.length > 1 && chunkToks.some((c) => c.length > 1 && c.every((t) => add.includes(t)))) st.move = "chunk";
    else st.move = "slot";
  });
}

function methodChunkToks(lang: LanguageId): string[][] {
  return methodFor(lang).chunks.map((c) => canonicalTokens(c, lang));
}

/** Cümle hedefinden bağlaç kısmı sonrası: kelime düzeyinde önek eşleşmesi. */
function stripPrefixWords(text: string, prefix: string, lang: LanguageId): string | null {
  const want = canonicalTokens(prefix, lang);
  if (!want.length) return null;
  const ws = words(text);
  for (let w = 1; w <= ws.length; w += 1) {
    const got = canonicalTokens(ws.slice(0, w).join(" "), lang);
    if (sameToks(got, want)) return ws.slice(w).join(" ").replace(/^[,،;\s]+/, "");
    if (got.length > want.length) return null;
  }
  return null;
}

function lowerFirstTarget(s: string, lang: LanguageId): string {
  if (scriptOf(lang) !== "latin" || !s) return s;
  if (/^I(\s|'|’|$)/.test(s)) return s;
  return s[0].toLowerCase() + s.slice(1);
}

function upperFirstTarget(s: string, lang: LanguageId): string {
  if (scriptOf(lang) !== "latin" || !s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * Model sıralama göndermediyse bağlacı ortaya alan sıralamayı cihaz kurar:
 * ikinci kısım + birinci kısım (yalnız serbest sıralı dillerde).
 */
function autoReorderOf(steps: BuildStep[], finalT: string, lang: LanguageId): string {
  const end = (finalT.match(/[.!?؟]+$/) ?? [""])[0];
  const body = finalT.replace(END_PUNCT, "");
  let c1 = "";
  let c2 = "";
  const ce = steps.find((s) => s.clauseEnd && s.move !== "linked");
  if (ce) {
    c1 = ce.target.replace(/[\s,،;.]+$/, "");
    const rest = stripPrefixWords(body, c1, lang);
    if (rest === null) return "";
    c2 = rest;
  } else {
    const m = body.match(/^(.+?)[,،]\s*(.+)$/);
    if (!m) return "";
    c1 = m[1];
    c2 = m[2];
  }
  if (!c1 || !c2) return "";
  return `${upperFirstTarget(c2.replace(/[\s,،;]+$/, ""), lang)} ${lowerFirstTarget(c1, lang)}${end}`;
}

function trapIdsFor(toks: string[], lang: LanguageId): string[] {
  return methodFor(lang)
    .traps.filter((tp) => {
      const right = tp.right.flatMap((x) => canonicalTokens(x, lang));
      return right.length > 0 && right.every((t) => toks.includes(t));
    })
    .map((tp) => tp.id);
}

/**
 * Tek cümlenin modelden gelen ham hâlini (şema §2.4) cihazda toparlar:
 * Türkçe "şu ana kadar", bağlantılı cümlenin önek adımı, bağlaç kartı, taş
 * geri dönüşü (markRecycled), sıralama, swap'lar, okunuş hizası, geri
 * çağırma soruları ve bayraklar. 2'den az kullanılabilir adım → "failed"
 * (üretim hattı KISA MOD'da bir kez daha dener).
 */
export function normalizeSentence(
  raw: unknown,
  plan: SetPlan,
  k: number,
  built: BuildSentence[],
  lang: LanguageId,
  stores: NormalizeStores
): BuildSentence {
  const sp: SentencePlan = plan.sentences[k] ?? { tr: "", role: "build", new: [], rec: [], focus: false, focusNew: false };
  const r = obj(raw);
  const m = methodFor(lang);
  const nonLatin = scriptOf(lang) !== "latin";

  const rawSteps: RawStep[] = arr(r.steps)
    .map(obj)
    .map((x) => ({
      q: str(x.q ?? x.question),
      p: str(x.p ?? x.trPiece),
      t: str(x.t ?? x.target),
      n: str(x.n ?? x.note),
      e: x.e === 1 || x.e === true,
      tx: str(x.tx),
    }))
    .filter((x) => x.p && x.t)
    .slice(0, 10);

  // --- 3. Bağlantılı (çünkü) cümle: önceki cümle 0. adım olur.
  const prevS = k > 0 ? built[k - 1] : undefined;
  const linked =
    !!sp.conn &&
    !!prevS &&
    prevS.status === "ready" &&
    !!prevS.target &&
    (sp.conn.k === "causal" || (sp.role === "extension" && sp.conn.k === "coord"));
  const prevFinal = linked && prevS ? prevS.target.replace(END_PUNCT, "") : "";
  const prevTr = linked && prevS ? prevS.tr.replace(END_PUNCT, "") : "";
  const ownTr = linked && LINK_WORD.test(sp.tr) ? trLowerFirst(sp.tr) : sp.tr;
  const tr = linked ? `${prevTr}, ${ownTr}` : sp.tr;
  const offset = linked ? 1 : 0;

  const joinLinked = (t: string): string => {
    if (!linked) return t;
    const rest = stripPrefixWords(t, prevFinal, lang);
    const own = rest === null ? t : rest;
    return own ? `${prevFinal}${m.clauseJoin}${own}` : prevFinal;
  };

  const steps: BuildStep[] = [];
  const covered: [number, number][] = [];
  if (linked && prevS) {
    const last = prevS.steps[prevS.steps.length - 1];
    covered.push([0, prevTr.length]);
    steps.push({
      question: "Önceki cümleyi söyle",
      trPiece: prevTr,
      trSoFar: prevTr,
      target: prevS.target,
      alts: [],
      translit: last?.translit ?? "",
      note: "",
      move: "linked",
      clauseEnd: true,
      trSpan: [0, prevTr.length],
    });
  }

  // --- 1. Adımlar: Türkçe parça cümlede bulunur, "şu ana kadar" türetilir.
  // Cümlede bulunamayan parça (model ek adı yazdıysa) sona eklenir: yedek.
  const missing: string[] = [];
  rawSteps.forEach((x, i) => {
    const pieces = x.p.split(/\s*(?:…|\.\.\.)\s*/).filter(Boolean);
    let span: [number, number] | null = null;
    for (const pc of pieces) {
      const s = locateTrPiece(tr, pc, covered);
      if (s) {
        covered.push(s);
        if (!span) span = s;
      } else missing.push(pc);
    }
    const last = i === rawSteps.length - 1;
    const trSoFar = last ? tr : trUpperFirst([spansText(tr, covered), ...missing].filter(Boolean).join(" "));
    const st: BuildStep = {
      question: x.q,
      trPiece: x.p,
      trSoFar,
      target: joinLinked(x.t),
      alts: [],
      translit: "",
      note: x.n,
      trSpan: span,
    };
    if (x.e) st.clauseEnd = true;
    steps.push(st);
  });

  // --- 4. Bağlaç kartı.
  const connSeen = stores.connSeen ?? {};
  let connector: ConnectorCard | null = null;
  if (sp.conn && sp.conn.k !== "none") {
    const info = m.connectors[sp.conn.tr] ?? findConnector(lang, sp.conn.t) ?? undefined;
    const trapId = info?.trapId;
    const ck = blockKey(sp.conn.t, lang);
    const seenBefore = (connSeen[ck] ?? 0) > 0 || built.slice(0, k).some((b) => b.connector && blockKey(b.connector.target, lang) === ck);
    const trap = trapId ? trapById(lang, trapId) : undefined;
    const total = Object.values(connSeen).reduce((a, b) => a + (Number(b) || 0), 0);
    connector = {
      kind: sp.conn.k,
      tr: sp.conn.tr,
      target: sp.conn.t,
      part1: sp.conn.p1 ?? "",
      part2: sp.conn.p2 ?? "",
      contrast: seenBefore ? "" : trap ? trap.text : str(r.cc),
      learnerSplit: total >= 2,
    };
    if (trapId) connector.trapId = trapId;
  }

  // --- 5. Taşlar (en fazla 6) ve markRecycled.
  const rawBlocks: RawBlock[] = [];
  const seenKeys = new Set<string>();
  for (const x of arr(r.blocks).map(obj)) {
    const t = str(x.t ?? x.target);
    const btr = str(x.tr);
    if (!t || !btr) continue;
    const key = blockKey(t, lang);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const s = typeof x.s === "number" && Number.isInteger(x.s) && x.s >= 0 && x.s < rawSteps.length ? x.s : null;
    const b: RawBlock = {
      t,
      tr: btr,
      k: str(x.k ?? x.kind),
      s,
      n: str(x.n ?? x.note),
      c: str(x.c ?? x.contrast),
      a: arr(x.a ?? x.alts).map(str).filter(Boolean).slice(0, 2),
    };
    const pair = pairOf(x.pair);
    const tx = pairOf(x.x ?? x.transfer);
    if (pair) b.pair = pair;
    if (tx) b.x = tx;
    rawBlocks.push(b);
    if (rawBlocks.length >= 6) break;
  }

  const connToks = connector ? canonicalTokens(connector.target, lang) : [];
  const connBlockToks = rawBlocks.filter((b) => b.k === "connector").map((b) => canonicalTokens(b.t, lang));
  enrichSteps(steps, lang, [connToks, ...connBlockToks], [...methodChunkToks(lang), ...rawBlocks.filter((b) => b.k === "chunk").map((b) => canonicalTokens(b.t, lang))]);

  const stepAdded = steps.map((st, i) => addedTokens(i > 0 ? steps[i - 1].target : "", st.target, lang));
  const shownTraps = new Set(stores.shownTrapIds ?? []);
  for (const b of built.slice(0, k)) {
    if (b.connector?.trapId && b.connector.contrast) shownTraps.add(b.connector.trapId);
    for (const bl of b.blocks) if (bl.contrast && bl.trapIds?.length) bl.trapIds.forEach((id) => shownTraps.add(id));
  }
  if (connector?.trapId && connector.contrast) shownTraps.add(connector.trapId);

  const earlierBlock = (key: string): BuildBlock["recycled"] | undefined => {
    for (let j = 0; j < Math.min(k, built.length); j += 1) {
      const hit = built[j].blocks.find((b) => b.key === key);
      if (hit) return hit.recycled ?? { fromSentence: j, firstNote: hit.note, firstContrast: hit.contrast };
    }
    const kb = stores.blocks?.[key];
    if (kb) return { fromSentence: -1, firstNote: kb.note ?? "", firstContrast: kb.contrast ?? "" };
    return undefined;
  };

  const blocks: BuildBlock[] = rawBlocks.map((b) => {
    const key = blockKey(b.t, lang);
    const toks = canonicalTokens(b.t, lang);
    const kind: BlockKind = (BLOCK_KINDS as string[]).includes(b.k) ? (b.k as BlockKind) : "lexical";
    const isConn = kind === "connector" || (!!connector && key === blockKey(connector.target, lang));
    let step: number;
    if (isConn) step = -1;
    else if (b.s !== null) step = b.s + offset;
    else {
      step = stepAdded.findIndex((add, i) => i >= offset && toks.every((t) => add.includes(t)));
      if (step < 0) step = steps.findIndex((st, i) => i >= offset && blockKey(st.target, lang).includes(key));
      if (step < 0) step = steps.length - 1;
    }
    const trapIds = trapIdsFor(toks, lang);
    let contrast = b.c;
    // Kayıtlı tuzağın metni koddan gelir; model yazmaz. İlk seferde gösterilir.
    if (!contrast && !isConn) {
      const fresh = trapIds.find((id) => !shownTraps.has(id));
      const trap = fresh ? trapById(lang, fresh) : undefined;
      if (trap) {
        contrast = trap.text;
        shownTraps.add(trap.id);
      }
    }
    const out: BuildBlock = { target: b.t, tr: b.tr, note: b.n, contrast, alts: b.a, kind, step, key };
    if (trapIds.length) out.trapIds = trapIds;
    if (b.pair) out.pair = b.pair;
    if (b.x) out.transfer = b.x;
    const rec = earlierBlock(key);
    if (rec) {
      // Geri gelen taş yeniden ÖĞRETİLMEZ: not, karşıtlık ve alternatif gizlenir;
      // ilk hâli yalnız bir yanlıştan sonra gösterilmek üzere saklanır.
      out.recycled = rec;
      out.note = "";
      out.contrast = "";
      out.alts = [];
    }
    return out;
  });

  steps.forEach((st, i) => {
    const ids = blocks.filter((b) => b.step === i && !b.recycled).map((b) => b.key);
    if (ids.length) st.blockIds = ids;
  });

  const finalT = steps.length ? steps[steps.length - 1].target : "";

  // --- 6. Sıralama: yalnız yan cümle bağlacında ve yalnız aynı kelimelerle.
  let reorder = str(r.reorder);
  const isSub = connector?.kind === "sub";
  if (!isSub) reorder = "";
  if (isSub && !reorder && m.autoReorder) reorder = autoReorderOf(steps, finalT, lang);
  if (reorder && !isPermutation(reorder, finalT, lang)) reorder = "";
  const firstTok = canonicalTokens(steps[offset]?.target ?? "", lang)[0] ?? "";
  if (LEGACY_NO_REORDER.has(firstTok) || /^(çünkü|ama)(\s|,|$)/.test(trLower(sp.tr))) reorder = "";

  // --- 7. Swap'lar: taş alternatifleri (geri gelen taşınki de: kabul sürer), sw, günlük dil.
  const swRaw = arr(r.sw)
    .filter((x): x is string[] => Array.isArray(x) && x.length >= 2 && x.every((y) => typeof y === "string"))
    .map((x) => x.slice(0, 3) as [string, string] | [string, string, string]);
  let swaps = deriveSwaps(
    finalT,
    { blocks: rawBlocks.map((b) => ({ target: b.t, alts: b.a })), sw: swRaw, dialect: !!stores.acceptDialect },
    lang
  );
  // Bağlantılı cümlede önceki cümlenin eşdeğerleri de geçerli (boş yer kaldıkça).
  if (linked && prevS) {
    const have = new Set(swaps.map((s) => `${s.from.join(" ")}→${s.to.join(" ")}`));
    for (const s of prevS.swaps) {
      if (swaps.length >= 3) break;
      const k2 = `${s.from.join(" ")}→${s.to.join(" ")}`;
      if (!have.has(k2)) swaps = [...swaps, s];
    }
  }

  // --- 8. Okunuş: son hâlin kelime kelime okunuşu (tw) + adıma özel tx.
  let translitWords: string[] = [];
  let reorderTranslit = "";
  if (nonLatin) {
    const tw = arr(r.tw).map(str);
    const map = new Map<string, string>();
    if (linked && prevS && prevS.translitWords.length) {
      const pw = words(prevS.target);
      if (pw.length === prevS.translitWords.length) pw.forEach((w, i) => map.set(bare(w), prevS.translitWords[i]));
    }
    const lastRaw = rawSteps.length ? rawSteps[rawSteps.length - 1].t : "";
    const ownFinal = linked ? stripPrefixWords(lastRaw, prevFinal, lang) ?? lastRaw : lastRaw;
    let ownWords: string[] = [];
    if (tw.length && tw.every(Boolean)) {
      if (tw.length === words(ownFinal).length) ownWords = words(ownFinal);
      else if (tw.length === words(lastRaw).length) ownWords = words(lastRaw);
    }
    ownWords.forEach((w, i) => map.set(bare(w), tw[i]));
    if (ownWords.length) {
      translitWords = linked && prevS ? [...(prevS.translitWords.length === words(prevFinal).length ? prevS.translitWords : []), ...tw] : tw;
      if (linked && translitWords.length !== words(finalT).length) translitWords = [];
    }
    rawSteps.forEach((x, i) => {
      const st = steps[i + offset];
      if (x.tx) st.translit = x.tx;
      else if (map.size) st.translit = words(st.target).map((w) => map.get(bare(w)) ?? "…").join(" ");
    });
    const rtl = str(r.rtl);
    if (rtl) reorderTranslit = rtl;
    else if (reorder && map.size) {
      const parts = words(reorder).map((w) => map.get(bare(w)));
      reorderTranslit = parts.every((x) => x !== undefined) ? parts.join(" ") : "";
    }
  }

  // --- 9. Geri çağırma soruları (cümlede en fazla 2, sette en fazla 3).
  const rets: Retrieval[] = [];
  const setCount = built.slice(0, k).reduce((a, b) => a + b.retrievals.length, 0);
  const cap = Math.min(2, Math.max(0, 3 - setCount));
  const sysIdx = plan.sentences.findIndex((s) => !!s.sys);
  if (sysIdx >= 0 && sysIdx < k) {
    const lesson = systemById(lang, plan.sentences[sysIdx].sys!);
    if (lesson?.retrieval) {
      const i = steps.findIndex((st, j) => j >= offset && lesson.trigger.test(canonicalTokens(st.target, lang).join(" ")));
      if (i >= 0) {
        rets.push({
          step: i,
          q: lesson.retrieval.q,
          options: lesson.retrieval.options,
          answer: lesson.retrieval.pick(finalT),
          why: lesson.retrieval.why(finalT),
          src: "system",
          refKey: lesson.id,
        });
      }
    }
  }
  const askedTraps = new Set<string>();
  for (const b of blocks) {
    if (!b.recycled || b.step < 0) continue;
    for (const id of b.trapIds ?? []) {
      const trap = trapById(lang, id);
      if (!trap?.pair || askedTraps.has(id)) continue;
      askedTraps.add(id);
      const flip = hashNum(`${b.key}|${id}`) % 2 === 1;
      const options: [string, string] = flip ? [trap.pair[1], trap.pair[0]] : [trap.pair[0], trap.pair[1]];
      rets.push({
        step: b.step,
        q: `${options[0]} ${questionParticle(options[0])} ${options[1]} ${questionParticle(options[1])}?`,
        options,
        answer: flip ? 1 : 0,
        why: trap.text,
        src: "trap",
        refKey: id,
      });
    }
  }
  const ret = obj(r.ret);
  const o = arr(ret.o).map(str);
  const rs = ret.s;
  const ra = ret.a;
  if (
    typeof rs === "number" &&
    Number.isInteger(rs) &&
    rs >= 0 &&
    rs < rawSteps.length &&
    str(ret.q) &&
    o.length === 2 &&
    o.every(Boolean) &&
    (ra === 0 || ra === 1)
  ) {
    rets.push({ step: rs + offset, q: str(ret.q), options: [o[0], o[1]], answer: ra, why: str(ret.w), src: "model" });
  }
  const retrievals = rets.slice(0, cap).sort((a, b) => a.step - b.step);

  // --- 10. Sistem dersi: gerektiren adımdan önce.
  let systemLesson: BuildSentence["systemLesson"];
  if (sp.sys) {
    const lesson = systemById(lang, sp.sys);
    if (lesson) {
      const sd = r.sd;
      let step = typeof sd === "number" && Number.isInteger(sd) && sd >= 0 && sd < rawSteps.length ? sd + offset : -1;
      if (step < 0) step = steps.findIndex((st, j) => j >= offset && lesson.trigger.test(canonicalTokens(st.target, lang).join(" ")));
      if (step < 0) step = Math.max(0, steps.length - 1);
      systemLesson = { id: lesson.id, step };
    }
  }

  // --- 11. Bayraklar.
  const b = bandIndex(stores.band);
  const tryFirst =
    sp.role === "synthesis" ||
    b >= bandIndex("B2") ||
    (stores.band === "B1" && sp.role === "extension") ||
    ["proving", "verify", "mastered"].includes(stores.patternStatus ?? "") ||
    !!stores.review;

  const knownKeys = new Set<string>([...built.slice(0, k).flatMap((s) => s.blocks.map((x) => x.key)), ...Object.keys(stores.blocks ?? {})]);
  const recallKeys: string[] = [];
  const addRecall = (x: string) => {
    if (x && !recallKeys.includes(x)) recallKeys.push(x);
  };
  for (const rc of sp.rec) {
    const rk = blockKey(rc, lang);
    if (!rk) continue;
    if (knownKeys.has(rk)) addRecall(rk);
    else {
      const rt = rk.split(" ");
      const hit = [...knownKeys].find((kk) => {
        const kt = kk.split(" ");
        return rt.every((t) => kt.includes(t)) || kt.every((t) => rt.includes(t));
      });
      if (hit) addRecall(hit);
    }
  }
  for (const bl of blocks) if (bl.recycled) addRecall(bl.key);

  // --- 12. Yeniden deneme kuralı: 2'den az adım → KISA MOD (sentez tek adımla kalabilir).
  const usable = !!sp.tr && (steps.length >= 2 || (steps.length === 1 && tryFirst && sp.role === "synthesis"));

  const out: BuildSentence = {
    tr,
    steps,
    blocks,
    reorder,
    role: sp.role,
    connector,
    linkPrev: linked,
    usesFocus: sp.focus,
    focusIsNew: sp.focusNew,
    recallKeys,
    target: finalT,
    key: blockKey(finalT, lang),
    translitWords,
    reorderTranslit,
    swaps,
    retrievals,
    tryFirst,
    status: usable ? "ready" : "failed",
  };
  if (systemLesson) out.systemLesson = systemLesson;
  return out;
}

/** Plan hazır, cümle henüz üretilmedi (ya da üretilemedi): yer tutucu. */
export function placeholderSentence(sp: SentencePlan, status: "pending" | "failed" = "pending"): BuildSentence {
  return {
    tr: sp.tr,
    steps: [],
    blocks: [],
    reorder: "",
    role: sp.role,
    connector: null,
    linkPrev: false,
    usesFocus: sp.focus,
    focusIsNew: sp.focusNew,
    recallKeys: [],
    target: "",
    key: "",
    translitWords: [],
    reorderTranslit: "",
    swaps: [],
    retrievals: [],
    tryFirst: sp.role === "synthesis",
    status,
  };
}

// ---------------------------------------------------------------------------
// Solma (fadeSteps) ve kart sırası (compileSentence)
// ---------------------------------------------------------------------------

/**
 * Hocanın 1. cümlesi ile 8. cümlesi arasındaki fark: öğrenilen parça artık
 * ayrı bir adım olmaz. A1–A2 bütün adımlar; B1+ eklediği kelimelerin HEPSİ
 * oturmuş taşlara ait olan adım atlanır. Son adım, kısım biten adım ve
 * bağlantılı tekrar hiç atlanmaz. Dönen: gösterilecek adımların sırası.
 */
export function fadeSteps(
  s: BuildSentence,
  band: Band,
  lang: LanguageId,
  mastered: Iterable<string> = []
): number[] {
  const all = s.steps.map((_, i) => i);
  if (bandIndex(band) < bandIndex("B1")) return all;
  const mTok = new Set([...mastered].flatMap((k) => k.split(" ").filter(Boolean)));
  if (!mTok.size) return all;
  return all.filter((i) => {
    const st = s.steps[i];
    if (i === s.steps.length - 1 || st.clauseEnd || st.move === "linked") return true;
    const add = addedTokens(i > 0 ? s.steps[i - 1].target : "", st.target, lang);
    if (!add.length) return true;
    return !add.every((t) => mTok.has(t));
  });
}

export interface CompileCtx {
  /** Varsayılan: setin seviyesi. */
  band?: Band;
  /** Oturmuş taşların anahtarları (solma için). */
  masteredBlocks?: Iterable<string>;
  /** Güncel BuildUi.connSeen: öğrencinin kendisinin bölmesi buna göre. */
  connSeen?: Record<string, number>;
  /** Öğrencinin şimdiye kadar yaptığı sıralama adımı sayısı. */
  reorderSeen?: number;
  /** Tekrar oturumu: tek seferde başla. */
  review?: boolean;
  /** Aktarım/eş kartı gösterilsin mi (varsayılan evet). */
  practice?: boolean;
}

/**
 * Bir cümlenin kart sırası (tasarım §3). Sıra: oku → öğrendik → bağlaç →
 * (tek seferde → hocanın kuruşu) → adımlar (sistem dersi ve geri çağırma
 * sorusu gerektiren adımdan ÖNCE, sistemin (d) kısmı sonra) → sıralama →
 * aktarım/eş → özet.
 *
 * Denetleyici için sözleşme: tek seferde doğruysa "kurus" kartına geçilir
 * ve adım kartları atlanır; yanlışsa "kurus" atlanır, adımlar açılır.
 */
export function compileSentence(set: BuildSet, si: number, ctx: CompileCtx = {}): Card[] {
  const s = set.sentences[si];
  if (!s || s.status !== "ready") return [];
  const band = ctx.band ?? set.level;
  const cards: Card[] = [{ t: "read" }];
  if (s.recallKeys.length) cards.push({ t: "recall", keys: s.recallKeys });
  if (s.connector && s.connector.kind !== "none") {
    const card = { ...s.connector };
    if (ctx.connSeen) card.learnerSplit = Object.values(ctx.connSeen).reduce((a, b) => a + (Number(b) || 0), 0) >= 2;
    cards.push({ t: "connector", card });
  }
  const tryFirst =
    s.tryFirst || !!ctx.review || bandIndex(band) >= bandIndex("B2") || (band === "B1" && s.role === "extension");
  if (tryFirst) cards.push({ t: "oneshot" }, { t: "kurus" });

  const keep = fadeSteps(s, band, set.lang, ctx.masteredBlocks ?? []);
  let sysDone = !s.systemLesson;
  const retDone = new Set<number>();
  for (const i of keep) {
    let sysHere = false;
    if (!sysDone && s.systemLesson && s.systemLesson.step <= i) {
      cards.push({ t: "system", id: s.systemLesson.id, part: "abc" });
      sysDone = true;
      sysHere = true;
    }
    s.retrievals.forEach((r, ri) => {
      if (!retDone.has(ri) && r.step <= i) {
        cards.push({ t: "retrieval", r });
        retDone.add(ri);
      }
    });
    cards.push({ t: "step", i });
    if (sysHere && s.systemLesson) cards.push({ t: "system", id: s.systemLesson.id, part: "d" });
  }
  if (s.reorder) cards.push({ t: "reorder", first: (ctx.reorderSeen ?? 0) === 0 });
  if (ctx.practice !== false) {
    const fresh = s.blocks.filter((b) => !b.recycled);
    const tb = fresh.find((b) => b.transfer);
    const pb = fresh.find((b) => b.pair);
    if (tb) cards.push({ t: "transfer", blockKey: tb.key });
    else if (pb) cards.push({ t: "pair", blockKey: pb.key });
  }
  cards.push({ t: "recap" });
  return cards;
}

// ---------------------------------------------------------------------------
// v1 → v2 set dönüşümü (tasarım §8)
// ---------------------------------------------------------------------------

/** v1 cümlesinde yan cümle bağlacı: -madan önce, -dıktan sonra, -dığımda, -ince, -ken. */
const V1_SUB = /(m[ae]dan önce|m[ae]den önce|[dt][ıiuü]kt[ae]n sonra|[dt][ıiuü]ğ[ıiuü]m[dt][ae]|[ıiuü]nc[ae])(\s|,|\.|$)/;
const V1_SUB_KEYS: [RegExp, string][] = [
  [/m[ae]d[ae]n önce/, "-madan önce"],
  [/[dt][ıiuü]kt[ae]n sonra/, "-dıktan sonra"],
  [/[dt][ıiuü]ğ[ıiuü]m[dt][ae]/, "-dığımda"],
  [/[ıiuü]nc[ae](\s|,|\.|$)/, "-ince"],
  [/ken(\s|,|\.|$)/, "-ken"],
];

function hasKen(trl: string): boolean {
  return words(trl).some((w) => /ken[,.]?$/.test(w) && !/^(erken|diken|iken)[,.]?$/.test(w));
}

function v1ConnKind(trl: string, firstToks: string[]): ConnKind {
  const f = firstToks[0] ?? "";
  if (f === "because" || f === "لان" || trl.includes("çünkü")) return "causal";
  if (f === "but" || f === "however" || f === "لكن" || f === "ولكن" || /(^|\s)(ama|ancak)(\s|,|$)/.test(trl)) return "coord";
  if (V1_SUB.test(trl) || hasKen(trl)) return "sub";
  return "none";
}

function v1Connector(kind: ConnKind, trl: string, finalT: string, lang: LanguageId): { tr: string; target: string } {
  const m = methodFor(lang);
  const finalToks = canonicalTokens(finalT, lang);
  const containsRun = (t: string) => {
    const run = canonicalTokens(t, lang);
    return run.length > 0 && finalToks.some((_, i) => sameToks(finalToks.slice(i, i + run.length), run));
  };
  if (kind === "sub") {
    for (const [re, key] of V1_SUB_KEYS) {
      if (key === "-ken" ? hasKen(trl) : re.test(trl)) {
        const c = m.connectors[key];
        if (c) return { tr: key, target: c.target };
      }
    }
  }
  if (kind === "causal" && m.connectors["çünkü"]) return { tr: "çünkü", target: m.connectors["çünkü"].target };
  if (kind === "coord") {
    const key = /(^|\s)ancak(\s|,|$)/.test(trl) && m.connectors.ancak ? "ancak" : "ama";
    if (m.connectors[key]) return { tr: key, target: m.connectors[key].target };
  }
  for (const [tr, c] of Object.entries(m.connectors)) {
    if (c.kind === kind && containsRun(c.target)) return { tr, target: c.target };
  }
  return { tr: "", target: "" };
}

/** v1 konum kuralı: ilk açılış, son sentez, sondan bir önceki uzatma, gerisi kurma. */
function v1Role(i: number, n: number): Role {
  if (i === 0) return "open";
  if (i === n - 1) return "synthesis";
  if (i === n - 2) return "extension";
  return "build";
}

/**
 * v1 setini v2'ye çevirir; v2 seti olduğu gibi döner (iki kez çalıştırmak
 * zararsız). Eski adımlar ve alternatifleri korunur, bayraklar konumdan ve
 * Türkçeden çıkarılır; bağlaç kartında kısım adı yok, yalnız eşleme.
 */
export function upgradeSetV1(raw: unknown, lang: LanguageId = "ar"): BuildSet {
  const o = obj(raw);
  if (o.v === 2) return raw as BuildSet;
  const patternId = str(o.patternId);
  const themeId = str(o.themeId);
  const createdAt = str(o.createdAt) || new Date(0).toISOString();
  const intro = str(o.intro);
  const th = themeById(themeId);
  const tense: TenseFrame = th?.tense ?? "habit";
  const level: Band = patternById(patternId)?.band ?? "A2";

  const v1 = arr(o.sentences)
    .map(obj)
    .map((s) => ({
      tr: str(s.tr),
      reorder: str(s.reorder),
      steps: arr(s.steps)
        .map(obj)
        .map(
          (x): BuildStep => ({
            question: str(x.question),
            trPiece: str(x.trPiece),
            trSoFar: str(x.trSoFar),
            target: str(x.target),
            alts: arr(x.alts).map(str).filter(Boolean),
            translit: str(x.translit),
            note: str(x.note),
          })
        )
        .filter((x) => x.target),
      blocks: arr(s.blocks)
        .map(obj)
        .map((x) => ({
          target: str(x.target),
          tr: str(x.tr),
          note: str(x.note),
          contrast: str(x.contrast),
          alts: arr(x.alts).map(str).filter(Boolean),
        }))
        .filter((x) => x.target && x.tr),
    }))
    .filter((s) => s.tr && s.steps.length);

  const n = v1.length;
  const sentences: BuildSentence[] = [];
  const planSentences: SentencePlan[] = [];
  v1.forEach((s, i) => {
    const role = v1Role(i, n);
    const trl = trLower(s.tr);
    const finalT = s.steps[s.steps.length - 1].target;
    const kind = v1ConnKind(trl, canonicalTokens(s.steps[0].target, lang));
    const cinfo = kind === "none" ? { tr: "", target: "" } : v1Connector(kind, trl, finalT, lang);
    const connector: ConnectorCard | null =
      kind === "none"
        ? null
        : { kind, tr: cinfo.tr, target: cinfo.target, part1: "", part2: "", contrast: "", learnerSplit: false };
    if (connector) {
      const info = methodFor(lang).connectors[cinfo.tr];
      if (info?.trapId) connector.trapId = info.trapId;
    }
    const connKey = cinfo.target ? blockKey(cinfo.target, lang) : "";

    const steps: BuildStep[] = s.steps.map((st) => ({ ...st }));
    // Yan cümle: virgülden önceki kısmı bitiren adım "birinci kısmımız oldu".
    if (kind === "sub") {
      const head = finalT.split(/[,،]/)[0];
      if (head && head !== finalT) {
        const hk = blockKey(head, lang);
        const ce = steps.find((st) => blockKey(st.target, lang) === hk);
        if (ce) ce.clauseEnd = true;
      }
    }
    const covered: [number, number][] = [];
    for (const st of steps) {
      const span = st.trPiece ? locateTrPiece(s.tr, st.trPiece, covered) : null;
      if (span) covered.push(span);
      st.trSpan = span;
    }
    enrichSteps(steps, lang, connKey ? [connKey.split(" ")] : [], methodChunkToks(lang));
    const stepAdded = steps.map((st, j) => addedTokens(j > 0 ? steps[j - 1].target : "", st.target, lang));

    const blocks: BuildBlock[] = s.blocks.slice(0, 6).map((b) => {
      const key = blockKey(b.target, lang);
      const toks = canonicalTokens(b.target, lang);
      const isConn = !!connKey && key === connKey;
      let step = isConn ? -1 : stepAdded.findIndex((add) => toks.length > 0 && toks.every((t) => add.includes(t)));
      if (!isConn && step < 0) step = steps.findIndex((st) => blockKey(st.target, lang).includes(key));
      if (!isConn && step < 0) step = steps.length - 1;
      const out: BuildBlock = {
        target: b.target,
        tr: b.tr,
        note: b.note,
        contrast: b.contrast,
        alts: b.alts.slice(0, 2),
        kind: isConn ? "connector" : "lexical",
        step,
        key,
      };
      const trapIds = trapIdsFor(toks, lang);
      if (trapIds.length) out.trapIds = trapIds;
      for (let j = 0; j < sentences.length; j += 1) {
        const hit = sentences[j].blocks.find((x) => x.key === key);
        if (hit) {
          out.recycled = hit.recycled ?? { fromSentence: j, firstNote: hit.note, firstContrast: hit.contrast };
          out.note = "";
          out.contrast = "";
          out.alts = [];
          break;
        }
      }
      return out;
    });

    let reorder = kind === "sub" ? s.reorder : "";
    if (reorder && !isPermutation(reorder, finalT, lang)) reorder = "";

    const swaps = deriveSwaps(
      finalT,
      { blocks: s.blocks.map((b) => ({ target: b.target, alts: b.alts })), stepAlts: s.steps.map((st) => ({ target: st.target, alts: st.alts })) },
      lang
    );

    const sentence: BuildSentence = {
      tr: s.tr,
      steps,
      blocks,
      reorder,
      role,
      connector,
      linkPrev: false,
      usesFocus: role !== "synthesis",
      focusIsNew: i === 0,
      recallKeys: blocks.filter((b) => b.recycled).map((b) => b.key),
      target: finalT,
      key: blockKey(finalT, lang),
      translitWords: [],
      reorderTranslit: "",
      swaps,
      retrievals: [],
      tryFirst: role === "synthesis",
      status: "ready",
    };
    sentences.push(sentence);
    const ps: SentencePlan = {
      tr: s.tr,
      role,
      new: blocks.filter((b) => !b.recycled).map((b) => b.target),
      rec: blocks.filter((b) => b.recycled).map((b) => b.target),
      focus: sentence.usesFocus,
      focusNew: sentence.focusIsNew,
    };
    if (connector && cinfo.target) ps.conn = { k: kind, tr: cinfo.tr, t: cinfo.target };
    planSentences.push(ps);
  });

  return {
    v: 2,
    id: `${createdAt}-${patternId}`,
    patternId,
    themeId,
    lang,
    level,
    tense,
    episode: 1,
    intro,
    plan: { intro, ozet: intro, tense, sentences: planSentences },
    sentences,
    createdAt,
    origin: "v1",
  };
}
