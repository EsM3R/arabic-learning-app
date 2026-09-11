import { TextStyle, ViewStyle } from "react-native";
import { isArabicFamily } from "./scripts";
import type { ScriptId } from "./scripts";

/**
 * Tasarım sistemi — "Şam Akşamı":
 * koyu zümrüt (hoca otoritesi) + sıcak kum (kağıt/dershane) + altın (ödül).
 *
 * Karanlık mod aynı kimliğin gece hâlidir: kum kararır, zümrüt zemine geçer,
 * altın parlaklığını korur. Jeton ADLARI iki modda da aynıdır — ekranlar
 * `useTheme()` ile paleti alır, renk seçmez.
 */

export interface Palette {
  bg: string;
  bgAlt: string;
  card: string;
  deep: string;
  deepAlt: string;
  onDeep: string;
  onDeepSoft: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  gold: string;
  goldDeep: string;
  goldSoft: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  border: string;
  danger: string;
  dangerSoft: string;
  userBubble: string;
  assistantBubble: string;
  /** Yükleniyor iskeletlerinin zemini. */
  skeleton: string;
}

export const lightPalette: Palette = {
  bg: "#F6F1E7",
  bgAlt: "#EFE8DA",
  card: "#FFFFFF",
  deep: "#0B3D34",
  deepAlt: "#145447",
  onDeep: "#F3EFE4",
  onDeepSoft: "rgba(243,239,228,0.66)",
  accent: "#0E7C6B",
  accentDark: "#0A5D50",
  accentSoft: "#DFF0EB",
  gold: "#B8860B",
  goldDeep: "#C8952F",
  goldSoft: "#F7ECD8",
  ink: "#1F2A28",
  inkSoft: "#66716C",
  inkFaint: "#98A19C",
  border: "#E8E0D2",
  danger: "#B4482B",
  dangerSoft: "#F6DED5",
  userBubble: "#0E7C6B",
  assistantBubble: "#FFFFFF",
  skeleton: "#EAE3D5",
};

/**
 * Gece paleti. Kural: metin/zemin karşıtlığı WCAG AA'yı (4.5:1) tutar,
 * saf siyah kullanılmaz (OLED'de titreme ve sert kenar yapar) — zemin
 * zümrüte çalan koyu bir mürekkeptir.
 */
export const darkPalette: Palette = {
  bg: "#0E1614",
  bgAlt: "#131F1C",
  card: "#182521",
  deep: "#0A2E28",
  deepAlt: "#10423A",
  onDeep: "#EFE9DB",
  onDeepSoft: "rgba(239,233,219,0.62)",
  accent: "#3FA994",
  accentDark: "#2C8C79",
  accentSoft: "#17332D",
  gold: "#E0B45C",
  goldDeep: "#D9A63F",
  goldSoft: "#2C2417",
  ink: "#ECE6D8",
  inkSoft: "#9BA8A2",
  inkFaint: "#6C7A74",
  border: "#243530",
  danger: "#E2795A",
  dangerSoft: "#3A211A",
  userBubble: "#14624F",
  assistantBubble: "#182521",
  skeleton: "#1E2C27",
};

/**
 * Geriye dönük uyumluluk: ekranlar kademe kademe useTheme()'e geçiyor.
 * Henüz geçmemiş ekranlar bu sabiti kullanmaya devam eder (aydınlık palet).
 */
export const colors = lightPalette;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

/** Yumuşak kart gölgesi (iOS gölge + Android elevation). */
export const shadow: ViewStyle = {
  shadowColor: "#3A2E1A",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
};

export const shadowLift: ViewStyle = {
  shadowColor: "#3A2E1A",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.14,
  shadowRadius: 20,
  elevation: 6,
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

export const type: Record<string, TextStyle> = {
  hero: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  section: { fontSize: 16, fontWeight: "800" },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  // Arapça ölçek — lineHeight'lar ARABIC_LINE kuralına göre düzeltildi
  // (44→99, 30→68); eskiden 64 ve 46 idi ve harekeleri kırpıyordu.
  arabicXL: arabicText(44),
  arabicL: arabicText(30),
  arabicM: arabicText(22),
};
