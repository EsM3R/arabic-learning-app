import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Header from "../components/Header";
import { ProgressBar } from "../components/ui";
import { feedback } from "../feedback";
import { getActivePack } from "../languages";
import { speakTarget } from "../speech";
import { judgeSpeech, SpeechAttempt } from "../speechinput";
import { gradeCard, sessionQueue } from "../srs";
import { useDictation } from "../useDictation";
import { recordStat } from "../statsStore";
import { loadReviewMode, loadVocab, saveReviewMode, saveVocab, touchLastActivity } from "../storage";
import { matchProduction, ProductionMatch } from "../textnorm";
import { arabicText, colors, radius, shadow, shadowLift } from "../theme";
import { ReviewGrade, VocabCard } from "../types";

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
      pack.scriptExtract
    );
    setSpeech(attempt);
    void feedback(attempt.verdict === "dogru");
    void recordStat("spoken");
    if (attempt.verdict === "dogru") void recordStat("spokenCorrect");

    if (direction === "tanima") return; // telaffuz provası: notlama yok
    setAnswer(said);
    if (attempt.verdict === "dogru") {
      void recordStat("reviewed");
      void recordStat("produced"); // sesli doğru üretim
      setMatchKind(attempt.match);
      setPreGrade(current);
      await applyGrade(current, 2);
    } else {
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
      pack.scriptExtract
    );
    setMatchKind(kind);
    if (kind !== "none") {
      void feedback(true); // doğru cevap elde hissedilsin
      setPreGrade(current);
      await applyGrade(current, 2);
      void recordStat("reviewed");
      void recordStat("produced"); // yazılı doğru üretim — panelin "ürettiğin" sayacı
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

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <Header
        title="Kelime Defteri"
        subtitle={`${allCards.length} kelime · bugün ${queue.length} tekrar`}
        onBack={onBack}
        right={
          <View style={styles.modeToggle}>
            {(["yaz", "soyle"] as ReviewMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeChip, mode === m && styles.modeChipActive]}
                onPress={() => toggleMode(m)}
              >
                <Text style={[styles.modeChipText, mode === m && styles.modeChipTextActive]}>
                  {m === "yaz" ? "✍️ Yaz" : "🗣️ Söyle"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        }
      />

      {!loaded ? null : !current ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{allCards.length === 0 ? "📇" : "🎉"}</Text>
          <Text style={styles.emptyTitle}>
            {allCards.length === 0 ? "Defter henüz boş" : "Bugünlük bitti!"}
          </Text>
          <Text style={styles.emptyText}>
            {allCards.length === 0
              ? `${pack.teacherName} ile ders yaptıkça bilmediğin kelimeleri buraya kendisi ekleyecek.`
              : doneCount > 0
                ? `${doneCount} kelime tekrar ettin. Yarın yenileri seni bekliyor.`
                : "Şu an tekrarı gelen kelime yok. Yarın tekrar bak."}
          </Text>
        </View>
      ) : (
        <View style={styles.cardArea}>
          {/* Oturum ilerlemesi: kaç kart kaldığı görünmüyordu, bitiş belirsizdi. */}
          <View style={styles.sessionRow}>
            <ProgressBar progress={doneCount / Math.max(doneCount + queue.length, 1)} />
            <Text style={styles.sessionText}>
              {doneCount} / {doneCount + queue.length}
            </Text>
          </View>
          <View style={styles.card}>
            {direction === "tanima" ? (
              // ------------------------- TANIMA (yeni kart ilk görüş)
              <>
                <Text style={styles.newBadge}>🌱 Yeni kelime — önce tanı</Text>
                <Text style={styles.arabic}>{current.arabic}</Text>
                <View style={styles.listenRow}>
                  <TouchableOpacity
                    style={styles.listenChip}
                    onPress={() => speakTarget(current.arabic)}
                  >
                    <Text style={styles.listenChipText}>🔊 Dinle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.listenChip}
                    onPress={() => speakTarget(current.arabic, true)}
                  >
                    <Text style={styles.listenChipText}>🐢 Yavaş</Text>
                  </TouchableOpacity>
                  {/* Yeni kelimenin doğal alıştırması "dinle ve tekrarla"dır.
                      Kelime görünür olduğu için bu hatırlama değil TELAFFUZ
                      denemesidir: sayaçlara işler ama kartı notlamaz. */}
                  <TouchableOpacity
                    style={[styles.listenChip, dictation.listening && styles.listeningButton]}
                    onPressIn={() => dictation.start()}
                    onPressOut={() => dictation.stop()}
                  >
                    <Text
                      style={[
                        styles.listenChipText,
                        dictation.listening && styles.listenChipTextOn,
                      ]}
                    >
                      {dictation.listening ? "● Dinliyorum" : "🎙️ Basılı tut"}
                    </Text>
                  </TouchableOpacity>
                </View>
                {dictation.listening && (
                  <Text style={styles.listeningText}>{dictation.partial || "Dinliyorum…"}</Text>
                )}
                {dictation.error && <Text style={styles.micErrorText}>{dictation.error}</Text>}
                {speech && !dictation.listening && (
                  <Text style={styles.speechVerdict}>{speech.message}</Text>
                )}
                {revealed ? (
                  <>
                    <Text style={styles.translit}>{current.transliteration}</Text>
                    <Text style={styles.turkish}>{current.turkish}</Text>
                    {current.note ? <Text style={styles.note}>{current.note}</Text> : null}
                  </>
                ) : (
                  <Text style={styles.prompt}>Anlamını hatırlıyor musun?</Text>
                )}
              </>
            ) : phase === "sor" ? (
              // ------------------------- ÜRETİM — SORU
              <>
                <Text style={styles.hintLabel}>Hedef dilde nasıl söylersin?</Text>
                <Text style={styles.turkishBig}>{current.turkish}</Text>
                <Text style={styles.trackTag}>
                  {pack.tracks[current.track].icon} {pack.tracks[current.track].short}
                </Text>
                {showProduction ? (
                  <>
                    <TextInput
                      style={styles.answerInput}
                      value={answer}
                      onChangeText={setAnswer}
                      autoCorrect={false}
                      autoCapitalize="none"
                      placeholder={
                        pack.scriptExtract
                          ? "Arapçasını yaz (okunuşuyla da olur)…"
                          : "Cevabını yaz…"
                      }
                      placeholderTextColor={colors.inkFaint}
                      onSubmitEditing={() => void checkAnswer()}
                      returnKeyType="done"
                      // Her kartta fazladan bir dokunuş gerekiyordu.
                      autoFocus
                    />
                    {pack.scriptExtract && (
                      <Text style={styles.translitNote}>
                        Arap klavyen yoksa Latin okunuşuyla yazabilirsin — yazabilir ya da
                        söyleyebilirsin, ikisi de sayılır.
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.prompt}>
                    Mikrofonu BASILI TUT, hedef dilde söyle, sonra bırak.
                  </Text>
                )}
                {/* Mikrofon durumu artık kipten bağımsız: "yaz" modunda da
                    söyleyebilirsin. Eskiden mikrofon yalnız "söyle" kipinde
                    vardı ve öğrenci ekranda mikrofon bulamıyordu. */}
                {dictation.listening && (
                  <Text style={styles.listeningText}>
                    {dictation.partial || "Dinliyorum…"}
                  </Text>
                )}
                {dictation.error && <Text style={styles.micErrorText}>{dictation.error}</Text>}
              </>
            ) : (
              // ------------------------- ÜRETİM — SONUÇ
              <>
                {matchKind !== "none" ? (
                  <Text style={styles.correctBanner}>
                    ✅ Doğru!
                    {matchKind === "translit" ? " (okunuşuyla yazdın)" : ""}
                  </Text>
                ) : mode === "yaz" && answer.trim() ? (
                  <Text style={styles.wrongBanner}>Doğrusu:</Text>
                ) : null}
                <Text style={styles.arabic}>{current.arabic}</Text>
                <Text style={styles.translit}>{current.transliteration}</Text>
                <View style={styles.listenRow}>
                  <TouchableOpacity
                    style={styles.listenChip}
                    onPress={() => speakTarget(current.arabic)}
                  >
                    <Text style={styles.listenChipText}>🔊 Dinle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.listenChip}
                    onPress={() => speakTarget(current.arabic, true)}
                  >
                    <Text style={styles.listenChipText}>🐢 Yavaş</Text>
                  </TouchableOpacity>
                </View>
                {current.note ? <Text style={styles.note}>{current.note}</Text> : null}
                {speech && speech.verdict !== "dogru" && (
                  <Text style={styles.speechVerdict}>{speech.message}</Text>
                )}
                {matchKind === "none" && !speech && answer.trim().length > 0 && (
                  <Text style={styles.yourAnswer}>Senin cevabın: {answer.trim()}</Text>
                )}
              </>
            )}
          </View>

          {/* ---------------- alt butonlar ---------------- */}
          {direction === "tanima" ? (
            !revealed ? (
              <TouchableOpacity style={styles.revealButton} onPress={() => setRevealed(true)}>
                <Text style={styles.revealText}>Cevabı Göster</Text>
              </TouchableOpacity>
            ) : (
              <GradeRow onGrade={(g) => void grade(g)} />
            )
          ) : phase === "sor" ? (
            showProduction ? (
              <View style={styles.actionCol}>
                <View style={styles.answerRow}>
                  <TouchableOpacity
                    style={[styles.revealButton, styles.grow, !answer.trim() && styles.disabled]}
                    disabled={!answer.trim()}
                    onPress={() => void checkAnswer()}
                  >
                    <Text style={styles.revealText}>Kontrol Et</Text>
                  </TouchableOpacity>
                  {/* Yaz kipinde de söyleyebilmeli: mikrofon artık burada da var. */}
                  <TouchableOpacity
                    style={[styles.micSquare, dictation.listening && styles.listeningButton]}
                    onPressIn={() => dictation.start()}
                    onPressOut={() => dictation.stop()}
                    accessibilityLabel="Basılı tutarak söyle"
                  >
                    <Text style={styles.micSquareText}>{dictation.listening ? "●" : "🎙️"}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setMatchKind("none");
                    setPhase("sonuc");
                  }}
                >
                  <Text style={styles.secondaryText}>Bilmiyorum</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.actionCol}>
                <TouchableOpacity
                  style={[styles.revealButton, dictation.listening && styles.listeningButton]}
                  onPressIn={() => dictation.start()}
                  onPressOut={() => dictation.stop()}
                >
                  <Text style={styles.revealText}>
                    {dictation.listening ? "● Dinliyorum — bırakınca biter" : "🎙️ Basılı tut ve söyle"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setMatchKind("none");
                    setPhase("sonuc");
                  }}
                >
                  <Text style={styles.secondaryText}>Cevabı göster</Text>
                </TouchableOpacity>
              </View>
            )
          ) : matchKind !== "none" ? (
            <View style={styles.actionCol}>
              {preGrade && (
                <View style={styles.adjustRow}>
                  <TouchableOpacity
                    style={styles.adjustChip}
                    onPress={() => void adjustGrade(1)}
                  >
                    <Text style={styles.adjustText}>😮‍💨 Zorlandım</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.adjustChip}
                    onPress={() => void adjustGrade(3)}
                  >
                    <Text style={styles.adjustText}>😎 Çok kolaydı</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity style={styles.revealButton} onPress={advanceCorrect}>
                <Text style={styles.revealText}>Sıradaki →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <GradeRow onGrade={(g) => void grade(g)} />
          )}
          {wrongAnswered && mode === "yaz" && (
            <Text style={styles.honestyNote}>
              Yazımın farklı ama aslında biliyordun mu? Dürüstçe seç — takvimi bu kurar.
            </Text>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function GradeRow({ onGrade }: { onGrade: (g: ReviewGrade) => void }) {
  return (
    <View style={styles.gradeRow}>
      <TouchableOpacity
        style={[styles.gradeButton, { backgroundColor: "#F3D9D0" }]}
        onPress={() => onGrade(0)}
      >
        <Text style={[styles.gradeText, { color: colors.danger }]}>Bilemedim</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.gradeButton, { backgroundColor: colors.goldSoft }]}
        onPress={() => onGrade(1)}
      >
        <Text style={[styles.gradeText, { color: colors.gold }]}>Zor</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.gradeButton, { backgroundColor: colors.accentSoft }]}
        onPress={() => onGrade(2)}
      >
        <Text style={[styles.gradeText, { color: colors.accent }]}>Bildim</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.gradeButton, { backgroundColor: colors.accent }]}
        onPress={() => onGrade(3)}
      >
        <Text style={[styles.gradeText, { color: "#FFFFFF" }]}>Çok Kolay</Text>
      </TouchableOpacity>
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
    padding: 28,
    alignItems: "center",
    marginBottom: 20,
    minHeight: 280,
    justifyContent: "center",
    ...shadowLift,
  },
  modeToggle: { flexDirection: "row", gap: 4 },
  modeChip: {
    backgroundColor: colors.bg,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChipActive: { backgroundColor: colors.deep, borderColor: colors.deep },
  modeChipText: { fontSize: 11, fontWeight: "800", color: colors.inkSoft },
  modeChipTextActive: { color: colors.onDeep },
  newBadge: { fontSize: 12, color: colors.gold, fontWeight: "700", marginBottom: 10 },
  arabic: { ...arabicText(40), color: colors.ink, textAlign: "center", marginBottom: 12 },
  listenRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  listenChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  listenChipText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  prompt: { fontSize: 14, color: colors.inkSoft, marginTop: 8 },
  hintLabel: { fontSize: 12.5, color: colors.inkSoft, marginBottom: 8 },
  translit: { fontSize: 18, color: colors.accent, fontWeight: "600", marginBottom: 8 },
  turkish: { fontSize: 22, color: colors.ink, fontWeight: "700", marginBottom: 8 },
  turkishBig: {
    fontSize: 27,
    color: colors.ink,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
  },
  note: { fontSize: 13, color: colors.inkSoft, textAlign: "center", lineHeight: 19 },
  trackTag: { fontSize: 12, color: colors.inkSoft, marginBottom: 14 },
  answerInput: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 18,
    color: colors.ink,
    backgroundColor: colors.bg,
    textAlign: "center",
    marginTop: 6,
  },
  translitNote: { fontSize: 11, color: colors.inkFaint, marginTop: 8, textAlign: "center" },
  correctBanner: { fontSize: 16, fontWeight: "800", color: colors.accentDark, marginBottom: 10 },
  wrongBanner: { fontSize: 14, fontWeight: "800", color: colors.danger, marginBottom: 10 },
  yourAnswer: { fontSize: 12.5, color: colors.inkFaint, marginTop: 10 },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  answerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1 },
  micSquare: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  micSquareText: { fontSize: 22 },
  listenChipTextOn: { color: "#FFFFFF" },
  sessionText: { fontSize: 11.5, fontWeight: "800", color: colors.inkFaint, minWidth: 44, textAlign: "right" },
  listeningText: {
    fontSize: 14,
    color: colors.gold,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  micErrorText: { fontSize: 12.5, color: colors.danger, marginTop: 10, lineHeight: 18 },
  listeningButton: { backgroundColor: colors.danger },
  speechVerdict: {
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 12,
    lineHeight: 19,
    textAlign: "center",
  },
  revealButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 17,
    alignItems: "center",
    ...shadow,
  },
  revealText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  actionCol: { gap: 10 },
  secondaryButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  adjustRow: { flexDirection: "row", gap: 10, justifyContent: "center" },
  adjustChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  adjustText: { fontSize: 12.5, fontWeight: "700", color: colors.inkSoft },
  gradeRow: { flexDirection: "row", gap: 8 },
  gradeButton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    ...shadow,
  },
  gradeText: { fontSize: 13, fontWeight: "700" },
  honestyNote: {
    fontSize: 11.5,
    color: colors.inkFaint,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 16,
  },
});
