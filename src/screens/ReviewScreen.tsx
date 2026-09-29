import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Header from "../components/Header";
import Icon from "../components/Icon";
import {
  Badge,
  Bar,
  Button,
  Chip,
  Empty,
  IconButton,
  PressableScale,
  Segmented,
  Surface,
  Txt,
  Wave,
} from "../components/kit";
import { ltrLine } from "../richtext";
import { feedback } from "../feedback";
import { getActivePack } from "../languages";
import { speakTarget } from "../speech";
import { RECOGNITION_NOTE, SpeechAttempt, judgeSpeech } from "../speechinput";
import { gradeCard, sessionQueue } from "../srs";
import { useDictation } from "../useDictation";
import { recordStat, recordStats } from "../statsStore";
import type { StatEvent } from "../stats";
import { loadReviewMode, loadVocab, saveReviewMode, saveVocab, touchLastActivity } from "../storage";
import { matchProduction, ProductionMatch } from "../textnorm";
import { targetText } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
import { ReviewGrade, VocabCard } from "../types";
import { needsTranslit } from "../scripts";

interface Props {
  onBack: () => void;
}

type ReviewMode = "yaz" | "soyle";
type Phase = "sor" | "sonuc";

/**
 * Kelime defteri — ÜRETİCİ sınav. Araştırma net: hatırlamaya zorlamak tekrar
 * bakmaktan, üretmek tanımaktan üstündür. Bu yüzden yön çevrildi: Türkçe
 * ipucu gösterilir, öğrenci hedef dilde YAZAR (veya söyler). Hiç çalışılmamış
 * kart (reps=0) önce bir kez tanıma yönünde görülür — görmeden üretilmez.
 * Tamamen API'siz.
 */
