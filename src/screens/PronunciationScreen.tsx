import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import React, { useEffect, useMemo, useState } from "react";
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
import Icon from "../components/Icon";
import { Button, Chip, Empty, PressableScale, Surface, TeacherAvatar, Txt, Wave } from "../components/kit";
import { ltrLine } from "../richtext";
import { effectivePlayIndex, pickVoiceVariant } from "../hvpt";
import { getActivePack } from "../languages";
import { strugglingCards } from "../srs";
import { getTargetVoiceIds, speakTarget, speakTargetWith, stopSpeaking } from "../speech";
import { judgeSpeech, RECOGNITION_NOTE, SpeechAttempt } from "../speechinput";
import { useDictation } from "../useDictation";
import { recordStat } from "../statsStore";
import { loadPronunciationSet, loadVocab, savePronunciationSet, touchLastActivity } from "../storage";
import { targetText } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
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
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
        getActivePack().script
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

  const pk = getActivePack();
  const tip = (title: string, text: string, icon: "bulb" | "headphones") => (
    <Surface tone="gold" style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={icon} size={16} color={colors.gold} />
        <Txt variant="headline" color={colors.gold} style={{ fontSize: 14 }}>
          {title}
        </Txt>
      </View>
      <Txt variant="callout">{ltrLine(text)}</Txt>
    </Surface>
  );

  return (
    <View style={styles.container}>
      <Header
        title="Telaffuz Stüdyosu"
        subtitle={
          set
            ? phase === "ayirt"
              ? `kulak turu ${pairIndex + 1} / ${pairs.length}`
              : phase === "ozet"
                ? "kulak turu bitti"
                : `kayıt turu ${index + 1} / ${set.items.length}`
            : "hazırlanıyor…"
        }
        onBack={onBack}
        right={<Button size="sm" variant="secondary" icon="sparkles" label="Yeni Set" onPress={newSet} disabled={loading} />}
      />

      {error && !loading ? (
        <Empty
          icon="alert"
          title="Telaffuz seti hazırlanamadı"
          text={error}
          action={<Button icon="refresh" label="Tekrar dene" onPress={() => void generate()} style={{ marginTop: 10, alignSelf: "stretch" }} />}
        />
      ) : loading ? (
        <View style={styles.center}>
          <TeacherAvatar size={76} speaking />
          <Txt variant="callout" color={colors.inkSoft} center>
            {pk.teacherName} telaffuz setini hazırlıyor…
          </Txt>
        </View>
      ) : !set || !item ? (
        <Empty
          icon="wave"
          title="Telaffuz setin hazır değil"
          text={`${pk.teacherName} senin seviyene ve kelime defterine göre bir alıştırma seti hazırlasın mı? Bu bir API isteği harcar (yaklaşık birkaç lira).`}
          action={<Button icon="sparkles" label="Set hazırla" onPress={() => void generate()} style={{ marginTop: 10, alignSelf: "stretch" }} />}
        />
      ) : phase === "ayirt" && pair ? (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Surface tone="soft" style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="ear" size={17} color={colors.accentDark} />
              <Txt variant="headline" color={colors.accentDark} style={{ fontSize: 15 }}>
                {pair.focus}
              </Txt>
            </View>
            <Txt variant="callout">
              Dinle ve hangi kelimenin çalındığını seç. Bir sesi duyup ayırt edemeyen onu üretemez — önce kulak.
            </Txt>
          </Surface>

          <PressableScale onPress={playPair} accessibilityLabel="Dinle" style={styles.bigListen}>
            <Icon name="volume" size={30} color={colors.onGold} />
          </PressableScale>

          <View style={styles.pairRow}>
            {([0, 1] as const).map((side) => {
              const sd = side === 0 ? pair.a : pair.b;
              const isAnswer = side === playSide;
              const chosen = picked === side;
              const show = picked !== null;
              return (
                <PressableScale
                  key={side}
                  style={[
                    styles.pairCard,
                    show && isAnswer && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
                    show && chosen && !isAnswer && { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
                  ]}
                  disabled={picked !== null}
                  onPress={() => pickSide(side)}
                  accessibilityLabel={sd.word}
                >
                  <Text style={[styles.pairWord, targetText(34, pk.script)]}>{sd.word}</Text>
                  <Txt variant="caption" color={colors.inkSoft}>
                    {sd.translit}
                  </Txt>
                </PressableScale>
              );
            })}
          </View>

          {picked !== null && (
            <>
              <View style={[styles.result, { backgroundColor: picked === playSide ? colors.accentSoft : colors.dangerSoft }]}>
                <Icon
                  name={picked === playSide ? "check" : "close"}
                  size={18}
                  color={picked === playSide ? colors.accentDark : colors.danger}
                  strokeWidth={2.6}
                />
                <Txt variant="bodyStrong" color={picked === playSide ? colors.accentDark : colors.danger}>
                  {picked === playSide ? "Doğru!" : `Çalınan: ${(playSide === 0 ? pair.a : pair.b).word}`}
                </Txt>
              </View>
              {tip("İpucu", pair.tip, "bulb")}
              <Button icon="arrowRight" label="Sonraki ›" onPress={nextPair} />
            </>
          )}
        </ScrollView>
      ) : phase === "ozet" ? (
        <Empty
          icon="headphones"
          title="Kulak turu bitti"
          text={`${score} / ${pairs.length} doğru ayırt ettin.${score < pairs.length ? " Karıştırdıkların normal — kulak tekrarla eğitilir." : " Harika kulak!"}`}
          action={
            <View style={{ alignSelf: "stretch", gap: 10, marginTop: 10 }}>
              <Button icon="mic" label="Kayıt turuna geç" onPress={() => setPhase("kayit")} />
              <Button variant="secondary" size="md" icon="replay" label="Kulak turunu tekrarla" onPress={restartEarTraining} />
            </View>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Surface raised style={styles.card}>
            <Text style={[styles.targetWord, targetText(44, pk.script)]}>{item.arabic}</Text>
            {!!item.transliteration && (
              <Txt variant="callout" color={colors.inkSoft} style={{ fontStyle: "italic" }}>
                {item.transliteration}
              </Txt>
            )}
            <Txt variant="title3">{item.turkish}</Txt>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <Chip icon="volume" label="Dinle" onPress={() => speakTarget(item.arabic)} />
              <Chip icon="slow" label="Yavaş" onPress={() => speakTarget(item.arabic, true)} />
            </View>
          </Surface>

          {tip("Telaffuz ipucu", item.tip, "bulb")}

          {/* Denetimli deneme: söylediğin yazıya çevrilip hedefle karşılaştırılır. */}
          <PressableScale
            onPressIn={startCheck}
            onPressOut={() => dictation.stop()}
            accessibilityLabel="Basılı tut ve söyle"
            style={[styles.holdMic, dictation.listening && { backgroundColor: colors.danger }]}
          >
            {dictation.listening ? <Wave active color="#FFFFFF" /> : <Icon name="mic" size={22} color="#FFFFFF" />}
            <Txt variant="button" color="#FFFFFF">
              {dictation.listening ? "Dinliyorum — bırakınca biter" : "Basılı tut ve söyle"}
            </Txt>
          </PressableScale>
          {dictation.listening && (
            <Txt variant="callout" color={colors.inkSoft} center style={{ fontStyle: "italic" }}>
              {dictation.partial || "Dinliyorum…"}
            </Txt>
          )}
          {dictation.error && (
            <Txt variant="caption" color={colors.danger} center>
              {dictation.error}
            </Txt>
          )}
          {attempt && !dictation.listening && (
            <View
              style={[
                styles.verdictBox,
                {
                  backgroundColor:
                    attempt.verdict === "dogru" ? colors.accentSoft : attempt.verdict === "yakin" ? colors.goldSoft : colors.dangerSoft,
                },
              ]}
            >
              <Txt variant="bodyStrong">
                {attempt.message}
              </Txt>
              <Txt variant="caption" color={colors.inkSoft}>
                {RECOGNITION_NOTE}
              </Txt>
              {!!pk.asrNote && (
                <Txt variant="caption" color={colors.inkSoft}>
                  {pk.asrNote}
                </Txt>
              )}
            </View>
          )}

          {/* Kendi sesini duymak ayrı bir egzersiz: kayıt yolu duruyor. */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              variant={recorder.isRecording ? "danger" : "secondary"}
              size="md"
              icon={recorder.isRecording ? "stop" : "headphones"}
              label={recorder.isRecording ? "Kaydı Durdur" : "Kendini kaydet"}
              onPress={() => void toggleRecord()}
              style={{ flex: 1 }}
            />
            {recordingUri && !recorder.isRecording && (
              <Button variant="secondary" size="md" icon="play" label="Kaydımı dinle" onPress={playRecording} style={{ flex: 1 }} />
            )}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              variant="ghost"
              size="md"
              label="‹ Önceki"
              onPress={() => goTo(index - 1)}
              disabled={index === 0}
              style={{ flex: 1 }}
            />
            <Button
              variant="ghost"
              size="md"
              label="Sonraki ›"
              onPress={() => goTo(index + 1)}
              disabled={index >= set!.items.length - 1}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 28 },
    body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 40, gap: 16 },
    bigListen: {
      alignSelf: "center",
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colors.goldDeep,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 8,
      borderColor: colors.goldSoft,
    },
    pairRow: { flexDirection: "row", gap: 12 },
    pairCard: {
      flex: 1,
      alignItems: "center",
      gap: 4,
      paddingVertical: 20,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    pairWord: { color: colors.ink, textAlign: "center" },
    result: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
    card: { alignItems: "center", gap: 8, paddingVertical: 26 },
    targetWord: { color: colors.ink, textAlign: "center" },
    holdMic: {
      height: 60,
      borderRadius: 20,
      backgroundColor: colors.accent,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    verdictBox: { borderRadius: 18, padding: 14, gap: 6 },
  });
}
