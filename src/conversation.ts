/**
 * KONUŞMA ODASI — saf mantık.
 *
 * Uygulamanın ders ekranı bir mesajlaşma bileşeniydi: metin kutusu, gönder
 * oku, balonlar. Mikrofon o kutunun yanına eklenmiş bir düğmeydi; ses,
 * sohbetin üstüne yapıştırılmıştı, sohbet sesin üstüne kurulmamıştı.
 * Kullanıcının hissi de tam buydu: "öğreticilik var ama konuşma havası yok."
 *
 * Konuşma hissi üç şeyden gelir ve üçü de burada tarif ediliyor:
 * 1. SES ÖNCE — hoca akış hâlinde CÜMLE CÜMLE seslenir; ilk cümle gelir
 *    gelmez konuşmaya başlar, cevabın tamamını beklemez (takeSentences).
 * 2. KISA SIRALAR — hoca 1-3 cümle konuşup sırayı bırakır; her sıra bir
 *    soruyla ya da açık bir davetle biter (conversationRules).
 * 3. ROL İÇİNDE KALMAK, DÜZELTMEYİ SONRAYA BIRAKMAK — sahnede hoca
 *    karakterden çıkmaz ve düzeltmez; düzeltme sahne bitince tek parça
 *    "değerlendirme" olarak gelir (SCENARIOS, normalizeDebrief). Konuşma
 *    sırasında düzeltilen öğrenci konuşmayı bırakıp dinlemeye geçer.
 *
 * Bu dosya cihaz modülü kullanmaz; saf node testinde koşar.
 */

// ---------------------------------------------------------------------------
// Akıştan cümle ayıklama
// ---------------------------------------------------------------------------