export default function ReviewScreen({ onBack }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [allCards, setAllCards] = useState<VocabCard[]>([]);
  const [queue, setQueue] = useState<VocabCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<ReviewMode>("yaz");
  const [phase, setPhase] = useState<Phase>("sor");
  const [answer, setAnswer] = useState("");
  const [matchKind, setMatchKind] = useState<ProductionMatch>("none");
  /** Otomatik notlamadan önceki kart — "Zorlandım/Çok kolaydı" düzeltmesi bununla yeniden hesaplanır. */
  const [preGrade, setPreGrade] = useState<VocabCard | null>(null);
  /** Sesli denemenin cihaz hükmü (söyle modunda). */
  const [speech, setSpeech] = useState<SpeechAttempt | null>(null);

  useEffect(() => {
    void (async () => {
      const [cards, savedMode] = await Promise.all([loadVocab(), loadReviewMode()]);
      setAllCards(cards);
      // Tamamlanabilir oturum: tavan + yeni kart kotası (bkz. srs.sessionQueue).
      setQueue(sessionQueue(cards));
      setMode(savedMode === "soyle" ? "soyle" : "yaz");
      setLoaded(true);
    })();
  }, []);

  const current = queue[0];
  const pack = getActivePack();
  /** Hiç çalışılmamış kart önce tanıma yönünde görülür. */
  const direction: "tanima" | "uretim" =
    current && current.reps >= 1 ? "uretim" : "tanima";

  const applyGrade = async (base: VocabCard, g: ReviewGrade): Promise<VocabCard> => {
    const updated = gradeCard(base, g);
    const nextAll = allCards.map((c) => (c.id === updated.id ? updated : c));
    setAllCards(nextAll);
    await saveVocab(nextAll);
    return updated;
  };

  const resetQuestion = () => {
    setPhase("sor");
    setAnswer("");
    setRevealed(false);
    setPreGrade(null);
    setMatchKind("none");
    setSpeech(null);
  };

  /**
   * Sesli cevap. Cihazın tanıması söylediğini yazıya çevirir, hedefle
   * karşılaştırılır — öz-beyan değil, kanıt.
   *
   * İki farklı bağlamda çağrılır ve davranışı ayrılır:
   * - ÜRETİM yönünde kelime gizlidir; doğru söylemek hatırlamanın kanıtıdır,
   *   bu yüzden otomatik "Bildim" verilir.
   * - TANIMA yönünde kelime EKRANDA DURUYOR; okuyup söylemek hatırlama
   *   değil telaffuz denemesidir. Kart notlanmaz, yalnız sayaçlara işler;
   *   notu öğrenci "Cevabı Göster"den sonra kendisi verir.
   */
  const checkSpoken = async (said: string) => {
    if (!current) return;
    void touchLastActivity();
    const attempt = judgeSpeech(
      current.arabic,
      current.transliteration,
      said,
      pack.script
    );
    setSpeech(attempt);
    void feedback(attempt.verdict === "dogru");
    const heard: StatEvent[] = ["spoken"];
    if (attempt.verdict === "dogru") heard.push("spokenCorrect");

    if (direction === "tanima") {
      void recordStats(heard); // telaffuz provası: notlama yok
      return;
    }
    setAnswer(said);
    if (attempt.verdict === "dogru") {
      // Tek doğru cevap dört sayaç birden artırır; TOPLU yazılır.
      void recordStats([...heard, "reviewed", "produced"]);
      setMatchKind(attempt.match);
      setPreGrade(current);
      await applyGrade(current, 2);
    } else {
      void recordStats(heard);
      setMatchKind("none");
    }
    setPhase("sonuc");
  };

  const dictation = useDictation({ onResult: (t) => void checkSpoken(t) });

  /** Tanıma yönü / söyle modu / yanlış-yazım sonrası 4'lü öz-not. */
  const grade = async (g: ReviewGrade) => {
    if (!current) return;
    void touchLastActivity();
    void recordStat("reviewed");
    const updated = await applyGrade(current, g);
    const rest = queue.slice(1);
    // Bilemedi → kartı kuyruğun sonuna geri koy, bu oturumda tekrar sorulsun
    setQueue(g === 0 ? [...rest, updated] : rest);
    if (g !== 0) setDoneCount((n) => n + 1);
    resetQuestion();
  };

  /** Yaz modu: cevabı karşılaştır. Eşleşme = KANIT → otomatik "Bildim". */
  const checkAnswer = async () => {
    if (!current || !answer.trim()) return;
    void touchLastActivity();
    const kind = matchProduction(
      current.arabic,
      current.transliteration,
      answer,
      pack.script
    );
    setMatchKind(kind);
    if (kind !== "none") {
      void feedback(true); // doğru cevap elde hissedilsin
      setPreGrade(current);
      await applyGrade(current, 2);
      void recordStats(["reviewed", "produced"]); // yazılı doğru üretim
    } else {
      void feedback(false);
    }
    setPhase("sonuc");
  };

  /** Doğru cevap sonrası dürüstlük kanalı: notu 1 (zor) veya 3 (çok kolay) yap. */
  const adjustGrade = async (g: ReviewGrade) => {
    if (!preGrade) return;
    await applyGrade(preGrade, g); // orijinal karttan yeniden hesap — çift notlama yok
    setPreGrade(null);
  };

  const advanceCorrect = () => {
    setQueue((q) => q.slice(1));
    setDoneCount((n) => n + 1);
    resetQuestion();
  };

  const toggleMode = (m: ReviewMode) => {
    setMode(m);
    void saveReviewMode(m);
    resetQuestion();
  };

  const wrongAnswered = phase === "sonuc" && matchKind === "none";
  const showProduction = direction === "uretim" && mode === "yaz";

  const total = doneCount + queue.length;
  const speakBtns = (
    <View style={styles.listenRow}>
      <Chip icon="volume" label="Dinle" onPress={() => current && speakTarget(current.arabic)} />
      <Chip icon="slow" label="Yavaş" onPress={() => current && speakTarget(current.arabic, true)} />
    </View>
  );
  const micHint = dictation.listening ? (
    <View style={styles.listeningRow}>
      <Wave active color={colors.accent} />
      <Txt variant="callout" color={colors.inkSoft} style={{ fontStyle: "italic", flexShrink: 1 }}>
        {dictation.partial || "Dinliyorum…"}
      </Txt>
    </View>
  ) : null;
  const micError = dictation.error ? (
    <Txt variant="caption" color={colors.danger} center>
      {dictation.error}
    </Txt>
  ) : null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <Header
        title="Kelime Defteri"
        subtitle={`${allCards.length} kelime · bugün ${queue.length} tekrar`}
        onBack={onBack}
        right={
          <Segmented<ReviewMode>
            options={[
              { key: "yaz", label: "Yaz" },
              { key: "soyle", label: "Söyle" },
            ]}
            value={mode}
            onChange={toggleMode}
          />
        }
      />

      {!loaded ? null : !current ? (
        <Empty
          icon={allCards.length === 0 ? "book" : "award"}
          title={allCards.length === 0 ? "Defter henüz boş" : "Bugünlük bitti!"}
          text={
            allCards.length === 0
              ? `${pack.teacherName} ile ders yaptıkça bilmediğin kelimeleri buraya kendisi ekleyecek.`
              : doneCount > 0
                ? `${doneCount} kelime tekrar ettin. Yarın yenileri seni bekliyor.`
                : "Şu an tekrarı gelen kelime yok. Yarın tekrar bak."
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.cardArea} keyboardShouldPersistTaps="handled">
          {/* Oturum ilerlemesi: kaç kart kaldığı görünmüyordu, bitiş belirsizdi. */}
          <View style={styles.sessionRow}>
            <Bar progress={doneCount / Math.max(total, 1)} style={{ flex: 1 }} />
            <Txt variant="caption" color={colors.inkSoft} style={{ fontWeight: "800" }}>
              {doneCount} / {total}
            </Txt>
          </View>

          <Surface raised style={styles.card}>
            {direction === "tanima" ? (
              // ------------------------- TANIMA (yeni kart ilk görüş)
              <>
                <View style={styles.newBadge}>
                  <Icon name="sparkles" size={13} color={colors.gold} />
                  <Txt variant="caption" color={colors.gold} style={{ fontWeight: "800" }}>
                    Yeni kelime — önce tanı
                  </Txt>
                </View>
                <Text style={[styles.targetWord, targetText(42, pack.script)]}>{current.arabic}</Text>
                <View style={styles.listenRow}>
                  <Chip icon="volume" label="Dinle" onPress={() => speakTarget(current.arabic)} />
                  <Chip icon="slow" label="Yavaş" onPress={() => speakTarget(current.arabic, true)} />
                  {/* Yeni kelimenin doğal alıştırması "dinle ve tekrarla"dır.
                      Kelime görünür olduğu için bu hatırlama değil TELAFFUZ
                      denemesidir: sayaçlara işler ama kartı notlamaz. */}
                  <IconButton
                    icon={dictation.listening ? "stop" : "mic"}
                    label="Basılı tut"
                    variant={dictation.listening ? "deep" : "soft"}
                    size={36}
                    onPressIn={() => dictation.start()}
                    onPressOut={() => dictation.stop()}
                  />
                </View>
                {micHint}
                {micError}
                {speech && !dictation.listening && (
                  <>
                    <Txt variant="bodyStrong" color={speech.verdict === "dogru" ? colors.accentDark : colors.gold} center>
                      {speech.message}
                    </Txt>
                    <Txt variant="caption" color={colors.inkFaint} center>
                      {RECOGNITION_NOTE}
                    </Txt>
                  </>
                )}
                {revealed ? (
                  <View style={{ alignItems: "center", gap: 4 }}>
                    {!!current.transliteration && (
                      <Txt variant="callout" color={colors.inkSoft} style={{ fontStyle: "italic" }}>
                        {current.transliteration}
                      </Txt>
                    )}
                    <Txt variant="title2" center>
                      {current.turkish}
                    </Txt>
                    {current.note ? (
                      <Txt variant="caption" color={colors.inkSoft} center>
                        {ltrLine(current.note)}
                      </Txt>
                    ) : null}
                  </View>
                ) : (
                  <Txt variant="callout" color={colors.inkSoft} center>
                    Anlamını hatırlıyor musun?
                  </Txt>
                )}
              </>
            ) : phase === "sor" ? (
              // ------------------------- ÜRETİM — SORU
              <>
                <Txt variant="overline" color={colors.inkSoft}>
                  HEDEF DİLDE NASIL SÖYLERSİN?
                </Txt>
                <Txt variant="display" center>
                  {current.turkish}
                </Txt>
                <Badge text={pack.tracks[current.track].short} tone="gold" />
                {showProduction ? (
                  <>
                    <TextInput
                      style={styles.answerInput}
                      value={answer}
                      onChangeText={setAnswer}
                      autoCorrect={false}
                      autoCapitalize="none"
                      placeholder={`${pack.targetAccusative} yaz…`}
                      placeholderTextColor={colors.inkFaint}
                      onSubmitEditing={() => void checkAnswer()}
                      returnKeyType="done"
                      // Her kartta fazladan bir dokunuş gerekiyordu.
                      autoFocus
                    />
                    {needsTranslit(pack.script) && (
                      <Txt variant="caption" color={colors.inkFaint} center>
                        {pack.label} klavyen yoksa Latin okunuşuyla yazabilirsin — yazabilir ya da
                        söyleyebilirsin, ikisi de sayılır.
                      </Txt>
                    )}
                  </>
                ) : (
                  <Txt variant="callout" color={colors.inkSoft} center>
                    Mikrofonu BASILI TUT, hedef dilde söyle, sonra bırak.
                  </Txt>
                )}
                {micHint}
                {micError}
              </>
            ) : (
              // ------------------------- ÜRETİM — SONUÇ
              <>
                {matchKind !== "none" ? (
                  <View style={[styles.banner, { backgroundColor: colors.accentSoft }]}>
                    <Icon name="check" size={16} color={colors.accentDark} strokeWidth={2.8} />
                    <Txt variant="bodyStrong" color={colors.accentDark}>
                      {`Doğru!${matchKind === "translit" ? " (okunuşuyla yazdın)" : ""}`}
                    </Txt>
                  </View>
                ) : mode === "yaz" && answer.trim() ? (
                  <View style={[styles.banner, { backgroundColor: colors.dangerSoft }]}>
                    <Txt variant="bodyStrong" color={colors.danger}>
                      Doğrusu:
                    </Txt>
                  </View>
                ) : null}
                <Text style={[styles.targetWord, targetText(42, pack.script)]}>{current.arabic}</Text>
                {!!current.transliteration && (
                  <Txt variant="callout" color={colors.inkSoft} style={{ fontStyle: "italic" }}>
                    {current.transliteration}
                  </Txt>
                )}
                {speakBtns}
                {current.note ? (
                  <Txt variant="caption" color={colors.inkSoft} center>
                    {ltrLine(current.note)}
                  </Txt>
                ) : null}
                {speech && speech.verdict !== "dogru" && (
                  <Txt variant="callout" color={colors.gold} center>
                    {speech.message}
                  </Txt>
                )}
                {matchKind === "none" && !speech && answer.trim().length > 0 && (
                  <Txt variant="caption" color={colors.inkSoft}>
                    Senin cevabın: {answer.trim()}
                  </Txt>
                )}
              </>
            )}
          </Surface>

          {/* ---------------- alt düğmeler ---------------- */}
          <View style={styles.actionCol}>
            {direction === "tanima" ? (
              !revealed ? (
                <Button icon="eye" label="Cevabı Göster" onPress={() => setRevealed(true)} />
              ) : (
                <GradeRow onGrade={(g) => void grade(g)} />
              )
            ) : phase === "sor" ? (
              showProduction ? (
                <>
                  <View style={styles.answerRow}>
                    <Button label="Kontrol Et" disabled={!answer.trim()} onPress={() => void checkAnswer()} style={{ flex: 1 }} />
                    {/* Yaz kipinde de söyleyebilmeli: mikrofon burada da var. */}
                    <IconButton
                      icon={dictation.listening ? "stop" : "mic"}
                      label="Basılı tutarak söyle"
                      variant={dictation.listening ? "deep" : "outline"}
                      size={54}
                      onPressIn={() => dictation.start()}
                      onPressOut={() => dictation.stop()}
                    />
                  </View>
                  <Button
                    variant="ghost"
                    size="md"
                    label="Bilmiyorum"
                    onPress={() => {
                      setMatchKind("none");
                      setPhase("sonuc");
                    }}
                  />
                </>
              ) : (
                <>
                  <PressableScale
                    onPressIn={() => dictation.start()}
                    onPressOut={() => dictation.stop()}
                    accessibilityLabel="Basılı tut ve söyle"
                    style={[styles.holdMic, dictation.listening && { backgroundColor: colors.danger }]}
                  >
                    <Icon name={dictation.listening ? "stop" : "mic"} size={22} color="#FFFFFF" />
                    <Txt variant="button" color="#FFFFFF">
                      {dictation.listening ? "Dinliyorum — bırakınca biter" : "Basılı tut ve söyle"}
                    </Txt>
                  </PressableScale>
                  <Button
                    variant="ghost"
                    size="md"
                    label="Cevabı göster"
                    onPress={() => {
                      setMatchKind("none");
                      setPhase("sonuc");
                    }}
                  />
                </>
              )
            ) : matchKind !== "none" ? (
              <>
                {preGrade && (
                  <View style={styles.answerRow}>
                    <Button variant="secondary" size="md" label="Zorlandım" onPress={() => void adjustGrade(1)} style={{ flex: 1 }} />
                    <Button variant="secondary" size="md" label="Çok kolaydı" onPress={() => void adjustGrade(3)} style={{ flex: 1 }} />
                  </View>
                )}
                <Button icon="arrowRight" label="Sıradaki" onPress={advanceCorrect} />
              </>
            ) : (
              <GradeRow onGrade={(g) => void grade(g)} />
            )}
            {wrongAnswered && mode === "yaz" && (
              <Txt variant="caption" color={colors.inkSoft} center>
                Yazımın farklı ama aslında biliyordun mu? Dürüstçe seç — takvimi bu kurar.
              </Txt>
            )}
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function GradeRow({ onGrade }: { onGrade: (g: ReviewGrade) => void }) {
  const c = useTheme();
  const items: { g: ReviewGrade; label: string; bg: string; fg: string }[] = [
    { g: 0, label: "Bilemedim", bg: c.dangerSoft, fg: c.danger },
    { g: 1, label: "Zor", bg: c.goldSoft, fg: c.gold },
    { g: 2, label: "Bildim", bg: c.accentSoft, fg: c.accentDark },
    { g: 3, label: "Çok Kolay", bg: c.accent, fg: "#FFFFFF" },
  ];
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {items.map((it) => (
        <PressableScale
          key={it.g}
          onPress={() => onGrade(it.g)}
          accessibilityLabel={it.label}
          style={{ flex: 1, height: 54, borderRadius: 16, backgroundColor: it.bg, alignItems: "center", justifyContent: "center" }}
        >
          <Txt variant="callout" color={it.fg} style={{ fontWeight: "800" }} numberOfLines={1} adjustsFontSizeToFit>
            {it.label}
          </Txt>
        </PressableScale>
      ))}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    cardArea: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 28, gap: 18 },
    sessionRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    card: { alignItems: "center", gap: 14, paddingVertical: 28, minHeight: 300, justifyContent: "center" },
    newBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.goldSoft,
      borderRadius: 14,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    targetWord: { color: colors.ink, textAlign: "center" },
    listenRow: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
    listeningRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    banner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
    answerInput: {
      alignSelf: "stretch",
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: 16,
      backgroundColor: colors.bg,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontFamily: "Manrope",
      fontWeight: "600",
      fontSize: 18,
      color: colors.ink,
      textAlign: "center",
    },
    actionCol: { gap: 10 },
    answerRow: { flexDirection: "row", gap: 10, alignItems: "center" },
    holdMic: {
      height: 58,
      borderRadius: 18,
      backgroundColor: colors.accent,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
  });
}
