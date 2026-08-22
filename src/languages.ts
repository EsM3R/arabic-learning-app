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
  /** Kısa etiket: ders başlığı ve kelime kartı rozeti ("Ammice", "Konuşma"...) */
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
  /** Konuşma dersinde hocanın gireceği rol ("Suriyeli arkadaş" vb.) */
  rolePartner: string;
  /** Gerçek hayat senaryo örnekleri. */
  scenarios: string;
  /** Okuma dersi malzeme notu (ör. hareke politikası). */
  readingNote: string;
  /** Türk öğrencinin bu dilde zorlandığı sesler (telaffuz stüdyosu). */
  pronunciationFocus: string;
  /** Seviye tespitinde nelerin yoklanacağı. */
  assessmentFocus: string;
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
    persona: `Sen "Üstaz" adında, Şam doğumlu, Türkçeyi akıcı konuşan usta bir Arapça öğretmenisin. Öğrencin Türk ve iki hedefi var:
1. KONUŞMA: Suriyeli arkadaşlarıyla akıcı konuşmak — bunun için Şami (Suriye/Levanten) ammicesi öğretiyorsun. Konuşma pratiğinde HER ZAMAN ammice kullan, fusha değil.
2. OKUMA: Profesyonel seviyede okuma — bunun için fusha (Modern Standart Arapça) öğretiyorsun. Okuma çalışmalarında fusha kullan.`,
    contentFormat: `- Arapça içeriği hem Arap harfleriyle hem Latin transkripsiyonla ver. Örnek: "شو أخبارك؟ (şu ahbārak?) — Ne haber?"
- Ammice ile fusha arasındaki önemli farkları yeri geldikçe kısaca belirt (örn. ammice "شو" = fusha "ماذا").`,
    tracks: {
      konusma: {
        title: "Konuşma — Şami Ammicesi",
        subtitle: "Suriyeli arkadaşlarınla akıcı sohbet",
        icon: "🗣️",
        short: "Ammice",
      },
      okuma: {
        title: "Okuma — Fusha",
        subtitle: "Profesyonel okuma ve anlama",
        icon: "📖",
        short: "Fusha",
      },
    },
    rolePartner: "Suriyeli bir arkadaş",
    scenarios: "selamlaşma, misafirlik, çarşı-pazar, yemek, taksi, WhatsApp mesajlaşması",
    readingNote: "(harekeli metinle başla, seviye ilerledikçe harekesizle)",
    pronunciationFocus:
      "Türklerin zorlandığı sesler: ع، ح، خ، غ، ق، ض، ظ، ص. İpuçlarını Türkçedeki benzer seslerden yola çıkarak ver (örn. \"ع boğazın sıkışmasıyla çıkar\", \"خ Türkçedeki h'den sert, hırıltılı\").",
    assessmentFocus:
      "Konuşma için Şami ammicesini yokla (arkadaşlarıyla konuştuğunu biliyorsun; gerçek konuşma dili bilgisini ölç). Okuma için kısa fusha cümle/metinler göster.",
    freeChatTask:
      "Suriyeli bir arkadaş gibi Şami ammicesiyle sohbet et — günlük konular, hal hatır, hayat. Öğrenci Türkçe yazarsa cevabı yine ammice ver ve nasıl söyleyeceğini göster.",
    chatPlaceholderFree: "اكتب هون… (buraya yaz)",
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
    pronunciationFocus:
      "Türklerin zorlandığı sesler: th (θ/ð — 'think' vs 'this'), w-v ayrımı, ship-sheep gibi kısa/uzun ünlüler, kelime vurgusu ve schwa (ə). İpuçlarını Türkçe seslerle kıyaslayarak ver.",
    assessmentFocus:
      "Konuşma için günlük diyalog kur (small talk, kendini anlatma); kalıp ve phrasal verb bilgisini yokla. Okuma için kısa gerçekçi metin parçaları göster.",
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
    pronunciationFocus:
      "Türklerin zorlandığı sesler: rr (titrek r), j (jota — sert h), ll/y, b-v aynılığı, c/z (İspanya'da θ), kelime vurgusu. İpuçlarını Türkçe seslerle kıyaslayarak ver.",
    assessmentFocus:
      "Konuşma için günlük diyalog kur (selamlaşma, kendini anlatma, basit ihtiyaçlar). Okuma için kısa gerçekçi metin parçaları göster.",
    freeChatTask:
      "İspanyol samimi bir arkadaş gibi sohbet et — günlük konular, hayat, seyahat. Öğrenci Türkçe yazarsa cevabı yine İspanyolca ver ve nasıl söyleyeceğini göster.",
    chatPlaceholderFree: "Escribe aquí… (buraya yaz)",
  },
};

export const LANGUAGE_LIST: LanguagePack[] = [
  LANGUAGE_PACKS.ar,
  LANGUAGE_PACKS.en,
  LANGUAGE_PACKS.es,
];

// ---------------------------------------------------------------------------
// Aktif dil durumu — storage anahtar uzayı ve promptlar buradan okur.
// ---------------------------------------------------------------------------

let activeLanguageId: LanguageId = "ar";

export function setActiveLanguage(id: string | undefined): void {
  activeLanguageId = (id === "en" || id === "es" ? id : "ar") as LanguageId;
}

export function getActiveLanguageId(): LanguageId {
  return activeLanguageId;
}

export function getActivePack(): LanguagePack {
  return LANGUAGE_PACKS[activeLanguageId];
}
