import React, { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Header from "../components/Header";
import { loadMistakes } from "../storage";
import { colors, radius, shadow } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
import { MistakeEntry } from "../types";

interface Props {
  onBack: () => void;
}

export default function MistakesScreen({ onBack }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const entries = await loadMistakes();
      setMistakes([...entries].reverse()); // en yeni üstte
      setLoaded(true);
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Header title="Hata Defteri" subtitle={`${mistakes.length} kayıt`} onBack={onBack} />

      {loaded && mistakes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📒</Text>
          <Text style={styles.emptyTitle}>Defter tertemiz</Text>
          <Text style={styles.emptyText}>
            Derslerde anlamlı bir hata yaptığında hocan buraya kendisi kaydedecek ve sonraki
            derslerde üzerinden geçecek.
          </Text>
        </View>
      ) : (
        <FlatList
          data={mistakes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, item.resolved && styles.cardResolved]}>
              <View style={styles.topicRow}>
                <Text style={styles.topic}>{item.topic}</Text>
                {item.resolved && <Text style={styles.resolvedBadge}>✓ ÇÖZÜLDÜ</Text>}
              </View>
              <Text style={styles.mistake}>✗ {item.mistake}</Text>
              <Text style={styles.correction}>✓ {item.correction}</Text>
              <Text style={styles.explanation}>{item.explanation}</Text>
            </View>
          )}
        />
      )}
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
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  emptyText: { fontSize: 14, color: colors.inkSoft, textAlign: "center", lineHeight: 21 },
  list: { padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    marginBottom: 11,
    ...shadow,
  },
  cardResolved: { opacity: 0.65, borderLeftColor: colors.accent },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 8,
  },
  topic: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.gold,
    textTransform: "uppercase",
    flex: 1,
  },
  resolvedBadge: { fontSize: 10, fontWeight: "800", color: colors.accent },
  mistake: { fontSize: 15, color: colors.danger, marginBottom: 4 },
  correction: { fontSize: 15, color: colors.accent, fontWeight: "600", marginBottom: 6 },
  explanation: { fontSize: 13, color: colors.inkSoft, lineHeight: 19 },
});
}
