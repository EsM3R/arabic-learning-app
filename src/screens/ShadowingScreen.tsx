import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import Header from "../components/Header";
import Icon from "../components/Icon";
import { Button, Chip, Empty, PressableScale, Surface, Txt, Wave } from "../components/kit";
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
import { arabicText } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
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
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
        subtitle={queue.length > 0 ? `${Math.min(index + 1, queue.length)} / ${queue.length}` : "shadowing"}
        onBack={onBack}
        right={
          <Chip
            icon="repeat"
            label="3x"
            selected={loopMode}
            onPress={() => {
              setLoopMode(!loopMode);
              setPass(1);
            }}
          />
        }
      />

      {!loaded ? null : queue.length === 0 ? (
        <Empty
          icon="headphones"
          title="Gölgelenecek cümle yok"
          text="Gölgeleme, okuduğun metinlerin ve telaffuz setinin cümleleriyle çalışır. Önce bir okuma metni ya da telaffuz seti hazırlat; cümleler buraya birikir."
          action={
            <View style={{ alignSelf: "stretch", gap: 10, marginTop: 10 }}>
              <Button icon="bookOpen" label="Okuma Salonu'na git" onPress={onOpenReading} />
              <Button variant="secondary" size="md" icon="wave" label="Telaffuz Stüdyosu'na git" onPress={onOpenPronunciation} />
            </View>
          }
        />
      ) : index >= queue.length ? (
        <Empty
          icon="award"
          title="Oturum bitti"
          text={`${queue.length} cümle gölgeledin — kulağın ve ağzın bugün çalıştı.`}
          action={<Button icon="replay" label="Baştan" onPress={restart} style={{ marginTop: 10, alignSelf: "stretch" }} />}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Surface raised style={styles.card}>
            <View style={styles.sourceBadge}>
              <Icon name={item.source === "okuma" ? "bookOpen" : "wave"} size={13} color={colors.gold} />
              <Txt variant="caption" color={colors.gold} style={{ fontWeight: "800" }}>
                {item.source === "okuma" ? "Okumadan" : "Telaffuz setinden"}
                {loopMode ? `  ·  tur ${pass}/3` : ""}
              </Txt>
            </View>
            <Text
              style={[
                styles.itemText,
                item.source === "telaffuz" && styles.itemTextBig,
                // Arapça stili EN SONA gelmeli: dizide sonraki kazanır, yoksa
                // itemTextBig'in dar lineHeight'ı harekeleri kırpar.
                isRtl(pack.script) && (item.source === "telaffuz" ? styles.rtlBig : styles.rtl),
              ]}
            >
              {item.text}
            </Text>
            {!!item.translit && needsTranslit(pack.script) && (
              <Txt variant="callout" color={colors.inkSoft} style={{ fontStyle: "italic" }} center>
                {item.translit}
              </Txt>
            )}
            {!!item.turkish && (
              <Txt variant="callout" center>
                {item.turkish}
              </Txt>
            )}
          </Surface>

          {step === "hazir" && (
            <View style={styles.actions}>
              <Surface tone="soft" style={{ flexDirection: "row", gap: 10 }}>
                <Icon name="info" size={17} color={colors.accentDark} />
                <Txt variant="callout" style={{ flex: 1 }}>
                  Nasıl çalışır: cümle çalarken sen de ÜSTÜNE konuş — bitmesini bekleme, gölgesi gibi
                  takip et. {loopMode ? "Her turda hız biraz artar." : ""}
                </Txt>
              </Surface>
              <Button variant="secondary" icon="volume" label="Önce dinle" onPress={() => speakTargetWith(item.text, { rate })} />
              <Button icon="mic" label="Üstüne Konuş" onPress={() => void startShadow()} />
              <Button variant="ghost" size="md" label="Sadece kaydet (sessiz)" onPress={() => void startPlainRecord()} />
            </View>
          )}

          {step === "kaydediliyor" && (
            <View style={styles.actions}>
              <PressableScale onPress={() => void finishRecording()} accessibilityLabel="Durdur" style={styles.recording}>
                <Wave active color="#FFFFFF" />
                <Txt variant="button" color="#FFFFFF">
                  Durdur
                </Txt>
              </PressableScale>
              <Txt variant="caption" color={colors.inkSoft} center>
                konuşmaya devam et…
              </Txt>
            </View>
          )}

          {step === "dinle" && (
            <View style={styles.actions}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button variant="secondary" size="md" icon="play" label="Kaydımı dinle" onPress={playRecording} style={{ flex: 1 }} />
                <Button variant="secondary" size="md" icon="volume" label="Aslını dinle" onPress={() => speakTargetWith(item.text, { rate })} style={{ flex: 1 }} />
              </View>
              <Button
                icon="arrowRight"
                label={loopMode && pass < 3 ? `Devam → (tur ${pass + 1})` : "Devam →"}
                onPress={continueFromReview}
              />
              <Button
                variant="ghost"
                size="md"
                icon="replay"
                label="Tekrar dene"
                onPress={() => {
                  setRecordingUri(null);
                  setStep("hazir");
                }}
              />
            </View>
          )}

          {step === "not" && (
            <View style={styles.actions}>
              <Txt variant="overline" color={colors.inkSoft} center>
                Kendine not ver:
              </Txt>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(
                  [
                    { g: 0, label: "Tekrar lazım", bg: colors.dangerSoft, fg: colors.danger },
                    { g: 1, label: "İyi", bg: colors.goldSoft, fg: colors.gold },
                    { g: 2, label: "Süper", bg: colors.accentSoft, fg: colors.accentDark },
                  ] as const
                ).map((n) => (
                  <PressableScale
                    key={n.g}
                    onPress={() => void giveNote(n.g)}
                    accessibilityLabel={n.label}
                    style={{ flex: 1, height: 54, borderRadius: 16, backgroundColor: n.bg, alignItems: "center", justifyContent: "center" }}
                  >
                    <Txt variant="callout" color={n.fg} style={{ fontWeight: "800" }}>
                      {n.label}
                    </Txt>
                  </PressableScale>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 40, gap: 18 },
    card: { alignItems: "center", gap: 10, paddingVertical: 26 },
    sourceBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.goldSoft,
      borderRadius: 14,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    itemText: { fontFamily: "Manrope", fontWeight: "700", fontSize: 21, lineHeight: 30, color: colors.ink, textAlign: "center" },
    itemTextBig: { fontSize: 30, lineHeight: 40 },
    rtl: { writingDirection: "rtl", ...arabicText(26) },
    rtlBig: { writingDirection: "rtl", ...arabicText(36) },
    actions: { gap: 10 },
    recording: {
      height: 58,
      borderRadius: 18,
      backgroundColor: colors.danger,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
  });
}
