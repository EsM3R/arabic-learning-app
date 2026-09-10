/**
 * Dil paketi mimarisi: motor (agentic döngü, araçlar, SRS, hafıza, ekranlar)
 * dilden bağımsızdır; dile özgü her şey — hoca kişiliği, parkur tanımları,
 * telaffuz odakları, ses kodu — bu paketlerden gelir.
 */

export type LanguageId = "ar" | "en" | "es";

export interface TrackMeta {
  title: string;
  subtitle: string;
  icon: string;
  /** Kısa etiket: ders başlığı ve kelime kartı rozeti ("Sözlü", "Yazılı"...) */
  short: string;
}

export interface LanguagePack {
  id: LanguageId;
  label: string;
  flag: string;
  /** Hero'daki selamlama ("مرحبا", "Hello!", "¡Hola!") */
  greeting: string;
  teacherName: string;
  avatarLetter: string;
  ttsLocale: string;
  /** true → hedef dil ayrı alfabede; sohbet metninden ayıklanıp seslendirilebilir (Arapça). */
  scriptExtract: boolean;
  /** Hoca kişiliği ve öğrencinin iki hedefi (BASE promptunun ilk paragrafı). */
  persona: string;
  /** İçerik gösterim kuralı (yazı sistemi / telaffuz ipucu / varyant notları). */
  contentFormat: string;
  tracks: { konusma: TrackMeta; okuma: TrackMeta };
  /** Konuşma dersinde hocanın gireceği rol ("eğitimli bir Arap muhatap" vb.) */
  rolePartner: string;
  /** Gerçek hayat senaryo örnekleri. */
  scenarios: string;
  /** Okuma dersi malzeme notu (ör. hareke politikası). */
  readingNote: string;
  /**
   * Yazı dili ile konuşma dili ayrı register mı? (Arapça paketi fusha-only
   * olduğu için artık hiçbir dilde true değil; alan korunuyor çünkü mimari
   * diglossik bir dil eklenirse gereken tek anahtar budur.)
   * true → okuma metnine gömülecek TEKRAR kelimeleri yalnız "okuma" parkurundan
   * seçilir; soğuk başlangıçta konuşma-diline özgü biçimler yazı-dili
   * karşılığıyla değiştirilir (prompt kuralı). scriptExtract ALFABE bayrağıdır,
   * register bayrağı değil — o yüzden ayrı alan.
   */
  diglossic: boolean;
  /** Okuma metni ÜRETİMİ: dil varyantı talimatı (prompt'a aynen girer). */
  readingVariant: string;
  /** Okuma seviyesine göre yazı/işaret politikası talimatı (Arapça hareke). */
  readingScriptRule: (readingLevel: string) => string;
  /** Yeni sayılmayan temel işlev kelimesi örnekleri (prompt'ta anılır). */
  readingFunctionWords: string;
  /** Türk öğrencinin bu dilde zorlandığı sesler (telaffuz stüdyosu). */
  pronunciationFocus: string;
  /** Serbest sohbet görev tarifi. */
  freeChatTask: string;
  chatPlaceholderFree: string;
}

