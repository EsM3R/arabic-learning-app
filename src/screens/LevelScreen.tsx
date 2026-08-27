import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Header from "../components/Header";
import { getActivePack } from "../languages";
import { colors, radius, shadow, shadowLift } from "../theme";
import { Profile } from "../types";

interface Props {
  profile: Profile;
  onBack: () => void;
}

/**
 * Seviye raporu.
 *
 * Hoca değerlendirme sırasında güçlü/zayıf yönleri ve bir özet yazıyor; bunlar
 * her derse hafıza olarak besleniyordu ama öğrenciye hiç gösterilmiyordu —
 * panelde yalnızca iki harf vardı. Öğrencinin nerede olduğunu görebileceği
 * yer burası.
 */
export default function LevelScreen({ profile, onBack }: Props) {
  const pack = getActivePack();
  const a = profile.assessment;
  const curriculum = profile.curriculum;
  const done = curriculum
    ? curriculum.modules.filter((m) => profile.completedModuleIds.includes(m.id)).length
    : 0;
  const total = curriculum?.modules.length ?? 0;

  const trackStat = (track: "konusma" | "okuma") => {
    const mods = curriculum?.modules.filter((m) => m.track === track) ?? [];
    const d = mods.filter((m) => profile.completedModuleIds.includes(m.id)).length;
    return { d, t: mods.length };
  };
  const konusma = trackStat("konusma");
  const okuma = trackStat("okuma");

  return (
    <View style={styles.container}>
      <Header
        title="Seviye Raporu"
        subtitle={`${pack.flag} ${pack.label} · ${pack.teacherName}'ın değerlendirmesi`}
        onBack={onBack}
      />
      {!a ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>Henüz değerlendirme yok</Text>
          <Text style={styles.emptyText}>
            {pack.teacherName} ile seviye tespiti yaptığında raporun burada görünecek.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.levelRow}>
            <View style={styles.levelCard}>
              <Text style={styles.levelIcon}>{pack.tracks.konusma.icon}</Text>
              <Text style={styles.levelValue}>{a.speakingLevel}</Text>
              <Text style={styles.levelLabel}>{pack.tracks.konusma.short}</Text>
              <Text style={styles.levelSub}>
                {konusma.d}/{konusma.t} modül
              </Text>
            </View>
            <View style={styles.levelCard}>
              <Text style={styles.levelIcon}>{pack.tracks.okuma.icon}</Text>
              <Text style={styles.levelValue}>{a.readingLevel}</Text>
              <Text style={styles.levelLabel}>{pack.tracks.okuma.short}</Text>
              <Text style={styles.levelSub}>
                {okuma.d}/{okuma.t} modül
              </Text>
            </View>
          </View>

          {a.summary ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{pack.teacherName} ne diyor</Text>
              <Text style={styles.summaryText}>{a.summary}</Text>
            </View>
          ) : null}

          {a.strengths?.length > 0 && (
            <View style={styles.listCard}>
              <Text style={[styles.listTitle, { color: colors.accentDark }]}>
                Güçlü yönlerin
              </Text>
              {a.strengths.map((s, i) => (
                <View key={i} style={styles.listRow}>
                  <Text style={[styles.listMark, { color: colors.accent }]}>✓</Text>
                  <Text style={styles.listText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {a.weaknesses?.length > 0 && (
            <View style={styles.listCard}>
              <Text style={[styles.listTitle, { color: colors.gold }]}>
                Üzerinde çalışılacaklar
              </Text>
              {a.weaknesses.map((w, i) => (
                <View key={i} style={styles.listRow}>
                  <Text style={[styles.listMark, { color: colors.gold }]}>→</Text>
                  <Text style={styles.listText}>{w}</Text>
                </View>
              ))}
              <Text style={styles.listNote}>
                {pack.teacherName} bunları derslere doğal biçimde serpiştiriyor; düzeldikçe
                listeden düşüyorlar.
              </Text>
            </View>
          )}

          {total > 0 && (
            <View style={styles.progressCard}>
              <Text style={styles.progressLabel}>Müfredat ilerlemesi</Text>
              <Text style={styles.progressValue}>
                {done}/{total} modül
              </Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.max((done / total) * 100, 2)}%` },
                  ]}
                />
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 18, paddingBottom: 40 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyEmoji: { fontSize: 46 },
  emptyTitle: { fontSize: 19, fontWeight: "800", color: colors.ink },
  emptyText: { fontSize: 14, color: colors.inkSoft, textAlign: "center", lineHeight: 21 },
  levelRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  levelCard: {
    flex: 1,
    backgroundColor: colors.deep,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: "center",
    ...shadowLift,
  },
  levelIcon: { fontSize: 22, marginBottom: 4 },
  levelValue: { fontSize: 30, fontWeight: "800", color: colors.goldDeep },
  levelLabel: { fontSize: 13, fontWeight: "700", color: colors.onDeep, marginTop: 2 },
  levelSub: { fontSize: 11, color: colors.onDeepSoft, marginTop: 3 },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.goldDeep,
    padding: 16,
    marginBottom: 14,
    ...shadow,
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  summaryText: { fontSize: 15, color: colors.ink, lineHeight: 23 },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
    ...shadow,
  },
  listTitle: { fontSize: 13, fontWeight: "800", marginBottom: 10 },
  listRow: { flexDirection: "row", gap: 9, marginBottom: 7, alignItems: "flex-start" },
  listMark: { fontSize: 14, fontWeight: "800", marginTop: 1 },
  listText: { flex: 1, fontSize: 14.5, color: colors.ink, lineHeight: 21 },
  listNote: { fontSize: 12, color: colors.inkSoft, lineHeight: 18, marginTop: 6 },
  progressCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadow,
  },
  progressLabel: { fontSize: 12, color: colors.inkSoft },
  progressValue: { fontSize: 20, fontWeight: "800", color: colors.ink, marginVertical: 5 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.accent },
});
