/**
 * Tema kancası — cihazın aydınlık/karanlık tercihini izler.
 *
 * Bağlam (Context) yerine doğrudan useColorScheme kullanılıyor: uygulamada
 * tek bir tema kaynağı var (sistem tercihi), sağlayıcı sarmalamak fazladan
 * bir katman olurdu. Ekranlar `const c = useTheme()` deyip renk jetonlarını
 * oradan alır; StyleSheet'te sabit renk yazmaz.
 *
 * app.json'da userInterfaceStyle "automatic" ve expo-system-ui kurulu
 * olmadan Android bu tercihi hiç bildirmez (prebuild ayarı sessizce yok
 * sayar) — ikisi de yapıldı.
 */
import { useColorScheme } from "react-native";
import { darkPalette, lightPalette, Palette } from "./theme";

export function useTheme(): Palette {
  return useColorScheme() === "dark" ? darkPalette : lightPalette;
}

/** Karanlık mod açık mı — gölge/opaklık gibi moda göre değişen ayarlar için. */
export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}
