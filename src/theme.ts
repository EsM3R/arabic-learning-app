import { TextStyle, ViewStyle } from "react-native";

/**
 * Tasarım sistemi — "Şam Akşamı":
 * koyu zümrüt (hoca otoritesi) + sıcak kum (kağıt/dershane) + altın (ödül).
 */
export const colors = {
  // Zemin
  bg: "#F6F1E7",
  card: "#FFFFFF",
  // Koyu zümrüt (hero, vurgulu yüzeyler)
  deep: "#0B3D34",
  deepAlt: "#145447",
  onDeep: "#F3EFE4",
  onDeepSoft: "rgba(243,239,228,0.66)",
  // Ana renk
  accent: "#0E7C6B",
  accentDark: "#0A5D50",
  accentSoft: "#DFF0EB",
  // Altın
  gold: "#B8860B",
  goldDeep: "#C8952F",
  goldSoft: "#F7ECD8",
  // Metin
  ink: "#1F2A28",
  inkSoft: "#66716C",
  inkFaint: "#98A19C",
  // Çizgi & durum
  border: "#E8E0D2",
  danger: "#B4482B",
  dangerSoft: "#F6DED5",
  // Sohbet
  userBubble: "#0E7C6B",
  assistantBubble: "#FFFFFF",
};

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

export const type: Record<string, TextStyle> = {
  hero: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  section: { fontSize: 16, fontWeight: "800" },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  arabicXL: { fontSize: 44, lineHeight: 64 },
  arabicL: { fontSize: 30, lineHeight: 46 },
};