/** Cümle sonu sayılan işaretler: latin, Arapça soru işareti, üç nokta, satır sonu. */
const SENTENCE_END = /[.!?؟…\n]+["'»)]?\s*/g;

/** Bu kadar kısa parçalar cümle sayılmaz — "1." ya da "Dr." gibi kesintiler. */
const MIN_SENTENCE_CHARS = 3;

export interface SentenceSplit {
  /** Tamamlanmış cümleler (kırpılmış, boş olmayan). */
  sentences: string[];
  /** Henüz bitmemiş kuyruk — bir sonraki parçayla birleştirilir. */
  rest: string;
}

/**
 * Akış tamponundan TAMAMLANMIŞ cümleleri alır, bitmemiş kuyruğu geri verir.
 *
 * Neden var: TTS'e cevabın tamamını vermek, ilk sesi cevabın sonuna kadar
 * bekletir ve konuşma hissini öldürür. Cümle cümle vermek ilk sesi ilk
 * cümleye çeker. Kuyruk bir sonraki delta ile birleşip tekrar denenir.
 */
export function takeSentences(buffer: string): SentenceSplit {
  const sentences: string[] = [];
  let last = 0;
  SENTENCE_END.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SENTENCE_END.exec(buffer)) !== null) {
    const end = m.index + m[0].length;
    const piece = buffer.slice(last, end).trim();
    // Kısa kesintiler ("1.", "Dr.") bir sonraki parçaya yapışsın diye
    // ilerletilmez: last aynı kalır, döngü bir sonraki sonda tekrar dener.
    if (piece.replace(/[.!?؟…\s"'»)]/g, "").length >= MIN_SENTENCE_CHARS) {
      sentences.push(piece);
      last = end;
    }
  }
  return { sentences, rest: buffer.slice(last) };
}

// ---------------------------------------------------------------------------
// Rol sahneleri
// ---------------------------------------------------------------------------

export type LevelBand = "A1" | "A2" | "B1" | "B2" | "C1";

export interface Scenario {
  id: string;
  /** Kısa Türkçe başlık (kartta görünür). */
  title: string;
  emoji: string;
  /** Hocanın oynayacağı kişi — Türkçe tarif; model bunu hedef dilde canlandırır. */
  persona: string;
  /** Sahnenin açılış durumu — Türkçe; öğrenci ne yapmaya çalışıyor. */
  situation: string;
  /** Öğrencinin bu sahnede varması gereken hedef (değerlendirmede ölçülür). */
  goal: string;
  /** En düşük uygun seviye. */
  minLevel: LevelBand;
}

/**
 * Sahneler dil-bağımsız: "kafede sipariş" her dilde kafede sipariştir.
 * Dilin kendi rengi (fusha kayıt, Farsça taarof, Almanca Sie/du) paketin
 * kişiliğinden ve rolePartner'dan gelir, buradan değil.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: "kafe",
    title: "Kafede sipariş",
    emoji: "☕",
    persona: "Kafede çalışan, işi başından aşkın ama güler yüzlü bir garson.",
    situation: "Öğrenci kafeye girdi, bir şeyler içmek ve küçük bir şey yemek istiyor.",
    goal: "İçecek ve yiyecek sipariş etmek, fiyatı sormak, hesabı istemek.",
    minLevel: "A1",
  },
  {
    id: "taksi",
    title: "Taksi",
    emoji: "🚕",
    persona: "Konuşkan bir taksi şoförü; yol sorar, havadan sudan konuşur.",
    situation: "Öğrenci taksiye bindi, bir adrese gitmesi gerekiyor ve acelesi var.",
    goal: "Adresi söylemek, süreyi ve ücreti sormak, kısa sohbeti sürdürmek.",
    minLevel: "A1",
  },
  {
    id: "yol",
    title: "Yol sorma",
    emoji: "🗺️",
    persona: "Sokakta durdurulan, yardımsever ama biraz aceleci bir yoldan geçen.",
    situation: "Öğrenci kayboldu; tren istasyonunu arıyor ve telefonu bitmiş.",
    goal: "Yol tarifi istemek, anlamadığında tekrar ettirmek, teşekkür etmek.",
    minLevel: "A1",
  },
  {
    id: "pazar",
    title: "Pazarda alışveriş",
    emoji: "🧺",
    persona: "Pazarcı; malını över, pazarlığa açık ama kolay pes etmez.",
    situation: "Öğrenci meyve ve sebze alacak, bütçesi kısıtlı.",
    goal: "Fiyat sormak, miktar söylemek, pazarlık etmek, ödemek.",
    minLevel: "A2",
  },
  {
    id: "otel",
    title: "Otelde giriş",
    emoji: "🏨",
    persona: "Otel resepsiyonisti; resmî ve kibar, rezervasyonda bir sorun var.",
    situation: "Öğrenci otele geldi; rezervasyonu sistemde görünmüyor.",
    goal: "Durumu anlatmak, çözüm istemek, oda özelliklerini sormak.",
    minLevel: "A2",
  },
  {
    id: "doktor",
    title: "Doktorda",
    emoji: "🩺",
    persona: "Sakin, soru soran bir aile hekimi.",
    situation: "Öğrencinin iki gündür başı ağrıyor ve ateşi var.",
    goal: "Şikâyeti anlatmak, doktorun sorularına cevap vermek, ilacı nasıl alacağını sormak.",
    minLevel: "A2",
  },
  {
    id: "komsu",
    title: "Yeni komşu",
    emoji: "🏠",
    persona: "Merdivende karşılaşılan, meraklı ve sıcak bir komşu.",
    situation: "Öğrenci binaya yeni taşındı; komşusuyla ilk kez karşılaşıyor.",
    goal: "Kendini tanıtmak, nereden geldiğini anlatmak, mahalle hakkında soru sormak.",
    minLevel: "A2",
  },
  {
    id: "telefon",
    title: "Telefonda randevu",
    emoji: "📞",
    persona: "Bir kliniğin sekreteri; hızlı konuşur, bilgileri tek tek ister.",
    situation: "Öğrenci telefonla randevu almak istiyor; uygun saat bulmak zor.",
    goal: "Randevu istemek, tarih ve saat pazarlığı yapmak, bilgilerini hecelemek.",
    minLevel: "B1",
  },
  {
    id: "is",
    title: "İş görüşmesi",
    emoji: "💼",
    persona: "Nazik ama titiz bir işe alım yöneticisi; somut örnek ister.",
    situation: "Öğrenci kendi alanında bir işe başvurdu; ilk görüşme.",
    goal: "Kendini ve deneyimini anlatmak, güçlü yönünü örneklemek, soru sormak.",
    minLevel: "B1",
  },
  {
    id: "sikayet",
    title: "Şikâyet",
    emoji: "📦",
    persona: "Müşteri hizmetleri görevlisi; kibar ama prosedürden şaşmaz.",
    situation: "Öğrencinin sipariş ettiği ürün bozuk geldi; iade istiyor.",
    goal: "Sorunu anlatmak, ısrar etmek, çözüm önerisini değerlendirmek.",
    minLevel: "B1",
  },
  {
    id: "tartisma",
    title: "Fikir tartışması",
    emoji: "💬",
    persona: "Öğrencinin görüşüne katılmayan, saygılı ama ısrarcı bir arkadaş.",
    situation: "Bir kafede güncel bir konu üzerine görüş ayrılığı çıktı.",
    goal: "Görüş savunmak, karşı görüşe cevap vermek, örnek vermek, uzlaşmak.",
    minLevel: "B2",
  },
  {
    id: "sunum",
    title: "Sunum sonrası sorular",
    emoji: "🎤",
    persona: "Sunumu dinlemiş, zor sorular soran bir uzman dinleyici.",
    situation: "Öğrenci kısa bir sunum yaptı; soru-cevap bölümündeyiz.",
    goal: "Soruyu anlamak, açıklık istemek, gerekçeli cevap vermek.",
    minLevel: "B2",
  },
];

const BAND_ORDER: LevelBand[] = ["A1", "A2", "B1", "B2", "C1"];

/** "A0" → A1, "B1+" → B1, bilinmeyen → A1. */
export function toBand(level: string | undefined): LevelBand {
  const l = (level ?? "").toUpperCase().slice(0, 2);
  if (l === "A0") return "A1";
  if (l === "C2") return "C1";
  return (BAND_ORDER as string[]).includes(l) ? (l as LevelBand) : "A1";
}

/**
 * Seviyeye uygun sahneler: öğrencinin bandı ve bir alt band (ısınma için).
 * Üst bandlar gösterilmez — A1 öğrencisine iş görüşmesi sunmak, konuşmaya
 * cesaretlendirmek değil, korkutmaktır.
 */
export function scenariosFor(level: string | undefined): Scenario[] {
  const band = toBand(level);
  const idx = BAND_ORDER.indexOf(band);
  return SCENARIOS.filter((s) => BAND_ORDER.indexOf(s.minLevel) <= idx);
}

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Konuşma kuralları (prompt parçaları)
// ---------------------------------------------------------------------------

/**
 * Seviyeye göre Türkçe politikası. Konuşma odasında ölçü ders ekranından
 * farklı: burada amaç anlatmak değil KONUŞTURMAK. A1'de bile hedef dil
 * omurga, Türkçe yalnız kurtarma.
 */
export function turkishPolicy(level: string | undefined): string {
  switch (toBand(level)) {
    case "A1":
      return "Hedef dilde ÇOK KISA ve basit konuş (3-6 kelimelik cümleler). Öğrenci takılırsa aynı cümleyi daha yavaş ve daha basit tekrar et; yine olmazsa TEK cümlelik Türkçe ipucu verip hemen hedef dile dön.";
    case "A2":
      return "Hedef dilde konuş; kısa cümleler. Türkçeyi yalnız öğrenci 'anlamadım' dediğinde ve tek cümleyle kullan.";
    case "B1":
      return "Yalnız hedef dilde konuş. Öğrenci anlamadığında Türkçeye geçme; aynı şeyi hedef dilde başka kelimelerle söyle.";
    default:
      return "Yalnız hedef dilde konuş; doğal hız ve doğal kelime dağarcığı. Türkçe hiç kullanma.";
  }
}

/** Her konuşma turunda geçerli, seviyeden bağımsız kurallar. */
export function conversationRules(): string {
  return [
    "- SIRA KISA: her cevabın EN FAZLA 1-3 cümle. Paragraf yazma. Konuşma yükü öğrencide olsun.",
    "- SIRAYI BIRAK: her cevabın bir soruyla ya da açık bir davetle bitsin; öğrencinin söyleyeceği bir şey kalsın.",
    "- SESLİ ORTAM: metin yok, öğrenci seni DUYUYOR. Madde işareti, başlık, parantez içi açıklama, okunuş (transliterasyon), emoji KULLANMA — hepsi sesli okunur ve konuşmayı bozar.",
    "- DOĞAL: doldurucu ve tepki sözcükleri kullan (hedef dilde 'hmm', 'evet evet', 'ha, anladım' karşılıkları). Kitap gibi değil, insan gibi.",
    "- ANLAMADIYSAN SOR: öğrencinin sesli mesajı tanıma gürültüsü yüzünden bozuk gelebilir; anlamadığında gerçek bir muhatap gibi 'pardon, ne dedin?' de.",
  ].join("\n");
}

/** Sahne turu için: hoca karakterdedir, düzeltmez. */
export function sceneRules(s: Scenario): string {
  return [
    `SEN ŞU KİŞİSİN: ${s.persona}`,
    `DURUM: ${s.situation}`,
    `Öğrencinin hedefi: ${s.goal}`,
    "- KARAKTERDEN ÇIKMA. Sen hoca değilsin, o kişisin. 'Hoca olarak' hiçbir şey söyleme.",
    "- DÜZELTME YAPMA. Hata duyduğunda gerçek bir muhatap gibi davran: anladıysan devam et, anlamadıysan sor. Düzeltmeler sahne bitince ayrıca yapılacak.",
    "- Öğrenci Türkçe konuşursa karakter olarak anlamamış gibi yap ('pardon?') ve hedef dilde devam et.",
    "- Sahneyi öğrenci hedefine ulaşınca ya da doğal olarak bitince kapat: son cümlende sahnenin bittiğini hissettir (vedalaş, hesabı kapat, randevuyu onayla).",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Değerlendirme (sahne sonrası)
// ---------------------------------------------------------------------------

export interface DebriefCorrection {
  /** Öğrencinin söylediği (olduğu gibi). */
  said: string;
  /** Doğal / doğru hâli. */
  better: string;
  /** Tek cümlelik Türkçe gerekçe. */
  why: string;
}

export interface DebriefPhrase {
  target: string;
  translit: string;
  tr: string;
}

export interface Debrief {
  /** 2-3 cümlelik Türkçe genel değerlendirme: hedefe ulaştı mı, nasıl geçti. */
  summary: string;
  /** Hedefe ulaşıldı mı (sahne varsa). */
  goalReached: boolean | null;
  corrections: DebriefCorrection[];
  /** İyi yaptığı 1-3 şey — pekiştirme, süs değil. */
  keep: string[];
  /** Bir dahaki sefere hazır olsun diye 2-4 kalıp. */
  phrases: DebriefPhrase[];
}

/** Model çıktısını güvenli biçime toparlar — eksik alan çökertmez, uydurma alan sızmaz. */
export function normalizeDebrief(raw: unknown): Debrief {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const corrections: DebriefCorrection[] = arr(r.corrections)
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { said: str(o.said), better: str(o.better), why: str(o.why) };
    })
    .filter((c) => c.said && c.better)
    .slice(0, 8);
  const phrases: DebriefPhrase[] = arr(r.phrases)
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return { target: str(o.target), translit: str(o.translit), tr: str(o.tr) };
    })
    .filter((p) => p.target && p.tr)
    .slice(0, 6);
  const keep = arr(r.keep).map(str).filter(Boolean).slice(0, 4);
  const goal = r.goalReached;
  return {
    summary: str(r.summary),
    goalReached: typeof goal === "boolean" ? goal : null,
    corrections,
    keep,
    phrases,
  };
}

/**
 * Değerlendirmeye giden transkript: yalnız sahne konuşması, uygulama
 * bildirimleri ve "[sesli]" işaretleri temizlenmiş. Modelin görmesi gereken
 * şey konuşmanın kendisi.
 */
export function transcriptForDebrief(
  turns: { role: "user" | "assistant"; content: string }[]
): string {
  return turns
    .filter((t) => !t.content.trimStart().startsWith("[Uygulama bildirimi:"))
    .map((t) => {
      const text = t.content.replace(/^\s*\[sesli\]\s*/i, "").trim();
      return `${t.role === "user" ? "ÖĞRENCİ" : "MUHATAP"}: ${text}`;
    })
    .join("\n");
}

/** Sahne süresi ve tur sayısı — panel ve istatistik için. */
export interface ConversationSummary {
  studentTurns: number;
  seconds: number;
}
