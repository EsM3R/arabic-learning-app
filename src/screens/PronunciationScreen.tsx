import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { generatePronunciationSet } from "../claude";
import { speakArabic, stopSpeaking } from "../speech";
import { loadPronunciationSet, loadVocab, savePronunciationSet } from "../storage";
import { colors } from "../theme";
import { Profile, PronunciationSet } from "../types";

interface Props {
  profile: Profile;
  onBack: () => void;
}

export default function PronunciationScreen({ profile, onBack }: Props) {
  const [set, setSet] = useState<PronunciationSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer();

  const generate = async () => {
    setLoading(true);
    try {
      const vocab = await loadVocab();
      const newSet = await generatePronunciationSet(
        profile.apiKey,
        profile.name,
        profile.assessment,
        vocab.map((c) => c.arabic)
      );
      await savePronunciationSet(newSet);
      setSet(newSet);
      setIndex(0);
      setRecordingUri(null);
    } catch (e) {
      Alert.alert("Hata", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const saved = await loadPronunciationSet();
      if (saved && saved.items.length > 0) {
        setSet(saved);
        setLoading(false);
      } else {
        await generate();
      }
    })();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = set?.items[index];

  const toggleRecord = async () => {
    try {
      if (recorder.isRecording) {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        setRecordingUri(recorder.uri);
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Mikrofon izni gerekli", "Telaffuz kaydı için mikrofon izni vermelisin.");
        return;
      }
      stopSpeaking();
      setRecordingUri(null);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      Alert.alert("Kayıt hatası", e instanceof Error ? e.message : String(e));
    }
  };

  const playRecording = () => {
    if (!recordingUri) return;
    player.replace({ uri: recordingUri });
    player.play();
  };

  const goTo = (next: number) => {
    stopSpeaking();
    setRecordingUri(null);
    setIndex(next);
  };

  const newSet = () => {
    Alert.alert("Yeni set", "Üstaz sana yeni bir telaffuz seti hazırlasın mı?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Evet, hazırlasın", onPress: () => void generate() },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Telaffuz Stüdyosu</Text>
          <Text style={styles.headerSub}>
            {set ? `${index + 1} / ${set.items.length}` : "hazırlanıyor…"}
          </Text>
        </View>
        <TouchableOpacity onPress={newSet} style={styles.newSetButton} disabled={loading}>
          <Text style={styles.newSetText}>✨ Yeni Set</Text>
        </TouchableOpacity>
      </View>

      {loading || !item ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Üstaz telaffuz setini hazırlıyor…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.card}>
            <Text style={styles.arabic}>{item.arabic}</Text>
            <Text style={styles.translit}>{item.transliteration}</Text>
            <Text style={styles.turkish}>{item.turkish}</Text>
          </View>

          <View style={styles.tipBox}>
            <Text style={styles.tipTitle}>💡 Telaffuz ipucu</Text>
            <Text style={styles.tipText}>{item.tip}</Text>
          </View>

          <View style={styles.listenRow}>
            <TouchableOpacity
              style={styles.listenButton}
              onPress={() => speakArabic(item.arabic)}
            >
              <Text style={styles.listenText}>🔊 Dinle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.listenButton}
              onPress={() => speakArabic(item.arabic, true)}
            >
              <Text style={styles.listenText}>🐢 Yavaş</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.recordButton, recorder.isRecording && styles.recording]}
            onPress={() => void toggleRecord()}
          >
            <Text style={styles.recordText}>
              {recorder.isRecording ? "⏹ Kaydı Durdur" : "🎙️ Kendini Kaydet"}
            </Text>
          </TouchableOpacity>

          {recordingUri && !recorder.isRecording && (
            <TouchableOpacity style={styles.playbackButton} onPress={playRecording}>
              <Text style={styles.playbackText}>▶️ Kaydımı Dinle ve Karşılaştır</Text>
            </TouchableOpacity>
          )}

          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navButton, index === 0 && styles.navDisabled]}
              onPress={() => goTo(index - 1)}
              disabled={index === 0}
            >
              <Text style={styles.navText}>‹ Önceki</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navButton, index >= set!.items.length - 1 && styles.navDisabled]}
              onPress={() => goTo(index + 1)}
              disabled={index >= set!.items.length - 1}
            >
              <Text style={styles.navText}>Sonraki ›</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  newSetButton: {
    backgroundColor: colors.goldSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  newSetText: { color: colors.gold, fontWeight: "700", fontSize: 12 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { color: colors.inkSoft, fontSize: 14 },
  body: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
    alignItems: "center",
    marginBottom: 14,
  },
  arabic: { fontSize: 42, color: colors.ink, textAlign: "center", marginBottom: 12 },
  translit: { fontSize: 18, color: colors.accent, fontWeight: "600", marginBottom: 6 },
  turkish: { fontSize: 16, color: colors.inkSoft },
  tipBox: {
    backgroundColor: colors.goldSoft,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  tipTitle: { fontSize: 13, fontWeight: "700", color: colors.gold, marginBottom: 4 },
  tipText: { fontSize: 13, color: colors.ink, lineHeight: 20 },
  listenRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  listenButton: {
    flex: 1,
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  listenText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  recordButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  recording: { backgroundColor: colors.danger },
  recordText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  playbackButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  playbackText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  navRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  navButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  navDisabled: { opacity: 0.4 },
  navText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
});
