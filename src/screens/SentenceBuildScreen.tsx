import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Header from "../components/Header";
import { isBudgetError } from "../budget";
import { generateBuildSet } from "../claude";
import { getActivePack } from "../languages";
import { isRtl } from "../scripts";
import {
  checkStep,
  ladderSummary,
  nextPattern,
  patternById,
  recordAttempt,
  reorderStep,
  THEMES,
} from "../sentencebuilding";
import type {
  BuildSet,
  BuildStep,
  Pattern,
  ProgressMap,
  StepVerdict,
  Theme,
} from "../sentencebuilding";
import { speakTarget } from "../speech";
import { newCard } from "../srs";
import { recordStats } from "../statsStore";
import {
  loadBuildProgress,
  loadBuildSets,
  loadVocab,
  saveBuildProgress,
  saveBuildSets,
  saveVocab,
  touchLastActivity,
} from "../storage";
import { normalizeTarget } from "../textnorm";
import { radius, shadow, shadowLift } from "../theme";
import type { Palette } from "../theme";
import { useDictation } from "../useDictation";
import { useTheme } from "../useTheme";
import { Profile } from "../types";

interface Props {
  profile: Profile;
  onBack: () => void;
}

type Phase = "home" | "loading" | "drill" | "blocks" | "done";

/** En fazla bu kadar set saklanır (dil başına). */
const KEEP_SETS = 30;

/**
 * CÜMLE KURMA — Türkçe cümleyi hedef dile PARÇA PARÇA kurmak.
 *
 * Yöntem kullanıcının getirdiği videodan (bkz. src/sentencebuilding.ts):
 * hikâye cümleleri, ana yüklemden dışarı doğru kurulum, yapı taşları,
 * karıştırılanlar, alternatifler, bağlacın yeri. Videodan tek fark: burada
 * öğrenci İZLEMEZ, her adımda cümlenin TAMAMINI kendisi söyler ya da yazar.
 *
 * Maliyet: set başına tek istek; set saklanır ve bedavaya tekrar tekrar
 * çalışılır. Denetim tamamen cihazda.
 */
