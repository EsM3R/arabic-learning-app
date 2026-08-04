import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { loadMistakes } from "../storage";
import { colors } from "../theme";
import { MistakeEntry } from "../types";

interface Props {
  onBack: () => void;
}

export default function MistakesScreen({ onBack }: Props) {
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
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Hata Defteri</Text>
          <Text style={styles.headerSub}>{mistakes.length} kayıt</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loaded && mistakes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📒</Text>
          <Text style={styles.emptyTitle}>Defter tertemiz</Text>
          <Text style={styles.emptyText}>
            Derslerde anlamlı bir hata yaptığında Üstaz buraya kendisi kaydedecek ve sonraki
            derslerde üzerinden geçecek.
          </Text>
        </View>
      ) : (
        <FlatList
          data={mistakes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.topic}>{item.topic}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  backButton: { paddingVertical: 4, paddingHorizontal: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: "700" },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  headerSub: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  headerSpacer: { minWidth: 40 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  emptyText: { fontSize: 14, color: colors.inkSoft, textAlign: "center", lineHeight: 21 },
  list: { padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  topic: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.gold,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  mistake: { fontSize: 15, color: colors.danger, marginBottom: 4 },
  correction: { fontSize: 15, color: colors.accent, fontWeight: "600", marginBottom: 6 },
  explanation: { fontSize: 13, color: colors.inkSoft, lineHeight: 19 },
});
