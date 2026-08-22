import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Header from "../components/Header";
import { speakArabic } from "../speech";
import { dueCards, gradeCard } from "../srs";
import { loadVocab, saveVocab, touchLastActivity } from "../storage";
import { colors, radius, shadow, shadowLift } from "../theme";
import { ReviewGrade, VocabCard } from "../types";

interface Props {
  onBack: () => void;
}

export default function ReviewScreen({ onBack }: Props) {
  const [allCards, setAllCards] = useState<VocabCard[]>([]);
  const [queue, setQueue] = useState<VocabCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const cards = await loadVocab();
      setAllCards(cards);
      setQueue(dueCards(cards));
      setLoaded(true);
    })();
  }, []);

  const current = queue[0];

  const grade = async (g: ReviewGrade) => {
    if (!current) return;
    void touchLastActivity();
    const updated = gradeCard(current, g);
    const nextAll = allCards.map((c) => (c.id === updated.id ? updated : c));
    setAllCards(nextAll);
    await saveVocab(nextAll);

    const rest = queue.slice(1);
    // Bilemedi → kartı kuyruğun sonuna geri koy, bu oturumda tekrar sorulsun
    setQueue(g === 0 ? [...rest, updated] : rest);
    if (g !== 0) setDoneCount((n) => n + 1);
    setRevealed(false);
  };

  return (
    <View style={styles.container}>
      <Header
        title="Kelime Defteri"
        subtitle={`${allCards.length} kelime · bugün ${queue.length} tekrar`}
        onBack={onBack}
      />

      {!loaded ? null : !current ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{allCards.length === 0 ? "📇" : "🎉"}</Text>
          <Text style={styles.emptyTitle}>
            {allCards.length === 0 ? "Defter henüz boş" : "Bugünlük bitti!"}
          </Text>
          <Text style={styles.emptyText}>
            {allCards.length === 0
              ? "Üstaz ile ders yaptıkça bilmediğin kelimeleri buraya kendisi ekleyecek."
              : doneCount > 0
                ? `${doneCount} kelime tekrar ettin. Yarın yenileri seni bekliyor.`
                : "Şu an tekrarı gelen kelime yok. Yarın tekrar bak."}
          </Text>
        </View>
      ) : (
        <View style={styles.cardArea}>
          <View style={styles.card}>
            <Text style={styles.arabic}>{current.arabic}</Text>
            <View style={styles.listenRow}>
              <TouchableOpacity
                style={styles.listenChip}
                onPress={() => speakArabic(current.arabic)}
              >
                <Text style={styles.listenChipText}>🔊 Dinle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.listenChip}
                onPress={() => speakArabic(current.arabic, true)}
              >
                <Text style={styles.listenChipText}>🐢 Yavaş</Text>
              </TouchableOpacity>
            </View>
            {revealed ? (
              <>
                <Text style={styles.translit}>{current.transliteration}</Text>
                <Text style={styles.turkish}>{current.turkish}</Text>
                {current.note ? <Text style={styles.note}>{current.note}</Text> : null}
                <Text style={styles.trackTag}>
                  {current.track === "konusma" ? "🗣️ Ammice" : "📖 Fusha"}
                </Text>
              </>
            ) : (
              <Text style={styles.prompt}>Anlamını hatırlıyor musun?</Text>
            )}
          </View>

          {!revealed ? (
            <TouchableOpacity style={styles.revealButton} onPress={() => setRevealed(true)}>
              <Text style={styles.revealText}>Cevabı Göster</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.gradeRow}>
              <TouchableOpacity
                style={[styles.gradeButton, { backgroundColor: "#F3D9D0" }]}
                onPress={() => grade(0)}
              >
                <Text style={[styles.gradeText, { color: colors.danger }]}>Bilemedim</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.gradeButton, { backgroundColor: colors.goldSoft }]}
                onPress={() => grade(1)}
              >
                <Text style={[styles.gradeText, { color: colors.gold }]}>Zor</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.gradeButton, { backgroundColor: colors.accentSoft }]}
                onPress={() => grade(2)}
              >
                <Text style={[styles.gradeText, { color: colors.accent }]}>Bildim</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.gradeButton, { backgroundColor: colors.accent }]}
                onPress={() => grade(3)}
              >
                <Text style={[styles.gradeText, { color: "#FFFFFF" }]}>Çok Kolay</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  emptyText: { fontSize: 14, color: colors.inkSoft, textAlign: "center", lineHeight: 21 },
  cardArea: { flex: 1, padding: 20, justifyContent: "center" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 32,
    alignItems: "center",
    marginBottom: 24,
    minHeight: 280,
    justifyContent: "center",
    ...shadowLift,
  },
  arabic: { fontSize: 40, color: colors.ink, textAlign: "center", marginBottom: 12 },
  listenRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  listenChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  listenChipText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  prompt: { fontSize: 14, color: colors.inkSoft },
  translit: { fontSize: 18, color: colors.accent, fontWeight: "600", marginBottom: 8 },
  turkish: { fontSize: 22, color: colors.ink, fontWeight: "700", marginBottom: 8 },
  note: { fontSize: 13, color: colors.inkSoft, textAlign: "center", lineHeight: 19 },
  trackTag: { fontSize: 12, color: colors.inkSoft, marginTop: 12 },
  revealButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 17,
    alignItems: "center",
    ...shadow,
  },
  revealText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  gradeRow: { flexDirection: "row", gap: 8 },
  gradeButton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    ...shadow,
  },
  gradeText: { fontSize: 13, fontWeight: "700" },
});