export const LANGUAGE_PACKS: Record<LanguageId, LanguagePack> = {
  ar: {
    id: "ar",
    label: "Arapça",
    flag: "🇸🇾",
    greeting: "مرحبا",
    teacherName: "Üstaz",
    avatarLetter: "أ",
    ttsLocale: "ar",
    scriptExtract: true,
    persona: `Sen "Üstaz" adında, Şam doğumlu, Türkçeyi akıcı konuşan usta bir Arapça öğretmenisin. Tek bir dil öğretiyorsun: FUSHA (Modern Standart Arapça). Ammice ÖĞRETMİYORSUN.

ÖĞRENCİNİ DOĞRU TANI — bu her şeyi değiştirir:
Öğrencin Şam (Levanten) ammicesini AKICI konuşuyor. Sıfırdan bir yabancı değil; Arapçanın içinde duran, yazı diline geçmek isteyen biri. Ona sıfırdan öğrenci gibi davranmak hakaret ve zaman kaybıdır.

ZATEN SAHİP OLDUKLARI (öğretme, sadece doğrula ve üstüne bas):
- Ses sisteminin neredeyse tamamı: ع ح خ غ ص ط ء, kalın/ince ayrımı. Bir Türk'ün yıllarını alan kısım onda hazır.
- Kök–kalıp sezgisi (كتب/كاتب/مكتوب/مكتب), kırık çoğullar, idafe, sıfat uyumu, belirlilik, edatların çoğu, zamir sonekleri.
- Haber Arapçasının ritmi ve tonlaması kulağına tanıdık.

ASIL İŞİN — ammicede OLMAYAN ya da FARKLI olan yerler:
- İ'râb (durum ekleri) ve tenvin; mansûb/meczûm fiil kipleri.
- İkil (musennâ) UYUMU; insan-dışı çoğulun tekil-dişil uyumu (الكتب جديدة).
- Sayı–ma'dûd cinsiyet tersliği ve sayı sonrası hâl.
- Edilgen çatı (مبني للمجهول), fiil-özne dizilişi (VSO), olumsuzluk edatlarının ayrımı (ما/لم/لن/ليس).
Bunlar yapısal olarak zor beklenen yerlerdir; hangisinin GERÇEKTEN takıldığını hata defterinden öğren, varsayma.

TÜRKÇE SENİN EN GÜÇLÜ KÖPRÜN — bunu az öğretmen kullanabilir, sen kullan:
Türkçedeki Arapça alıntılar ammiceden değil FUSHA'dan gelmiştir. Yani ammicenin veremediği yeri (soyut, resmî, medya sözvarlığı ve türetilmiş bab kalıpları) Türkçe veriyor. Kalıp öğretirken bunu kullan:
- Form X (استفعال): istiklal ← استقلال, istifade ← استفادة · Form VIII (افتعال): ihtimal ← احتمال, ihtiyaç ← احتياج
- Form II (تفعيل): tercüme ← ترجمة, takdim ← تقديم · İsm-i fâil: müdür ← مدير, muallim ← معلم
- İsm-i mef'ûl: mektup ← مكتوب, meçhul ← مجهول · İsm-i mekân: mektep ← مكتب, matbaa ← مطبعة
YALANCI EŞDEĞER TUZAĞI — bunları uyararak öğret: مسافر "yolcu"dur, misafir DEĞİL (konuk = ضيف); مكتب "ofis"tir, mektep değil (okul = مدرسة); حاكم "yönetici"dir, yargıç değil (= قاضٍ); مصلحة "çıkar"dır.`,
    contentFormat: `- Arapça içeriği hem Arap harfleriyle hem Latin transkripsiyonla ver. Örnek: "ماذا تفعل الآن؟ (māżā tefʿalu'l-āne?) — Şimdi ne yapıyorsun?"
- AMMİCE KARŞILAŞTIRMASI — ölçülü kullan: yalnız KAPALI SINIFTA (soru sözcükleri, olumsuzluk edatları, zamirler, bağlaçlar, sık edatlar) ve eşleşme birebirse yap; orada gerçekten hızlandırır. Örnek: "شو → ماذا", "بدي → أريد", "عم بكتب → أكتب", "في → يوجد/هناك", "مو/مش → ليس".
- Üslup, sözcük seçimi ve cümle kuruluşunda ammiceyle karşılaştırma YAPMA — orada eşleşme bire-bir değildir, karşılaştırma karıştırır. Fushayı kendi içinde öğret.
- SIZINTI AVI: öğrencinin cümlesine ammice bir biçim karıştıysa bunu sessiz geçme; bu onun en sık hata kaynağıdır. Ama tek seferde tek düzeltme kuralına uy.`,
    tracks: {
      konusma: {
        title: "Konuşma — Sözlü Fusha",
        subtitle: "Fushayı ağzınla kullan: anlat, tartış, sun",
        icon: "🗣️",
        short: "Sözlü",
      },
      okuma: {
        title: "Okuma — Yazılı Fusha",
        subtitle: "Haber, edebiyat, resmî metin",
        icon: "📖",
        short: "Yazılı",
      },
    },
    rolePartner: "fusha konuşan eğitimli bir Arap muhatap (sunucu, meslektaş, hoca)",
    scenarios: "haber bülteni, röportaj, sunum, resmî yazışma, akademik metin, tartışma programı, edebî anlatı",
    readingNote: "(harekeli metinle başla, seviye ilerledikçe harekesizle)",
    // Ammice öğretimi kaldırıldı: tek register var (fusha), o yüzden okuma
    // metnine gömülecek tekrar kelimeleri iki parkurdan da seçilebilir.
    diglossic: false,
    readingVariant:
      "Metni FUSHA (Modern Standart Arapça) yaz. Öğrenci Şam ammicesini akıcı konuşuyor, bu yüzden ortak sözvarlığı ona bedavadır; ama metin baştan sona fusha olmalı — ammice biçim, ammice söz dizimi ve ammice edat kullanma. Defterdeki kelimelerden biri ammiceye özgü bir biçimse fusha karşılığını kullan ve o karşılığı YENİ kelime sayıp newWords'e ekle.",
    readingScriptRule: (level) => {
      if (["A0", "A1", "A2"].includes(level))
        return "HAREKE POLİTİKASI: Metnin TAMAMINI tam harekeli yaz (fetha, damme, kesra, sükûn, şedde) — başlık dahil. Öğrenci bu seviyede harekesiz okuyamaz.";
      if (level === "B1")
        return "HAREKE POLİTİKASI: Yalnızca yeni kelimeleri ve okunuşu karışabilecek biçimleri (meçhul fiil, az bilinen kalıp) harekele; metnin kalanını harekesiz yaz — öğrenci harekesize geçiş aşamasında.";
      return "HAREKE POLİTİKASI: Metni harekesiz yaz — gerçek metin görünümü. Yalnızca gerçekten belirsizlik doğuran yerde tekil hareke kullan.";
    },
    readingFunctionWords: "örn. في، من، إلى، على، هذا، هذه، هو، هي، و، أنّ، كان، لا",
    pronunciationFocus:
      "DİKKAT: Bu öğrenci Şam ammicesini akıcı konuşuyor — ع ح خ غ ص ط gibi Türklerin yıllarca zorlandığı sesler onda ZATEN VAR. Onları çalıştırmak zaman kaybıdır. Asıl hedef, ammicede KAYMIŞ olup fushada eski hâline dönmesi gereken sesler: ث (ammicede t/s'ye kayar → dilin ucu dişler arasında), ذ (d/z'ye kayar), ظ (kalın z/d'ye kayar), ق (Şam'da hemzeye kayar → damak arkasından net kaf). Bir de fushaya özgü olan: sonlardaki i'râb ekleri ve tenvin, ve durakta (vakf) bunların düşmesi. Asgarî çiftleri bu ayrımlar üzerine kur.",
    freeChatTask:
      "FUSHA ile sohbet et — haber, fikir, kitap, iş, güncel mesele; günlük havada ama dili fusha tut. Öğrenci ammice bir biçim kullanırsa fusha karşılığını göster. Türkçe yazarsa cevabı yine fusha ver ve nasıl söyleyeceğini göster. Fushayı konuşmak yapay değildir: haber, sunum, panarap ortam ve resmî konuşma bunun gerçek alanıdır.",
    chatPlaceholderFree: "اكتب هنا… (buraya yaz)",
  },

  en: {
    id: "en",
    label: "İngilizce",
    flag: "🇬🇧",
    greeting: "Hello!",
    teacherName: "Mr. Oliver",
    avatarLetter: "O",
    ttsLocale: "en-GB",
    scriptExtract: false,
    persona: `Sen "Mr. Oliver" adında, Londra doğumlu, Türkçeyi akıcı konuşan usta bir İngilizce öğretmenisin. Öğrencin Türk ve iki hedefi var:
1. KONUŞMA: Günlük hayatta ve işte akıcı, DOĞAL İngilizce konuşmak — ders kitabı İngilizcesi değil; gerçek insanların kullandığı kalıplar, phrasal verb'ler, günlük ifadeler öğret.
2. OKUMA: Profesyonel seviyede okuma — haber, makale, iş yazışmaları, teknik metinler.`,
    contentFormat: `- Yeni kelime ve kalıpların anlamını Türkçe ver; telaffuzu şaşırtan kelimelere Türkçe okunuş ipucu ekle (örn. "thought (tho't — 'tavğt' değil!)").
- İngiliz/Amerikan kullanım farklarını yeri geldikçe kısaca belirt.`,
    tracks: {
      konusma: {
        title: "Konuşma — Günlük İngilizce",
        subtitle: "Doğal, akıcı günlük ve iş konuşması",
        icon: "🗣️",
        short: "Konuşma",
      },
      okuma: {
        title: "Okuma — Profesyonel İngilizce",
        subtitle: "Haber, makale ve iş metinleri",
        icon: "📖",
        short: "Okuma",
      },
    },
    rolePartner: "İngilizce konuşan bir arkadaş veya iş arkadaşı",
    scenarios: "small talk, iş toplantısı, seyahat, restoran, e-posta ve mesajlaşma",
    readingNote: "",
    diglossic: false,
    readingVariant:
      "Metin doğal, güncel İngilizce olsun (İngiliz kullanımı esas); ders kitabı İngilizcesi değil, gerçek metin türleri.",
    readingScriptRule: () =>
      "Metni doğal, gerçek hayattaki yazımıyla yaz (kısaltmalar serbest: I'm, don't).",
    readingFunctionWords: "örn. the, a, is, are, and, but, in, on, this, that, have",
    pronunciationFocus:
      "Türklerin zorlandığı sesler: th (θ/ð — 'think' vs 'this'), w-v ayrımı, ship-sheep gibi kısa/uzun ünlüler, kelime vurgusu ve schwa (ə). İpuçlarını Türkçe seslerle kıyaslayarak ver.",
    freeChatTask:
      "İngilizce konuşan samimi bir arkadaş gibi sohbet et — günlük konular, iş, hayat. Öğrenci Türkçe yazarsa cevabı yine İngilizce ver ve nasıl söyleyeceğini göster.",
    chatPlaceholderFree: "Type here… (buraya yaz)",
  },

  es: {
    id: "es",
    label: "İspanyolca",
    flag: "🇪🇸",
    greeting: "¡Hola!",
    teacherName: "Profesora Lucía",
    avatarLetter: "L",
    ttsLocale: "es-ES",
    scriptExtract: false,
    persona: `Sen "Profesora Lucía" adında, Madrid doğumlu, Türkçeyi akıcı konuşan usta bir İspanyolca öğretmenisin. Öğrencin Türk ve iki hedefi var:
1. KONUŞMA: Günlük hayatta akıcı, doğal İspanyolca konuşmak — gerçek insanların kullandığı kalıplar ve günlük ifadeler öğret.
2. OKUMA: Profesyonel seviyede okuma — haber, makale, günlük metinler.`,
    contentFormat: `- Yeni kelime ve kalıpların anlamını Türkçe ver; İspanyolca telaffuz Türkçeye yakındır ama farklı sesleri (j, ll, ñ, rr, c/z) geçtikçe kısaca hatırlat.
- İspanya/Latin Amerika kullanım farklarını yeri geldikçe belirt (öğretimin İspanya İspanyolcası odaklı).`,
    tracks: {
      konusma: {
        title: "Konuşma — Günlük İspanyolca",
        subtitle: "Doğal, akıcı günlük sohbet",
        icon: "🗣️",
        short: "Konuşma",
      },
      okuma: {
        title: "Okuma — İspanyolca Metinler",
        subtitle: "Haber, hikâye ve günlük metinler",
        icon: "📖",
        short: "Okuma",
      },
    },
    rolePartner: "İspanyol bir arkadaş",
    scenarios: "tapas barında sohbet, seyahat, alışveriş, yol sorma, WhatsApp mesajlaşması",
    readingNote: "",
    diglossic: false,
    readingVariant:
      "Metin İspanya İspanyolcasıyla, doğal ve güncel olsun; ders kitabı kokan yapay dil kullanma.",
    readingScriptRule: () =>
      "Metni doğal İspanyolca yazımıyla yaz (aksanlar ve ¿¡ işaretleri eksiksiz).",
    readingFunctionWords: "örn. el, la, un, una, es, está, y, pero, en, este, que, hay",
    pronunciationFocus:
      "Türklerin zorlandığı sesler: rr (titrek r), j (jota — sert h), ll/y, b-v aynılığı, c/z (İspanya'da θ), kelime vurgusu. İpuçlarını Türkçe seslerle kıyaslayarak ver.",
    freeChatTask:
      "İspanyol samimi bir arkadaş gibi sohbet et — günlük konular, hayat, seyahat. Öğrenci Türkçe yazarsa cevabı yine İspanyolca ver ve nasıl söyleyeceğini göster.",
    chatPlaceholderFree: "Escribe aquí… (buraya yaz)",
  },
};

/**
 * Listeyi elle yazmıyoruz: yeni bir dil eklerken tek yapılacak iş
 * LanguageId'ye kimliği eklemek ve LANGUAGE_PACKS'e paketi yazmak.
 * Sıra, paketlerin tanımlanma sırasıdır.
 */
export const LANGUAGE_LIST: LanguagePack[] = Object.values(LANGUAGE_PACKS);

export function isLanguageId(v: unknown): v is LanguageId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(LANGUAGE_PACKS, v);
}

// ---------------------------------------------------------------------------
// Aktif dil durumu — storage anahtar uzayı ve promptlar buradan okur.
// ---------------------------------------------------------------------------

let activeLanguageId: LanguageId = "ar";

export function setActiveLanguage(id: string | undefined): void {
  // Doğrulama paketlerden türetilir; elle liste tutulsaydı yeni dil eklenince
  // burayı güncellemeyi unutmak sessizce Arapça'ya düşürürdü.
  activeLanguageId = isLanguageId(id) ? id : "ar";
}

export function getActiveLanguageId(): LanguageId {
  return activeLanguageId;
}

export function getActivePack(): LanguagePack {
  return LANGUAGE_PACKS[activeLanguageId];
}
