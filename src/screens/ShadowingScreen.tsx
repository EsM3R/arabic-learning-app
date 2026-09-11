import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import React, { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Header from "../components/Header";
import { getActivePack } from "../languages";
import {
  buildShadowQueue,
  noteShadow,
  PASS_RATES,
  ShadowItem,
  ShadowNote,
  ShadowNotesMap,
} from "../shadowing";
import { speakTargetWith, stopSpeaking } from "../speech";
import { recordStat } from "../statsStore";
import {
  loadPronunciationSet,
  loadReadings,
  loadShadowNotes,
  saveShadowNotes,
  touchLastActivity,
} from "../storage";
import { normalizeTarget } from "../textnorm";
import { arabicText, colors, radius, shadow, shadowLift } from "../theme";
import { isRtl, needsTranslit } from "../scripts";

interface Props {
  onBack: () => void;
  onOpenPronunciation: () => void;
  onOpenReading: () => void;
}

type ShadowStep = "hazir" | "kaydediliyor" | "dinle" | "not";

/**
 * Gölgeleme (shadowing): model konuşurken ÜSTÜNE konuşursun — dinle-sonra-
 * tekrarla değil, eşzamanlı taklit. Prosodi ve akıcılıkta dikteden ve tekrar
 * drillerinden üstün; anlamaya değil taklide dayandığı için her seviyede
 * yapılabilir. Malzeme okuduğun metinlerden ve telaffuz setinden gelir —
 * bu ekran hiç API çağırmaz.
 */
export default function ShadowingScreen({ onBack, onOpenPronunciation, onOpenReading }: Props) {
  const pack = getActivePack();
  const [queue, setQueue] = useState<ShadowItem[]>([]);
  const [notes, setNotes] = useState<ShadowNotesMap>({});
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<ShadowStep>("hazir");
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  /** 3'lü döngü varsayılan AÇIK — tekrarlı shadowing protokollerinin standardı. */
  const [loopMode, setLoopMode] = useState(true);
  const [pass, setPass] = useState(1); // 1..3; hız PASS_RATES[pass-1]
  const [loaded, setLoaded] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer();
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      const [texts, pron, savedNotes] = await Promise.all([
        loadReadings(),
        loadPronunciationSet(),
        loadShadowNotes<ShadowNotesMap>(),
      ]);
      setNotes(savedNotes);
      setQueue(buildShadowQueue(texts, pron, savedNotes, pack.script));
      setLoaded(true);
    })();
    return () => {
      stopSpeaking();
      if (stopTimer.current) clearTimeout(stopTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = queue[index];
  const rate = PASS_RATES[Math.min(pass, PASS_RATES.length) - 1];

  const scheduleStop = (ms: number) => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => void finishRecording(), ms);
  };

  const finishRecording = async () => {
    if (!recorder.isRecording) return;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      setRecordingUri(recorder.uri);
      void recordStat("shadowed");
      void touchLastActivity();
      setStep("dinle");
    } catch {
      setStep("hazir");
    }
  };

  /** Kayıt açılır, kısa süre sonra cümle çalar — öğrenci ÜSTÜNE konuşur. */
  const startShadow = async () => {
    if (!item) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Mikrofon izni gerekli", "Gölgeleme için mikrofon izni vermelisin.");
        return;
      }
      stopSpeaking();
      setRecordingUri(null);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStep("kaydediliyor");
      setTimeout(() => {
        speakTargetWith(item.text, {
          rate,
          onDone: () => scheduleStop(900), // cümle bitti → 0.9 sn kuyruk payı
          onError: () => scheduleStop(300),
        });
      }, 300);
      // Android TTS onDone hiç gelmeyebilir — emniyet kilidi:
      scheduleStop(20000);
    } catch (e) {
      Alert.alert("Kayıt hatası", e instanceof Error ? e.message : String(e));
      setStep("hazir");
    }
  };

  /** TTS'siz düz kayıt — cihazda kayıt+TTS eşzamanı sorunluysa kaçış yolu. */
  const startPlainRecord = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Mikrofon izni gerekli", "Kayıt için mikrofon izni vermelisin.");
        return;
      }
      stopSpeaking();
      setRecordingUri(null);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStep("kaydediliyor");
      scheduleStop(30000);
    } catch (e) {
      Alert.alert("Kayıt hatası", e instanceof Error ? e.message : String(e));
    }
  };

  const playRecording = () => {
    if (!recordingUri) return;
    player.replace({ uri: recordingUri });
    player.play();
  };

  const continueFromReview = () => {
    if (loopMode && pass < 3) {
      setPass(pass + 1);
      setRecordingUri(null);
      setStep("hazir");
    } else {
      setStep("not");
    }
  };

  const giveNote = async (n: ShadowNote) => {
    if (!item) return;
    const key = normalizeTarget(item.text, pack.script);
    const next = noteShadow(notes, key, n);
    setNotes(next);
    await saveShadowNotes(next);
    stopSpeaking();
    setRecordingUri(null);
    setPass(1);
    setStep("hazir");
    setIndex(index + 1); // kuyruk sonu = bitti durumu
  };

  const restart = () => {
    void (async () => {
      const [texts, pron] = await Promise.all([loadReadings(), loadPronunciationSet()]);
      // Kuyruk notlarla yeniden kurulur — "tekrar lazım" dedikleri öne gelir.
      setQueue(buildShadowQueue(texts, pron, notes, pack.script));
      setIndex(0);
      setPass(1);
      setStep("hazir");
    })();
  };

  return (
    <View style={styles.container}>
      <Header
        title="Gölgeleme"
        subtitle={
          queue.length > 0 ? `${Math.min(index + 1, queue.length)} / ${queue.length}` : "shadowing"
        }
        onBack={onBack}
        right={
          <TouchableOpacity
            style={[styles.loopChip, loopMode && styles.loopChipActive]}
            onPress={() => {
              setLoopMode(!loopMode);
              setPass(1);
            }}
          >
            <Text style={[styles.loopChipText, loopMode && styles.loopChipTextActive]}>
              🔁 3x
            </Text>
          </TouchableOpacity>
        }
      />

      {!loaded ? null : queue.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🗣️</Text>
          <Text style={styles.emptyTitle}>Gölgelenecek cümle yok</Text>
          <Text style={styles.emptyText}>
            Gölgeleme, okuduğun metinlerin ve telaffuz setinin cümleleriyle çalışır.
            Önce bir okuma metni ya da telaffuz seti hazırlat; cümleler buraya birikir.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onOpenReading}>
            <Text style={styles.primaryText}>📖 Okuma Salonu'na git</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onOpenPronunciation}>
            <Text style={styles.secondaryText}>🎙️ Telaffuz Stüdyosu'na git</Text>
          </TouchableOpacity>
        </View>
      ) : index >= queue.length ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🎉</Text>
          <Text style={styles.emptyTitle}>Oturum bitti</Text>
          <Text style={styles.emptyText}>{queue.length} cümle gölgeledin — kulağın ve ağzın bugün çalıştı.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={restart}>
            <Text style={styles.primaryText}>↺ Baştan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.card}>
            <Text style={styles.sourceBadge}>
              {item.source === "okuma" ? "📖 Okumadan" : "🎙️ Telaffuz setinden"}
              {loopMode ? `  ·  tur ${pass}/3` : ""}
            </Text>
            <Text
              style={[
                styles.itemText,
                item.source === "telaffuz" && styles.itemTextBig,
                // Arapça stili EN SONA gelmeli: dizide sonraki kazanır, yoksa
                // itemTextBig'in dar lineHeight'ı harekeleri kırpar.
                isRtl(pack.script) &&
                  (item.source === "telaffuz" ? styles.rtlBig : styles.rtl),
              ]}
            >
              {item.text}
            </Text>
            {!!item.translit && needsTranslit(pack.script) && (
              <Text style={styles.translit}>{item.translit}</Text>
            )}
            {!!item.turkish && <Text style={styles.turkish}>{item.turkish}</Text>}
          </View>

          {step === "hazir" && (
            <>
              <View style={styles.tipBox}>
                <Text style={styles.tipText}>
                  Nasıl çalışır: cümle çalarken sen de ÜSTÜNE konuş — bitmesini bekleme,
                  gölgesi gibi takip et. {loopMode ? "Her turda hız biraz artar." : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.listenButton}
                onPress={() => speakTargetWith(item.text, { rate })}
              >
                <Text style={styles.listenText}>🔊 Önce dinle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.recordButton} onPress={() => void startShadow()}>
                <Text style={styles.recordText}>🎙️ Üstüne Konuş</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.plainButton} onPress={() => void startPlainRecord()}>
                <Text style={styles.plainText}>🎤 Sadece kaydet (sessiz)</Text>
              </TouchableOpacity>
            </>
          )}

          {step === "kaydediliyor" && (
            <>
              <TouchableOpacity
                style={[styles.recordButton, styles.recording]}
                onPress={() => void finishRecording()}
              >
                <Text style={styles.recordText}>⏹ Durdur</Text>
              </TouchableOpacity>
              <Text style={styles.recHint}>konuşmaya devam et…</Text>
            </>
          )}

          {step === "dinle" && (
            <>
              <TouchableOpacity style={styles.listenButton} onPress={playRecording}>
                <Text style={styles.listenText}>▶️ Kaydımı dinle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.listenButton}
                onPress={() => speakTargetWith(item.text, { rate })}
              >
                <Text style={styles.listenText}>🔊 Aslını dinle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.plainButton}
                onPress={() => {
                  setRecordingUri(null);
                  setStep("hazir");
                }}
              >
                <Text style={styles.plainText}>↺ Tekrar dene</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.recordButton} onPress={continueFromReview}>
                <Text style={styles.recordText}>
                  {loopMode && pass < 3 ? `Devam → (tur ${pass + 1})` : "Devam →"}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "not" && (
            <>
              <Text style={styles.noteLabel}>Kendine not ver:</Text>
              <View style={styles.noteRow}>
                <TouchableOpacity style={styles.noteChip} onPress={() => void giveNote(0)}>
                  <Text style={styles.noteChipText}>😕 Tekrar lazım</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.noteChip} onPress={() => void giveNote(1)}>
                  <Text style={styles.noteChipText}>🙂 İyi</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.noteChip} onPress={() => void giveNote(2)}>
                  <Text style={styles.noteChipText}>😎 Süper</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
  body: { padding: 20, paddingBottom: 40 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  emptyText: { fontSize: 13.5, color: colors.inkSoft, textAlign: "center", lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    ...shadowLift,
  },
  sourceBadge: { fontSize: 11.5, color: colors.inkFaint, fontWeight: "700", marginBottom: 12 },
  itemText: { fontSize: 24, lineHeight: 40, color: colors.ink, textAlign: "center" },
  itemTextBig: { fontSize: 32, lineHeight: 52 },
  // writingDirection Android'de ölü koddu (yön BiDi ile içerikten çıkar);
  // yerine gerçek Arapça fontu ve kırpmayan satır yüksekliği. Hizalama
  // kartta ortalı kalır.
  rtl: { ...arabicText(24), textAlign: "center" },
  rtlBig: { ...arabicText(32), textAlign: "center" },
  translit: { fontSize: 15, color: colors.accent, fontWeight: "600", marginTop: 8 },
  turkish: { fontSize: 14, color: colors.inkSoft, marginTop: 6, textAlign: "center" },
  tipBox: {
    backgroundColor: colors.goldSoft,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  tipText: { fontSize: 12.5, color: colors.ink, lineHeight: 18 },
  listenButton: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
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
  recHint: { textAlign: "center", color: colors.inkSoft, fontSize: 13 },
  plainButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 10,
  },
  plainText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  noteLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
    marginBottom: 10,
  },
  noteRow: { flexDirection: "row", gap: 8 },
  noteChip: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    ...shadow,
  },
  noteChipText: { fontSize: 13, fontWeight: "700", color: colors.ink },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 15,
    paddingHorizontal: 28,
    alignItems: "center",
    marginTop: 6,
    ...shadow,
  },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  secondaryButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  secondaryText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  loopChip: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  loopChipActive: { backgroundColor: colors.deep, borderColor: colors.deep },
  loopChipText: { fontSize: 12, fontWeight: "800", color: colors.inkSoft },
  loopChipTextActive: { color: colors.onDeep },
});
