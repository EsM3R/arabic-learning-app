import React from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors } from "../theme";
import { CurriculumModule, Profile, Track } from "../types";

interface Props {
  profile: Profile;
  onOpenModule: (module: CurriculumModule) => void;
  onFreeChat: () => void;
  onReset: () => void;
}

const TRACK_META: Record<Track, { title: string; subtitle: string }> = {
  konusma: { title: "🗣️ Konuşma — Şami Ammicesi", subtitle: "Suriyeli arkadaşlarınla akıcı sohbet" },
  okuma: { title: "📖 Okuma — Fusha", subtitle: "Profesyonel okuma ve anlama" },
};

export default function DashboardScreen({ profile, onOpenModule, onFreeChat, onReset }: Props) {
  const { assessment, curriculum, completedModuleIds } = profile;
  const tracks: Track[] = ["konusma", "okuma"];

  const confirmReset = () => {
    Alert.alert("Sıfırla", "Tüm ilerleme ve ayarlar silinecek. Emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Sıfırla", style: "destructive", onPress: onReset },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.greeting}>Merhaba {profile.name} 👋</Text>
        <TouchableOpacity onPress={confirmReset}>
          <Text style={styles.resetText}>Sıfırla</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.levelCard}>
        <View style={styles.levelBox}>
          <Text style={styles.levelValue}>{assessment?.speakingLevel ?? "-"}</Text>
          <Text style={styles.levelLabel}>Konuşma (Ammice)</Text>
        </View>
        <View style={styles.levelDivider} />
        <View style={styles.levelBox}>
          <Text style={styles.levelValue}>{assessment?.readingLevel ?? "-"}</Text>
          <Text style={styles.levelLabel}>Okuma (Fusha)</Text>
        </View>
      </View>
      {assessment?.summary ? <Text style={styles.summary}>{assessment.summary}</Text> : null}

      <TouchableOpacity style={styles.chatButton} onPress={onFreeChat}>
        <Text style={styles.chatButtonText}>💬 Üstaz ile Serbest Sohbet</Text>
      </TouchableOpacity>

      {tracks.map((track) => {
        const modules = curriculum?.modules.filter((m) => m.track === track) ?? [];
        return (
          <View key={track} style={styles.trackSection}>
            <Text style={styles.trackTitle}>{TRACK_META[track].title}</Text>
            <Text style={styles.trackSubtitle}>{TRACK_META[track].subtitle}</Text>
            {modules.map((module, index) => {
              const done = completedModuleIds.includes(module.id);
              return (
                <TouchableOpacity
                  key={module.id}
                  style={[styles.moduleCard, done && styles.moduleDone]}
                  onPress={() => onOpenModule(module)}
                >
                  <View style={styles.moduleBadge}>
                    <Text style={styles.moduleBadgeText}>{done ? "✓" : index + 1}</Text>
                  </View>
                  <View style={styles.moduleBody}>
                    <Text style={styles.moduleTitle}>{module.title}</Text>
                    <Text style={styles.moduleDesc} numberOfLines={2}>
                      {module.description}
                    </Text>
                  </View>
                  <Text style={styles.moduleLevel}>{module.level}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 64, paddingBottom: 40 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.ink },
  resetText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  levelCard: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
    marginBottom: 12,
  },
  levelBox: { flex: 1, alignItems: "center" },
  levelDivider: { width: 1, backgroundColor: colors.border },
  levelValue: { fontSize: 28, fontWeight: "800", color: colors.accent },
  levelLabel: { fontSize: 12, color: colors.inkSoft, marginTop: 4 },
  summary: { fontSize: 14, color: colors.inkSoft, lineHeight: 21, marginBottom: 16 },
  chatButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 24,
  },
  chatButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  trackSection: { marginBottom: 24 },
  trackTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  trackSubtitle: { fontSize: 13, color: colors.inkSoft, marginBottom: 12, marginTop: 2 },
  moduleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  moduleDone: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  moduleBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleBadgeText: { color: colors.gold, fontWeight: "800", fontSize: 14 },
  moduleBody: { flex: 1 },
  moduleTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  moduleDesc: { fontSize: 12, color: colors.inkSoft, marginTop: 2, lineHeight: 17 },
  moduleLevel: { fontSize: 12, fontWeight: "700", color: colors.accent },
});
