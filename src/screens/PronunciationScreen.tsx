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
import { effectivePlayIndex, pickVoiceVariant } from "../hvpt";
import { getActivePack } from "../languages";
import { strugglingCards } from "../srs";
import { getTargetVoiceIds, speakTarget, speakTargetWith, stopSpeaking } from "../speech";
import { judgeSpeech, SpeechAttempt } from "../speechinput";
import { useDictation } from "../useDictation";
import { recordStat } from "../statsStore";
import { loadPronunciationSet, loadVocab, savePronunciationSet, touchLastActivity } from "../storage";
import { arabicText, colors, radius, shadow, shadowLift } from "../theme";
import { Profile, PronunciationSet } from "../types";

interface Props {
  profile: Profile;
  onBack: () => void;
}

/**
 * Telaffuz Stüdyosu — HVPT düzeni: önce KULAK turu (ayırt etme: iki benzer
 * kelimeden hangisi çalındı?), sonra kayıt turu (dinle-kaydet-karşılaştır).
 * Araştırma şartı: algı üretimden önce eğitilir ve uyaran çeşitli sunulur —
 * cihazdaki farklı TTS sesleri döndürülür, tek ses varsa hız değişir.
 */
type PronPhase = "ayirt" | "ozet" | "kayit";

export default function PronunciationScreen({ profile, onBack }: Props) {
  const [set, setSet] = useState<PronunciationSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  /** Sesli denemenin cihaz hükmü. */
  const [attempt, setAttempt] = useState<SpeechAttempt | null>(null);
  const [phase, setPhase] = useState<PronPhase>("kayit");
  const [pairIndex, setPairIndex] = useState(0);
  const [picked, setPicked] = useState<0 | 1 | null>(null);
  const [score, setScore] = useState(0);
  /** Kulak turu kaçıncı kez oynanıyor — cevap tarafı her turda çevrilir (ezber kırma). */
  const [round, setRound] = useState(0);
  const [voiceIds, setVoiceIds] = useState<string[]>([]);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer();

  const startWithSet = (s: PronunciationSet) => {
    setSet(s);
    setIndex(0);
    setRecordingUri(null);
    setPairIndex(0);
    setPicked(null);
    setScore(0);
    setPhase(s.minimalPairs && s.minimalPairs.length > 0 ? "ayirt" : "kayit");
  };

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
      setRound(0);
      startWithSet(newSet);
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
      const [saved, ids] = await Promise.all([loadPronunciationSet(), getTargetVoiceIds()]);
      setVoiceIds(ids);
      if (saved && saved.items.length > 0) startWithSet(saved);
      setLoading(false);
    })();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = set?.items[index];
  const pairs = set?.minimalPairs ?? [];
  const pair = pairs[pairIndex];
  /** Bu soruda gerçekte çalınan taraf (tur sayısına göre çevrilmiş). */
  const playSide = pair ? effectivePlayIndex(pair.playIndex, round) : 0;

  const playPair = () => {
    if (!pair) return;
    const v = pickVoiceVariant(voiceIds, pairIndex + round * pairs.length);
    speakTargetWith(pair[playSide === 0 ? "a" : "b"].word, { voiceId: v.voiceId, rate: v.rate });
  };

  const pickSide = (side: 0 | 1) => {
    if (picked !== null || !pair) return;
    setPicked(side);
    void recordStat("discrimination");
    if (side === playSide) {
      setScore((s) => s + 1);
      void recordStat("discriminationCorrect");
    }
    void touchLastActivity();
  };

  const nextPair = () => {
    stopSpeaking();
    setPicked(null);
    if (pairIndex + 1 < pairs.length) setPairIndex(pairIndex + 1);
    else setPhase("ozet");
  };

  const restartEarTraining = () => {
    stopSpeaking();
    setRound((r) => r + 1); // cevaplar çevrilir — ezberle geçilmez
    setPairIndex(0);
    setPicked(null);
    setScore(0);
    setPhase("ayirt");
  };

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

  /**
   * Sesli deneme: cihazın tanıması söylediğini yazıya çevirir, hedefle
   * karşılaştırılır. Bu bir telaffuz puanı değil "makine seni doğru duydu
   * mu" ölçüsüdür — ama uygulamanın ilk kez ÖĞRENCİYİ DUYDUĞU yer burası.
   */
  const startCheck = () => {
    stopSpeaking();
    setAttempt(null);
    dictation.start();
  };

  const dictation = useDictation({
    onResult: (said) => {
      const item = set?.items[index];
      if (!item) return;
      const verdict = judgeSpeech(
        item.arabic,
        item.transliteration,
        said,
        getActivePack().scriptExtract
      );
      setAttempt(verdict);
      void recordStat("spoken");
      if (verdict.verdict === "dogru") void recordStat("spokenCorrect");
      void touchLastActivity();
    },
  });

  const goTo = (next: number) => {
    stopSpeaking();
    setRecordingUri(null);
    setAttempt(null);
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
        subtitle={
          set
            ? phase === "ayirt"
              ? `🎧 kulak turu ${pairIndex + 1} / ${pairs.length}`
              : phase === "ozet"
                ? "kulak turu bitti"
                : `🎙️ kayıt turu ${index + 1} / ${set.items.length}`
            : "hazırlanıyor…"
        }
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
      ) : !set || !item ? (
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
      ) : phase === "ayirt" && pair ? (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.tipBox}>
            <Text style={styles.tipTitle}>🎧 {pair.focus}</Text>
            <Text style={styles.tipText}>
              Dinle ve hangi kelimenin çalındığını seç. Bir sesi duyup ayırt edemeyen onu
              üretemez — önce kulak.
            </Text>
          </View>

          <TouchableOpacity style={styles.recordButton} onPress={playPair}>
            <Text style={styles.recordText}>🔊 Dinle</Text>
          </TouchableOpacity>

          <View style={styles.pairRow}>
            {([0, 1] as const).map((side) => {
              const s = side === 0 ? pair.a : pair.b;
              const isAnswer = side === playSide;
              const chosen = picked === side;
              const show = picked !== null;
              return (
                <TouchableOpacity
                  key={side}
                  style={[
                    styles.pairCard,
                    show && isAnswer && styles.pairCorrect,
                    show && chosen && !isAnswer && styles.pairWrong,
                  ]}
                  disabled={picked !== null}
                  onPress={() => pickSide(side)}
                >
                  <Text style={styles.pairWord}>{s.word}</Text>
                  <Text style={styles.pairTranslit}>{s.translit}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {picked !== null && (
            <>
              <Text style={picked === playSide ? styles.pairResultOk : styles.pairResultNo}>
                {picked === playSide
                  ? "✅ Doğru!"
                  : `❌ Çalınan: ${(playSide === 0 ? pair.a : pair.b).word}`}
              </Text>
              <View style={styles.tipBox}>
                <Text style={styles.tipTitle}>💡 İpucu</Text>
                <Text style={styles.tipText}>{pair.tip}</Text>
              </View>
              <TouchableOpacity style={styles.recordButton} onPress={nextPair}>
                <Text style={styles.recordText}>Sonraki ›</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      ) : phase === "ozet" ? (
        <View style={styles.loading}>
          <Text style={styles.errEmoji}>🎧</Text>
          <Text style={styles.errTitle}>Kulak turu bitti</Text>
          <Text style={styles.errText}>
            {score} / {pairs.length} doğru ayırt ettin.
            {score < pairs.length ? " Karıştırdıkların normal — kulak tekrarla eğitilir." : " Harika kulak!"}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => setPhase("kayit")}>
            <Text style={styles.retryText}>🎙️ Kayıt turuna geç</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.playbackButton} onPress={restartEarTraining}>
            <Text style={styles.playbackText}>↺ Kulak turunu tekrarla</Text>
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

          {/* Denetimli deneme: söylediğin yazıya çevrilip hedefle karşılaştırılır. */}
          <TouchableOpacity
            style={[styles.recordButton, dictation.listening && styles.recording]}
            onPressIn={startCheck}
            onPressOut={() => dictation.stop()}
          >
            <Text style={styles.recordText}>
              {dictation.listening
                ? "● Dinliyorum — bırakınca biter"
                : "🎙️ Basılı tut ve söyle"}
            </Text>
          </TouchableOpacity>
          {dictation.listening && (
            <Text style={styles.listeningText}>{dictation.partial || "Dinliyorum…"}</Text>
          )}
          {dictation.error && <Text style={styles.micErrorText}>{dictation.error}</Text>}
          {attempt && !dictation.listening && (
            <View
              style={[
                styles.verdictBox,
                attempt.verdict === "dogru"
                  ? styles.verdictOk
                  : attempt.verdict === "yakin"
                    ? styles.verdictNear
                    : styles.verdictFar,
              ]}
            >
              <Text style={styles.verdictText}>{attempt.message}</Text>
              {attempt.verdict !== "dogru" && (
                <Text style={styles.verdictHint}>
                  Not: tanıma fusha ağırlıklıdır; ammice söyleyişte şaşabilir — kendi
                  kaydını dinlemek de bir ölçüdür.
                </Text>
              )}
            </View>
          )}

          {/* Kendi sesini duymak ayrı bir egzersiz: kayıt yolu duruyor. */}
          <TouchableOpacity
            style={[styles.playbackButton, recorder.isRecording && styles.recording]}
            onPress={() => void toggleRecord()}
          >
            <Text style={styles.playbackText}>
              {recorder.isRecording ? "⏹ Kaydı Durdur" : "🎧 Kendini kaydet ve dinle"}
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
  arabic: { ...arabicText(42), color: colors.ink, textAlign: "center", marginBottom: 12 },
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
  listeningText: {
    fontSize: 14,
    color: colors.gold,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 10,
  },
  micErrorText: {
    fontSize: 12.5,
    color: colors.danger,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 18,
  },
  verdictBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 13,
    marginTop: 12,
  },
  verdictOk: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  verdictNear: { backgroundColor: colors.goldSoft, borderColor: colors.goldDeep },
  verdictFar: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  verdictText: { fontSize: 14, color: colors.ink, fontWeight: "700", lineHeight: 20 },
  verdictHint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 7, lineHeight: 17 },
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
  pairRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  pairCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 24,
    paddingHorizontal: 10,
    alignItems: "center",
    ...shadow,
  },
  pairCorrect: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pairWrong: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  pairWord: { fontSize: 28, color: colors.ink, textAlign: "center", marginBottom: 8 },
  pairTranslit: { fontSize: 14, color: colors.accent, fontWeight: "600" },
  pairResultOk: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.accentDark,
    textAlign: "center",
    marginBottom: 10,
  },
  pairResultNo: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.danger,
    textAlign: "center",
    marginBottom: 10,
  },
});
