// Tip-yalnız import: node --experimental-strip-types bunları siler, böylece
// tema testi react-native yüklemeden koşabilir (tests/theme.test.ts).
import type { TextStyle, ViewStyle } from "react-native";
import { isArabicFamily } from "./scripts.ts";
import type { ScriptId } from "./scripts.ts";

/**
 * Tasarım sistemi — "Premium+":
 * fildişi zemin + koyu zümrüt (hoca, ana eylem) + pirinç (ödül, vurgu).
 * Arka plan desenleri ve koyu sahneler zümrüt; pirinç yalnız önemli anlara.
 *
 * Karanlık mod aynı kimliğin gece hâlidir. Jeton ADLARI iki modda da
 * aynıdır — ekranlar `useTheme()` ile paleti alır, renk seçmez.
 */

export interface Palette {
  bg: string;
  bgAlt: string;
  card: string;
  /** Koyu sahne zemini (ana ekran başlığı, mikrofon paneli, Konuşma Odası). */
  deep: string;
  deepAlt: string;
  onDeep: string;
  onDeepSoft: string;
  /** Ana eylem rengi (birincil düğme, seçili sekme). */
  accent: string;
  accentDark: string;
  accentSoft: string;
  /** Pirinç — metin olarak okunur tonu (açık zeminde). */
  gold: string;
  /** Pirinç — koyu zeminde vurgu ve dolgu. */
  goldDeep: string;
  goldSoft: string;
  /** Pirinç dolgu üstündeki metin. */
  onGold: string;
  /** Karaoke / vurgulanan kelimenin zemini. */
  highlight: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  border: string;
  /** Liste satırları arasındaki ince çizgi. */
  line: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  userBubble: string;
  assistantBubble: string;
  /** Yükleniyor iskeletlerinin zemini. */
  skeleton: string;
  /** Kart gölgesinin rengi. */
  shadowTint: string;
}

export const lightPalette: Palette = {
  bg: "#F4F1EA",
  bgAlt: "#ECE7DC",
  card: "#FFFFFF",
  deep: "#0B3A31",
  deepAlt: "#0F4C3F",
  onDeep: "#F4F1EA",
  onDeepSoft: "rgba(244,241,234,0.70)",
  accent: "#0F4C3F",
  accentDark: "#0B3A31",
  accentSoft: "#E6EFEB",
  gold: "#8A6220",
  goldDeep: "#D9C08F",
  goldSoft: "#F4EBDB",
  onGold: "#1B1608",
  highlight: "#F4E6C8",
  ink: "#15201C",
  inkSoft: "#5B6661",
  inkFaint: "#7A837F",
  border: "#E8E3D8",
  line: "#EEEAE1",
  danger: "#9A4A33",
  dangerSoft: "#F6E3DC",
  info: "#2E4A6B",
  infoSoft: "#E7ECF3",
  userBubble: "#0F4C3F",
  assistantBubble: "#FFFFFF",
  skeleton: "#E9E4D8",
  shadowTint: "#0B3A31",
};

/**
 * Gece paleti. Kural: metin/zemin karşıtlığı WCAG AA'yı (4.5:1) tutar,
 * saf siyah kullanılmaz (OLED'de titreme ve sert kenar yapar) — zemin
 * zümrüte çalan koyu bir mürekkeptir.
 */
export const darkPalette: Palette = {
  bg: "#0C1714",
  bgAlt: "#11201C",
  card: "#15241F",
  deep: "#0A2A23",
  deepAlt: "#0F3A31",
  onDeep: "#EFEBE1",
  onDeepSoft: "rgba(239,235,225,0.66)",
  accent: "#2F8F7A",
  accentDark: "#5DBBA5",
  accentSoft: "#173A31",
  gold: "#E0C48F",
  goldDeep: "#D9C08F",
  goldSoft: "#2C2417",
  onGold: "#1B1608",
  highlight: "#4A3C1F",
  ink: "#ECE7DB",
  inkSoft: "#A3AEA9",
  inkFaint: "#7D8A84",
  border: "#22342E",
  line: "#1C2C27",
  danger: "#E2795A",
  dangerSoft: "#3A211A",
  info: "#9DB8D8",
  infoSoft: "#1C2A38",
  userBubble: "#1F6B59",
  assistantBubble: "#15241F",
  skeleton: "#1E2C27",
  shadowTint: "#000000",
};

/**
 * Geriye dönük uyumluluk: ekranlar kademe kademe useTheme()'e geçiyor.
 * Henüz geçmemiş ekranlar bu sabiti kullanmaya devam eder (aydınlık palet).
 */
export const colors = lightPalette;

// ---------------------------------------------------------------------------
// YAZI TİPLERİ — app.json'daki expo-font eklentisiyle derleme zamanında
// gömülür. Android'de aile + fontWeight ile gerçek ağırlık seçilir
// (fontDefinitions). Başlık: Fraunces (serif, 500/600). Metin: Manrope.
// ---------------------------------------------------------------------------

export const DISPLAY_FONT = "Fraunces";
export const TEXT_FONT = "Manrope";

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, xxl: 28 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

/** Yumuşak kart gölgesi (iOS gölge + Android elevation). */
export const shadow: ViewStyle = {
  shadowColor: "#0B3A31",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 2,
};

/** Yüzen kart — ana eylem kartı, sahne kartı. */
export const shadowLift: ViewStyle = {
  shadowColor: "#0B3A31",
  shadowOffset: { width: 0, height: 14 },
  shadowOpacity: 0.16,
  shadowRadius: 28,
  elevation: 10,
};

