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
import Header from "../components/Header";
import { getActivePack } from "../languages";
import { strugglingCards } from "../srs";
import { speakTarget, stopSpeaking } from "../speech";
import { loadPronunciationSet, loadVocab, savePronunciationSet } from "../storage";
import { colors, radius, shadow, shadowLift } from "../theme";
import { Profile, PronunciationSet } from "../types";

interface Props {
  profile: Profile;
  onBack: () => void;
}

export default function PronunciationScreen({ profile, onBack }: Props) {
  const [set, setSet] = useState<PronunciationSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer();

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const vocab = await loadVocab();
      const newSet = await generatePronunciationSet(
        profile,
        vocab.map((c) => c.arabic),
        strugglingCards(vocab, 8).map((c) => c.arabic)
      );
      await savePronunciationSet(newSet);
      setSet(newSet);
      setIndex(0);
      setRecordingUri(null);
    } catch (e) {
      // Alert kapanınca ekran sonsuza kadar "hazırlanıyor" yazmasın:
      // hatayı ekranda tut ve tekrar deneme yolu sun.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      // Ekranı açmak tek başına para harcamamalı: kayıtlı set varsa onu aç,
      // yoksa üretmeden önce kullanıcıya sor.
      const saved = await loadPronunciationSet();
      if (saved && saved.items.length > 0) setSet(saved);
      setLoading(false);
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
    Alert.alert("Yeni set", `${getActivePack().teacherName} sana yeni bir telaffuz seti hazırlasın mı?`, [
      { text: "Vazgeç", style: "cancel" },
      { text: "Evet, hazırlasın", onPress: () => void generate() },
    ]);
  };

  return (
    <View style={styles.container}>
      <Header
        title="Telaffuz Stüdyosu"
        subtitle={set ? `${index + 1} / ${set.items.length}` : "hazırlanıyor…"}
        onBack={onBack}
        right={
          <TouchableOpacity onPress={newSet} style={styles.newSetButton} disabled={loading}>
            <Text style={styles.newSetText}>✨ Yeni Set</Text>
          </TouchableOpacity>
        }
      />

      {error && !loading ? (
        <View style={styles.loading}>
          <Text style={styles.errEmoji}>😕</Text>
          <Text style={styles.errTitle}>Telaffuz seti hazırlanamadı</Text>
          <Text style={styles.errText} selectable>
            {error}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void generate()}>
            <Text style={styles.retryText}>Tekrar dene</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>
            {getActivePack().teacherName} telaffuz setini hazırlıyor…
          </Text>
        </View>
      ) : !item ? (
        <View style={styles.loading}>
          <Text style={styles.errEmoji}>🎙️</Text>
          <Text style={styles.errTitle}>Telaffuz setin hazır değil</Text>
          <Text style={styles.errText}>
            {getActivePack().teacherName} senin seviyene ve kelime defterine göre bir
            alıştırma seti hazırlasın mı? Bu bir API isteği harcar (yaklaşık birkaç lira).
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void generate()}>
            <Text style={styles.retryText}>Set hazırla</Text>
          </TouchableOpacity>
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
              onPress={() => speakTarget(item.arabic)}
            >
              <Text style={styles.listenText}>🔊 Dinle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.listenButton}
              onPress={() => speakTarget(item.arabic, true)}
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
  newSetButton: {
    backgroundColor: colors.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newSetText: { color: colors.gold, fontWeight: "700", fontSize: 12 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { color: colors.inkSoft, fontSize: 14 },
  errEmoji: { fontSize: 38 },
  errTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  errText: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 28,
  },
  retryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 36,
    marginTop: 6,
    ...shadow,
  },
  retryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  body: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
    alignItems: "center",
    marginBottom: 14,
    ...shadowLift,
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
    borderRadius: radius.lg,
    paddingVertical: 17,
    alignItems: "center",
    marginBottom: 10,
    ...shadow,
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
