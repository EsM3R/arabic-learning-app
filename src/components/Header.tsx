import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Sağ tarafa düğme vb. */
  right?: React.ReactNode;
}

/** Tüm iç ekranlarda ortak, sakin başlık çubuğu. */
export default function Header({ title, subtitle, onBack, right }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={10}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.backSpacer} />
      )}
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

/**
 * Stiller paletin FONKSİYONU: karanlık modda renkler değişir ama yapı
 * (ölçü, yerleşim, yazı tipi) aynı kalır. Parametre adı bilinçli olarak
 * `colors` — gövdedeki bütün jetonlar olduğu gibi çalışsın diye.
 */
function makeStyles(colors: Palette) {
  return StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 58,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  backChevron: { fontSize: 24, color: colors.accent, fontWeight: "700", marginTop: -3 },
  backSpacer: { width: 4 },
  center: { flex: 1 },
  title: { fontSize: 17, fontWeight: "800", color: colors.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  right: { flexDirection: "row", alignItems: "center" },
});
}