// ---------------------------------------------------------------------------
// ARAPÇA TİPOGRAFİ
//
// Font: Noto Naskh Arabic (OFL) — assets/fonts, app.json'daki expo-font
// eklentisiyle DERLEME ZAMANINDA gömülür (useFonts kullanılmaz; eklenti
// yolu gerçek ağırlık seçimi sağlar, useFonts yolu Android'de yalnız
// Typeface.NORMAL yuvasına yazar).
//
// KIRPILMA KURALI — burası kritik:
// Android'de bir <Text>'e lineHeight verildiği anda RN, harekelerin yaşadığı
// üst bandı (fm.top) ascent'e eşitler ve harekeler kesilir. Noto Naskh için
// ölçülmüş gereksinim: en kötü durumda (lafẓ al-jalāla gibi yığılmalı
// biçimler) lineHeight >= 2.21 × fontSize. Eski değerler 1.455 ve 1.533'tü,
// yani harekeli metin tepeden kırpılıyordu.
//
// letterSpacing Arapça'da HER ZAMAN 0 olmalı: bitişik bir yazıdır, boşluk
// enjekte etmek harf bağlantılarını görsel olarak koparır. Miras yoluyla
// Latin stillerinden sızmasın diye açıkça yazılır.
//
// fontWeight KULLANILMAZ: 700+ verildiğinde Android özel fontu bırakıp
// sistem fontuna sahte-kalın uygular. Kalın için ayrı aile adı verilir.
// ---------------------------------------------------------------------------

export const ARABIC_FONT = "NotoNaskhArabic";
/** Harekeli metnin kırpılmaması için gereken en küçük lineHeight çarpanı. */
export const ARABIC_LINE = 2.25;

/** Arapça metin stili üretir; boyutu verirsin, gerisini kural belirler. */
export function arabicText(fontSize: number, semibold = false): TextStyle {
  return {
    fontFamily: semibold ? `${ARABIC_FONT}-SemiBold` : ARABIC_FONT,
    fontSize,
    lineHeight: Math.round(fontSize * ARABIC_LINE),
    letterSpacing: 0,
  };
}

/**
 * Hedef dil kelimesinin BÜYÜK gösterimi (kelime kartı, telaffuz stüdyosu).
 *
 * Naskh + 2.25 satır yüksekliği yalnızca Arap alfabesinde DOĞRUDUR; Kiril ve
 * Latin'de yanlıştır: Noto Naskh'ta Kiril glifi yoktur (Rusça kelime kutu
 * olarak çıkar) ve 2.25 çarpanı Latin kelimeyi ekrana yayar. Alfabe kimliği
 * geldiğinden beri bu karar artık tahmin değil.
 */
export function targetText(fontSize: number, script: ScriptId, semibold = false): TextStyle {
  if (isArabicFamily(script)) return arabicText(fontSize, semibold);
  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.3),
    fontWeight: semibold ? "800" : "700",
    letterSpacing: -0.3,
  };
}

/**
 * Yazı ölçeği. Başlıklar Fraunces, geri kalan Manrope. Ekranlar boyut
 * yazmaz, bu adları kullanır (Txt bileşeni: src/components/kit.tsx).
 */
export const type = {
  display: { fontFamily: DISPLAY_FONT, fontWeight: "500", fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  title1: { fontFamily: DISPLAY_FONT, fontWeight: "600", fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  title2: { fontFamily: DISPLAY_FONT, fontWeight: "600", fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  title3: { fontFamily: DISPLAY_FONT, fontWeight: "600", fontSize: 19, lineHeight: 25 },
  headline: { fontFamily: TEXT_FONT, fontWeight: "800", fontSize: 16.5, lineHeight: 22 },
  body: { fontFamily: TEXT_FONT, fontWeight: "500", fontSize: 15.5, lineHeight: 23 },
  bodyStrong: { fontFamily: TEXT_FONT, fontWeight: "700", fontSize: 15.5, lineHeight: 23 },
  callout: { fontFamily: TEXT_FONT, fontWeight: "600", fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: TEXT_FONT, fontWeight: "600", fontSize: 12.5, lineHeight: 17 },
  overline: { fontFamily: TEXT_FONT, fontWeight: "800", fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
  button: { fontFamily: TEXT_FONT, fontWeight: "800", fontSize: 15.5, lineHeight: 20 },
  stat: { fontFamily: TEXT_FONT, fontWeight: "800", fontSize: 22, lineHeight: 26 },
  // Eski adlar (henüz yeniden çizilmemiş ekranlar için)
  hero: { fontFamily: DISPLAY_FONT, fontWeight: "600", fontSize: 30, letterSpacing: -0.5 },
  title: { fontFamily: DISPLAY_FONT, fontWeight: "600", fontSize: 20, letterSpacing: -0.3 },
  section: { fontFamily: TEXT_FONT, fontWeight: "800", fontSize: 16 },
  small: { fontFamily: TEXT_FONT, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: TEXT_FONT, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  // Arapça ölçek — lineHeight'lar ARABIC_LINE kuralına göre düzeltildi
  // (44→99, 30→68); eskiden 64 ve 46 idi ve harekeleri kırpıyordu.
  arabicXL: arabicText(44),
  arabicL: arabicText(30),
  arabicM: arabicText(22),
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;