export default function SentenceBuildScreen({ profile, onBack }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pack = getActivePack();
  const rtl = isRtl(pack.script);

  const [phase, setPhase] = useState<Phase>("home");
  const [progress, setProgress] = useState<ProgressMap>({});
  const [sets, setSets] = useState<BuildSet[]>([]);
  const [set, setSet] = useState<BuildSet | null>(null);
  const [si, setSi] = useState(0); // cümle
  const [sti, setSti] = useState(0); // adım (steps.length = bağlaç yeri adımı)
  const [answer, setAnswer] = useState("");
  const [verdict, setVerdict] = useState<StepVerdict | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [savedBlocks, setSavedBlocks] = useState(false);

  useEffect(() => {
    void (async () => {
      setProgress(await loadBuildProgress<ProgressMap>());
      setSets(await loadBuildSets<BuildSet>());
    })();
  }, []);

  const focus: Pattern = nextPattern(progress);
  const sentence = set?.sentences[si];
  const extra = sentence ? reorderStep(sentence) : null;
  const step: BuildStep | null = sentence
    ? sti < sentence.steps.length
      ? sentence.steps[sti]
      : extra
    : null;
  const isReorder = !!sentence && sti >= sentence.steps.length;

  // ------------------------------------------------------------------ mikrofon
  const dictation = useDictation({
    onResult: (said) => {
      setAnswer(said);
      void check(said, true);
    },
  });

  // ------------------------------------------------------------------ set seçimi
  const openTheme = (theme: Theme) => {
    const saved = sets.find((s) => s.patternId === focus.id && s.themeId === theme.id);
    if (saved) {
      start(saved);
      return;
    }
    Alert.alert(
      "Yeni set",
      `"${theme.title}" temasında, "${focus.title}" kalıbına odaklı 7-8 cümle hazırlansın mı? Bu bir API isteği harcar; set saklanır, sonra bedava tekrar çalışılır.`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Evet, hazırla", onPress: () => void generate(theme) },
      ]
    );
  };

  const generate = async (theme: Theme) => {
    setPhase("loading");
    try {
      const vocab = await loadVocab();
      const made = await generateBuildSet(profile, focus, theme, vocab.map((c) => c.arabic));
      const next = [made, ...sets].slice(0, KEEP_SETS);
      setSets(next);
      await saveBuildSets(next);
      start(made);
    } catch (e) {
      setPhase("home");
      Alert.alert(
        isBudgetError(e) ? "Harcama tavanı doldu" : "Set hazırlanamadı",
        e instanceof Error ? e.message : String(e)
      );
    }
  };

  const start = (s: BuildSet) => {
    setSet(s);
    setSi(0);
    setSti(0);
    setAnswer("");
    setVerdict(null);
    setRevealed(false);
    setScore({ ok: 0, total: 0 });
    setSavedBlocks(false);
    setPhase("drill");
  };

  // ------------------------------------------------------------------ denetim
  const check = async (given: string, spoken = false) => {
    if (!set || !step || verdict) return;
    const v = checkStep(step, given, pack.script);
    setVerdict(v);
    setScore((sc) => ({ ok: sc.ok + (v === "yanlis" ? 0 : 1), total: sc.total + 1 }));
    // Doğru söyleneni duymak kalıbı kulağa da yerleştirir.
    speakTarget(step.target);
    const lastOfSentence = !!sentence && (extra ? isReorder : sti === sentence.steps.length - 1);
    const nextMap = recordAttempt(progress, set.patternId, v, lastOfSentence && v !== "yanlis");
    setProgress(nextMap);
    void saveBuildProgress(nextMap);
    const events: ("spoken" | "produced" | "sentenceBuilt")[] = [];
    if (spoken) events.push("spoken");
    if (v !== "yanlis") events.push("produced");
    if (lastOfSentence && v !== "yanlis") events.push("sentenceBuilt");
    if (events.length) void recordStats(events);
    void touchLastActivity();
  };

  /** Bilmiyorum: doğrusunu göster. Yanlış sayılır ama adım yine tekrarlanır. */
  const reveal = () => {
    if (!set || !step || verdict) return;
    setRevealed(true);
    setVerdict("yanlis");
    setScore((sc) => ({ ok: sc.ok, total: sc.total + 1 }));
    speakTarget(step.target);
    const nextMap = recordAttempt(progress, set.patternId, "yanlis", false);
    setProgress(nextMap);
    void saveBuildProgress(nextMap);
  };

  /** Yanlış adımda ilerlemek yok: aynı adımı bir daha söyle. */
  const retry = () => {
    setAnswer("");
    setVerdict(null);
    setRevealed(false);
  };

  const advance = () => {
    if (!set || !sentence) return;
    setAnswer("");
    setVerdict(null);
    setRevealed(false);
    const lastIndex = extra ? sentence.steps.length : sentence.steps.length - 1;
    if (sti < lastIndex) {
      setSti(sti + 1);
      return;
    }
    // Cümle bitti: yapı taşlarını göster.
    setPhase("blocks");
  };

  const nextSentence = () => {
    if (!set) return;
    if (si + 1 < set.sentences.length) {
      setSi(si + 1);
      setSti(0);
      setPhase("drill");
    } else {
      setPhase("done");
    }
  };

  /** Setin yapı taşları kelime defterine — tekrar takvimi onları geri getirsin. */
  const saveBlocks = async () => {
    if (!set) return;
    const cards = await loadVocab();
    const known = new Set(cards.map((c) => normalizeTarget(c.arabic, pack.script)));
    let added = 0;
    for (const s of set.sentences) {
      for (const b of s.blocks) {
        const key = normalizeTarget(b.target, pack.script);
        if (!key || known.has(key)) continue;
        known.add(key);
        cards.push(newCard(b.target, "", b.tr, "konusma", b.contrast || b.note, "orta"));
        added += 1;
      }
    }
    await saveVocab(cards);
    setSavedBlocks(true);
    Alert.alert("Deftere eklendi", added > 0 ? `${added} yapı taşı kelime defterine yazıldı.` : "Hepsi zaten defterdeydi.");
  };

  // ------------------------------------------------------------------ görünüm
  if (phase === "loading") {
    return (
      <View style={styles.container}>
        <Header title="Cümle Kurma" subtitle="set hazırlanıyor…" onBack={onBack} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.muted}>{pack.teacherName} hikâyeyi ve adımları hazırlıyor…</Text>
        </View>
      </View>
    );
  }

  if (phase === "home") {
    const summary = ladderSummary(progress);
    return (
      <View style={styles.container}>
        <Header title="Cümle Kurma" subtitle="Türkçeden parça parça" onBack={onBack} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.lead}>
            Türkçe bir cümle gelir; sen onu ana fiilden başlayıp parça parça kurarsın. Her
            adımda cümlenin TAMAMINI söyle ya da yaz. Cümleler bir hikâyenin parçası; her biri
            yeni bir yapı taşı öğretir.
          </Text>

          <View style={styles.focusCard}>
            <Text style={styles.focusLabel}>ŞİMDİKİ KALIP · {focus.band}</Text>
            <Text style={styles.focusTitle}>{focus.title}</Text>
            <Text style={styles.focusSub}>{focus.concept}</Text>
          </View>

          <View style={styles.ladderRow}>
            {summary.map((b) => (
              <View key={b.band} style={styles.ladderCell}>
                <Text style={styles.ladderBand}>{b.band}</Text>
                <Text style={styles.ladderCount}>
                  {b.done}/{b.total}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.section}>Hikâye seç</Text>
          {THEMES.map((t) => {
            const saved = sets.some((s) => s.patternId === focus.id && s.themeId === t.id);
            return (
              <TouchableOpacity key={t.id} style={styles.themeCard} onPress={() => openTheme(t)} activeOpacity={0.85}>
                <Text style={styles.themeEmoji}>{t.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.themeTitle}>{t.title}</Text>
                  <Text style={styles.themeSub}>{t.arc}</Text>
                </View>
                {saved && <Text style={styles.savedTag}>hazır</Text>}
              </TouchableOpacity>
            );
          })}

          {sets.length > 0 && (
            <>
              <Text style={styles.section}>Kayıtlı setler (bedava tekrar)</Text>
              {sets.slice(0, 8).map((s, i) => {
                const th = THEMES.find((t) => t.id === s.themeId);
                const pt = patternById(s.patternId);
                return (
                  <TouchableOpacity key={`${s.createdAt}-${i}`} style={styles.savedRow} onPress={() => start(s)}>
                    <Text style={styles.savedText}>
                      {th?.emoji} {th?.title ?? s.themeId} · {pt?.title ?? s.patternId}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  if (!set || !sentence) return null;

  if (phase === "done") {
    const pct = score.total ? Math.round((score.ok / score.total) * 100) : 0;
    return (
      <View style={styles.container}>
        <Header title="Cümle Kurma" subtitle="set bitti" onBack={onBack} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.focusCard}>
            <Text style={styles.focusTitle}>🎉 {set.sentences.length} cümle kurdun</Text>
            <Text style={styles.focusSub}>
              Adımların %{pct}'i ilk seferde doğru. Aynı seti yarın bir daha çalış — ikinci
              seferde cümleler kendiliğinden gelmeye başlar.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.secondary, savedBlocks && { opacity: 0.6 }]}
            disabled={savedBlocks}
            onPress={() => void saveBlocks()}
          >
            <Text style={styles.secondaryText}>{savedBlocks ? "✓ Defterde" : "📇 Yapı taşlarını deftere ekle"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primary} onPress={() => start(set)}>
            <Text style={styles.primaryText}>↺ Aynı seti tekrar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => setPhase("home")}>
            <Text style={styles.secondaryText}>Başka hikâye</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (phase === "blocks") {
    return (
      <View style={styles.container}>
        <Header title="Cümle Kurma" subtitle={`cümle ${si + 1} / ${set.sentences.length}`} onBack={onBack} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.trSentence}>{sentence.tr}</Text>
          <TouchableOpacity onPress={() => speakTarget(sentence.steps[sentence.steps.length - 1].target)}>
            <Text style={[styles.targetBig, rtl && styles.rtl]}>
              🔊 {sentence.steps[sentence.steps.length - 1].target}
            </Text>
          </TouchableOpacity>
          {sentence.reorder ? (
            <Text style={[styles.reorder, rtl && styles.rtl]}>ya da: {sentence.reorder}</Text>
          ) : null}

          {sentence.blocks.map((b, i) => (
            <View key={i} style={styles.blockCard}>
              <Text style={[styles.blockTarget, rtl && styles.rtl]}>
                {b.target} <Text style={styles.blockTr}>= {b.tr}</Text>
              </Text>
              {!!b.note && <Text style={styles.blockNote}>{b.note}</Text>}
              {!!b.contrast && <Text style={styles.contrast}>⚠️ {b.contrast}</Text>}
              {b.alts.length > 0 && <Text style={styles.alts}>Ayrıca: {b.alts.join(" · ")}</Text>}
            </View>
          ))}

          <TouchableOpacity style={styles.primary} onPress={nextSentence}>
            <Text style={styles.primaryText}>
              {si + 1 < set.sentences.length ? "Sıradaki cümle ›" : "Seti bitir ›"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ------------------------------------------------------------------ adım
  if (!step) return null;
  const totalSteps = sentence.steps.length + (extra ? 1 : 0);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={styles.container}>
        <Header
          title="Cümle Kurma"
          subtitle={`cümle ${si + 1} / ${set.sentences.length} · adım ${sti + 1} / ${totalSteps}`}
          onBack={onBack}
        />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.trSentence}>{sentence.tr}</Text>

          <View style={styles.stepCard}>
            {isReorder ? (
              <Text style={styles.stepHint}>Şimdi aynı cümleyi bağlacı ORTAYA alarak söyle.</Text>
            ) : (
              <>
                <Text style={styles.stepHint}>Bu adımda ekle:</Text>
                <Text style={styles.trPiece}>{step.trPiece}</Text>
                <Text style={styles.trSoFar}>→ {step.trSoFar}</Text>
              </>
            )}
            {sti > 0 && !isReorder && (
              <Text style={[styles.prev, rtl && styles.rtl]}>önceki: {sentence.steps[sti - 1].target}</Text>
            )}
          </View>

          {verdict ? (
            <View
              style={[
                styles.verdict,
                verdict === "dogru" ? styles.ok : verdict === "yakin" ? styles.near : styles.bad,
              ]}
            >
              <Text style={styles.verdictTitle}>
                {revealed
                  ? "Doğrusu:"
                  : verdict === "dogru"
                    ? "✓ Doğru"
                    : verdict === "yakin"
                      ? "≈ Çok yakın — doğrusu:"
                      : "✗ Doğrusu:"}
              </Text>
              <TouchableOpacity onPress={() => speakTarget(step.target)}>
                <Text style={[styles.targetBig, rtl && styles.rtl]}>🔊 {step.target}</Text>
              </TouchableOpacity>
              {!!step.translit && <Text style={styles.translit}>{step.translit}</Text>}
              {step.alts.length > 0 && <Text style={styles.alts}>Ayrıca doğru: {step.alts.join(" · ")}</Text>}
              {!!step.note && <Text style={styles.blockNote}>💡 {step.note}</Text>}
              {verdict === "yanlis" ? (
                <TouchableOpacity style={styles.primary} onPress={retry}>
                  <Text style={styles.primaryText}>↺ Bir daha söyle</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.primary} onPress={advance}>
                  <Text style={styles.primaryText}>Devam ›</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.mic, dictation.listening && styles.micOn]}
                onPressIn={() => dictation.start()}
                onPressOut={() => dictation.stop()}
              >
                <Text style={styles.micText}>
                  {dictation.listening ? "● Dinliyorum — bırakınca biter" : "🎙️ Basılı tut ve cümlenin tamamını söyle"}
                </Text>
              </TouchableOpacity>
              {dictation.listening && !!dictation.partial && (
                <Text style={styles.partial}>{dictation.partial}</Text>
              )}
              {dictation.error && <Text style={styles.err}>{dictation.error}</Text>}
              <TextInput
                style={[styles.input, rtl && styles.rtl]}
                value={answer}
                onChangeText={setAnswer}
                placeholder="…ya da yaz"
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="sentences"
                autoCorrect={false}
                onSubmitEditing={() => void check(answer)}
              />
              <View style={styles.row}>
                <TouchableOpacity style={styles.ghost} onPress={reveal}>
                  <Text style={styles.ghostText}>Bilmiyorum</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.checkBtn, !answer.trim() && { opacity: 0.5 }]}
                  disabled={!answer.trim()}
                  onPress={() => void check(answer)}
                >
                  <Text style={styles.primaryText}>Kontrol et</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    body: { padding: 18, paddingBottom: 40 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
    muted: { fontSize: 14, color: colors.inkSoft, textAlign: "center" },
    lead: { fontSize: 14, color: colors.inkSoft, lineHeight: 21, marginBottom: 14 },
    focusCard: { backgroundColor: colors.deep, borderRadius: radius.xl, padding: 18, marginBottom: 12, ...shadowLift },
    focusLabel: { color: colors.goldDeep, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
    focusTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginTop: 4 },
    focusSub: { color: "rgba(255,255,255,0.8)", fontSize: 13.5, marginTop: 6, lineHeight: 20 },
    ladderRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
    ladderCell: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, alignItems: "center" },
    ladderBand: { fontSize: 11, fontWeight: "800", color: colors.inkFaint },
    ladderCount: { fontSize: 14, fontWeight: "800", color: colors.ink, marginTop: 2 },
    section: { fontSize: 12, fontWeight: "800", color: colors.inkFaint, letterSpacing: 0.6, marginBottom: 10, marginTop: 6 },
    themeCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, ...shadow },
    themeEmoji: { fontSize: 24 },
    themeTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
    themeSub: { fontSize: 12, color: colors.inkSoft, marginTop: 2, lineHeight: 17 },
    savedTag: { fontSize: 11, fontWeight: "800", color: colors.accentDark },
    savedRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    savedText: { fontSize: 13.5, color: colors.ink },
    trSentence: { fontSize: 17, fontWeight: "700", color: colors.ink, lineHeight: 25, marginBottom: 12 },
    stepCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14, ...shadow },
    stepHint: { fontSize: 12, color: colors.inkFaint, fontWeight: "700" },
    trPiece: { fontSize: 20, fontWeight: "800", color: colors.accentDark, marginTop: 4 },
    trSoFar: { fontSize: 14, color: colors.inkSoft, marginTop: 6 },
    prev: { fontSize: 13, color: colors.inkFaint, marginTop: 10, fontStyle: "italic" },
    verdict: { borderRadius: radius.lg, padding: 16, gap: 6 },
    ok: { backgroundColor: colors.accentSoft },
    near: { backgroundColor: colors.goldSoft },
    bad: { backgroundColor: colors.dangerSoft },
    verdictTitle: { fontSize: 13, fontWeight: "800", color: colors.ink },
    targetBig: { fontSize: 19, color: colors.ink, fontWeight: "700", lineHeight: 28 },
    translit: { fontSize: 13, color: colors.inkSoft },
    alts: { fontSize: 12.5, color: colors.inkSoft },
    reorder: { fontSize: 15, color: colors.inkSoft, marginTop: 4, marginBottom: 12 },
    blockCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 10, ...shadow },
    blockTarget: { fontSize: 17, fontWeight: "800", color: colors.ink },
    blockTr: { fontSize: 14, fontWeight: "600", color: colors.inkSoft },
    blockNote: { fontSize: 13, color: colors.inkSoft, marginTop: 4, lineHeight: 19 },
    contrast: { fontSize: 13, color: colors.gold, marginTop: 6, lineHeight: 19, fontWeight: "600" },
    mic: { backgroundColor: colors.accent, borderRadius: radius.xl, paddingVertical: 18, alignItems: "center", ...shadowLift },
    micOn: { backgroundColor: colors.danger },
    micText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", textAlign: "center", paddingHorizontal: 12 },
    partial: { fontSize: 15, color: colors.inkSoft, textAlign: "center", marginTop: 8, fontStyle: "italic" },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card, padding: 14, fontSize: 16, color: colors.ink, marginTop: 12 },
    row: { flexDirection: "row", gap: 10, marginTop: 10 },
    ghost: { flex: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 13, alignItems: "center" },
    ghostText: { color: colors.inkSoft, fontSize: 14, fontWeight: "700" },
    checkBtn: { flex: 2, backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 13, alignItems: "center" },
    primary: { backgroundColor: colors.accent, borderRadius: radius.xl, paddingVertical: 14, alignItems: "center", marginTop: 12 },
    primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
    secondary: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: "center", marginTop: 10 },
    secondaryText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
    err: { fontSize: 13, color: colors.danger, marginTop: 8, textAlign: "center" },
    rtl: { writingDirection: "rtl", textAlign: "right" },
  });
}
