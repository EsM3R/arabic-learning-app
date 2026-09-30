import React, { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Header from "../components/Header";
import Icon from "../components/Icon";
import {
  Badge,
  Bar,
  Button,
  IconButton,
  ListGroup,
  ListRow,
  PressableScale,
  Ring,
  Screen,
  SectionLabel,
  StarPattern,
  Surface,
  TargetText,
  TeacherAvatar,
  Txt,
  Wave,
} from "../components/kit";
import { isBudgetError } from "../budget";
import { generateBuildSet } from "../claude";
import { getActivePack } from "../languages";
import { isRtl } from "../scripts";
import {
  checkStep,
  ladderSummary,
  masteryStatus,
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
import { ltrLine } from "../richtext";
import type { Palette } from "../theme";
import { useDictation } from "../useDictation";
import { useTheme } from "../useTheme";
import { Profile } from "../types";

interface Props {
  profile: Profile;
  onBack: () => void;
}

/**
 * "preview": cümleye başlamadan yapı taşları — videodaki hoca da "-madan
 * önce = before, ago ile karıştırma" açıklamasını çeviriden ÖNCE yapar.
 * "blocks": cümle bittikten sonra tam hâl + bağlacın öteki yeri (özet).
 */
type Phase = "home" | "loading" | "preview" | "drill" | "blocks" | "done";

/**
 * En fazla bu kadar set saklanır (dil başına). Sınır cümle SAYISINDA değil
 * depoda: öğrenci istediği kadar yeni set üretebilir, en eskiler düşer.
 */
const KEEP_SETS = 60;

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
    // Aynı kalıp+temada birden çok set olabilir (devam setleri): en yenisi.
    const saved = sets.find((s) => s.patternId === focus.id && s.themeId === theme.id);
    if (saved) {
      start(saved);
      return;
    }
    Alert.alert(
      "Yeni set",
      `"${theme.title}" temasında, "${focus.title}" kalıbına odaklı 5-6 cümle hazırlansın mı? Bu bir API isteği harcar; set saklanır, sonra bedava tekrar çalışılır.`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Evet, hazırla", onPress: () => void generate(theme) },
      ]
    );
  };

  /**
   * Yeni set. Aynı kalıp+temada daha önce kurulan cümleler modele "tekrarlama,
   * hikâye devam etsin" diye verilir — böylece örnek sınırı yok: öğrenci
   * kalıp oturana kadar istediği kadar yeni cümle ister.
   */
  const generate = async (theme: Theme, patternId = focus.id) => {
    const pattern = patternById(patternId) ?? focus;
    setPhase("loading");
    try {
      const vocab = await loadVocab();
      const avoid = sets
        .filter((s) => s.patternId === pattern.id && s.themeId === theme.id)
        .reverse()
        .flatMap((s) => s.sentences.map((x) => x.tr));
      const made = await generateBuildSet(profile, pattern, theme, vocab.map((c) => c.arabic), avoid);
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
    setPhase(s.sentences[0]?.blocks.length ? "preview" : "drill");
  };

  // ------------------------------------------------------------------ denetim
  const check = async (given: string, spoken = false) => {
    if (!set || !step || verdict) return;
    // Dil ve önceki adım verilir: tuzaklar dile özgü, "bu adımda eklenen"
    // kelime de önceki adımdan çıkarılır (o kelime eksikse yakın değil yanlış).
    const prev = !isReorder && sentence && sti > 0 ? sentence.steps[sti - 1]?.target : undefined;
    const v = checkStep(step, given, pack.script, { lang: pack.id, spoken, prev });
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
      setPhase(set.sentences[si + 1].blocks.length ? "preview" : "drill");
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
  /** Setteki cümleler için ince bölütlü ilerleme şeridi. */
  const sentenceBar = set ? (
    <View style={styles.segments}>
      {set.sentences.map((_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            { backgroundColor: i < si ? colors.accent : i === si ? colors.goldDeep : colors.line },
          ]}
        />
      ))}
    </View>
  ) : null;

  /** Türkçe cümle — bu adımda eklenen parça vurgulu. */
  const trSentence = (piece?: string) => {
    if (!sentence) return null;
    const i = piece ? sentence.tr.indexOf(piece) : -1;
    return (
      <Txt variant="title2" style={{ fontWeight: "500" }}>
        {i < 0 ? (
          sentence.tr
        ) : (
          <>
            {sentence.tr.slice(0, i)}
            <Txt variant="title2" color={colors.gold} style={{ backgroundColor: colors.highlight, fontWeight: "600" }}>
              {piece}
            </Txt>
            {sentence.tr.slice(i + (piece?.length ?? 0))}
          </>
        )}
      </Txt>
    );
  };

  if (phase === "loading") {
    return (
      <View style={styles.container}>
        <Header title="Cümle Kurma" subtitle="set hazırlanıyor…" onBack={onBack} />
        <View style={styles.center}>
          <TeacherAvatar size={72} speaking />
          <Txt variant="callout" color={colors.inkSoft} center>
            {pack.teacherName} hikâyeyi ve adımları hazırlıyor…
          </Txt>
        </View>
      </View>
    );
  }

  if (phase === "home") {
    const summary = ladderSummary(progress);
    const m = masteryStatus(progress[focus.id]);
    return (
      <View style={styles.container}>
        <Header title="Cümle Kurma" subtitle="Türkçeden parça parça" onBack={onBack} />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Txt variant="callout" color={colors.inkSoft} style={{ marginBottom: 16 }}>
            Türkçe bir cümle gelir; sen onu ana fiilden başlayıp parça parça kurarsın. Her adımda
            cümlenin TAMAMINI söyle ya da yaz. Cümleler bir hikâyenin parçası; her biri yeni bir yapı
            taşı öğretir.
          </Txt>

          <View style={styles.focusCard}>
            <StarPattern width="100%" height="100%" color={colors.goldDeep} opacity={0.09} />
            <Txt variant="overline" color={colors.goldDeep}>
              {`ŞİMDİKİ KALIP · ${focus.band}`}
            </Txt>
            <Txt variant="title2" color={colors.onDeep} style={{ marginTop: 6 }}>
              {focus.title}
            </Txt>
            <Txt variant="callout" color={colors.onDeepSoft} style={{ marginTop: 6 }}>
              {focus.concept}
            </Txt>
            <Bar
              progress={m.needSentences ? m.sentences / m.needSentences : 0}
              color={colors.goldDeep}
              track="rgba(255,255,255,0.14)"
              style={{ marginTop: 16 }}
            />
            <Txt variant="caption" color={colors.goldDeep} style={{ marginTop: 8 }}>
              {`${m.sentences}/${m.needSentences} cümle${m.accuracy !== null ? ` · son isabet %${Math.round(m.accuracy * 100)}` : ""} · oturması için %85`}
            </Txt>
          </View>

          <View style={styles.ladderRow}>
            {summary.map((b) => (
              <View key={b.band} style={styles.ladderCell}>
                <Txt variant="overline" color={colors.inkSoft} style={{ fontSize: 10 }}>
                  {b.band}
                </Txt>
                <Txt variant="headline" style={{ fontSize: 14 }}>
                  {b.done}/{b.total}
                </Txt>
              </View>
            ))}
          </View>

          <SectionLabel title="Hikâye seç" />
          <ListGroup>
            {THEMES.map((t) => {
              const saved = sets.some((x) => x.patternId === focus.id && x.themeId === t.id);
              return (
                <ListRow
                  key={t.id}
                  icon="bookOpen"
                  tone="gold"
                  title={t.title}
                  subtitle={t.arc}
                  onPress={() => openTheme(t)}
                  right={saved ? <Badge text="hazır" tone="accent" /> : undefined}
                />
              );
            })}
          </ListGroup>

          {sets.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <SectionLabel title="Kayıtlı setler · bedava tekrar" />
              <ListGroup>
                {sets.slice(0, 8).map((x, i) => {
                  const th = THEMES.find((t) => t.id === x.themeId);
                  const pt = patternById(x.patternId);
                  return (
                    <ListRow
                      key={`${x.createdAt}-${i}`}
                      icon="repeat"
                      tone="neutral"
                      title={`${th?.title ?? x.themeId} · ${pt?.title ?? x.patternId}`}
                      onPress={() => start(x)}
                    />
                  );
                })}
              </ListGroup>
            </View>
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
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={[styles.focusCard, { alignItems: "center" }]}>
            <StarPattern width="100%" height="100%" color={colors.goldDeep} opacity={0.09} />
            <Ring progress={pct / 100} size={84} stroke={7} color={colors.goldDeep} track="rgba(255,255,255,0.14)" label={`%${pct}`} labelColor={colors.onDeep} />
            <Txt variant="title2" color={colors.onDeep} center style={{ marginTop: 14 }}>
              {`${set.sentences.length} cümle kurdun`}
            </Txt>
            <Txt variant="callout" color={colors.onDeepSoft} center style={{ marginTop: 6 }}>
              Adımların %{pct}'i ilk seferde doğru. Aynı seti yarın bir daha çalış — ikinci seferde
              cümleler kendiliğinden gelmeye başlar.
            </Txt>
          </View>
          <View style={{ gap: 10 }}>
            <Button
              icon="plus"
              label="Devam — yeni cümleler"
              onPress={() => {
                const theme = THEMES.find((t) => t.id === set.themeId);
                if (!theme) return;
                Alert.alert(
                  "Yeni cümleler",
                  "Hikâye kaldığı yerden devam etsin mi? Aynı kalıpla, daha önce kurmadığın 5-6 yeni cümle gelir. Bu bir API isteği harcar.",
                  [
                    { text: "Vazgeç", style: "cancel" },
                    { text: "Evet, devam", onPress: () => void generate(theme, set.patternId) },
                  ]
                );
              }}
            />
            <Button variant="secondary" size="md" icon="replay" label="Aynı seti tekrar" onPress={() => start(set)} />
            <Button
              variant="secondary"
              size="md"
              icon={savedBlocks ? "check" : "bookmark"}
              label={savedBlocks ? "Defterde" : "Yapı taşlarını deftere ekle"}
              disabled={savedBlocks}
              onPress={() => void saveBlocks()}
            />
            <Button variant="ghost" size="md" label="Başka hikâye" onPress={() => setPhase("home")} />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (phase === "preview") {
    return (
      <Screen
        header={<Header title="Cümle Kurma" subtitle={`cümle ${si + 1} / ${set.sentences.length}`} onBack={onBack} />}
        footer={<Button icon="arrowRight" label="Kurmaya başla" onPress={() => setPhase("drill")} />}
      >
        {sentenceBar}
        <Txt variant="overline" color={colors.inkSoft} style={{ marginBottom: 6 }}>
          TÜRKÇE CÜMLE
        </Txt>
        {trSentence()}
        <SectionLabel title="Bu cümlede öğreneceklerin" style={{ marginTop: 22 }} />
        <View style={{ gap: 10 }}>
          {sentence.blocks.map((b, i) => (
            <Surface key={i} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Txt variant="bodyStrong" color={colors.inkSoft} style={{ flex: 1 }}>{`= ${b.tr}`}</Txt>
                <TargetText size={rtl ? 22 : 17}>{b.target}</TargetText>
              </View>
              {!!b.note && (
                <Txt variant="callout" color={colors.inkSoft}>
                  {ltrLine(b.note)}
                </Txt>
              )}
              {!!b.contrast && (
                <View style={styles.contrastBox}>
                  <Icon name="alert" size={16} color={colors.gold} />
                  <Txt variant="callout" color={colors.gold} style={{ flex: 1, fontWeight: "700" }}>
                    {ltrLine(b.contrast)}
                  </Txt>
                </View>
              )}
              {b.alts.length > 0 && (
                <Txt variant="caption" color={colors.inkSoft}>
                  {ltrLine(`Ayrıca: ${b.alts.join(" · ")}`)}
                </Txt>
              )}
            </Surface>
          ))}
        </View>
      </Screen>
    );
  }

  if (phase === "blocks") {
    const full = sentence.steps[sentence.steps.length - 1].target;
    return (
      <Screen
        header={<Header title="Cümle Kurma" subtitle={`cümle ${si + 1} / ${set.sentences.length}`} onBack={onBack} />}
        footer={
          <Button
            icon="arrowRight"
            label={si + 1 < set.sentences.length ? "Sıradaki cümle" : "Seti bitir"}
            onPress={nextSentence}
          />
        }
      >
        {sentenceBar}
        {trSentence()}
        <Surface raised style={{ marginTop: 18, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="check" size={18} color={colors.accentDark} strokeWidth={2.6} />
            <Txt variant="overline" color={colors.accentDark}>
              CÜMLE KURULDU
            </Txt>
          </View>
          <Txt variant="title3" style={rtl ? styles.rtl : undefined}>
            {full}
          </Txt>
          {sentence.reorder ? (
            <Txt variant="callout" color={colors.inkSoft} style={rtl ? styles.rtl : undefined}>
              ya da: {sentence.reorder}
            </Txt>
          ) : null}
          <Button variant="secondary" size="sm" icon="volume" label="Dinle" onPress={() => speakTarget(full)} style={{ alignSelf: "flex-start" }} />
        </Surface>

        <SectionLabel title="Öğrendiğin yapı taşları" style={{ marginTop: 22 }} />
        <ListGroup>
          {sentence.blocks.map((b, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Icon name="check" size={16} color={colors.accentDark} strokeWidth={2.6} />
              <Txt variant="bodyStrong" style={{ flex: 1 }}>{ltrLine(`${b.target} = ${b.tr}`)}</Txt>
            </View>
          ))}
        </ListGroup>
      </Screen>
    );
  }

  // ------------------------------------------------------------------ adım
  if (!step) return null;
  const totalSteps = sentence.steps.length + (extra ? 1 : 0);
  const verdictTone = verdict === "dogru" ? colors.accentSoft : verdict === "yakin" ? colors.goldSoft : colors.dangerSoft;
  const verdictInk = verdict === "dogru" ? colors.accentDark : verdict === "yakin" ? colors.gold : colors.danger;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen
        header={
          <Header
            title="Cümle Kurma"
            subtitle={`cümle ${si + 1} / ${set.sentences.length} · adım ${sti + 1} / ${totalSteps}`}
            onBack={onBack}
          />
        }
        footer={
          verdict ? (
            verdict === "yanlis" ? (
              <Button icon="replay" label="Bir daha söyle" onPress={retry} />
            ) : (
              <Button icon="arrowRight" label="Devam" onPress={advance} />
            )
          ) : (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <IconButton
                icon={dictation.listening ? "stop" : "mic"}
                label="Basılı tut ve söyle"
                variant={dictation.listening ? "deep" : "outline"}
                size={56}
                onPressIn={() => dictation.start()}
                onPressOut={() => dictation.stop()}
              />
              <Button variant="ghost" label="Bilmiyorum" onPress={reveal} style={{ paddingHorizontal: 14 }} />
              <Button label="Kontrol et" disabled={!answer.trim()} onPress={() => void check(answer)} style={{ flex: 1 }} />
            </View>
          )
        }
      >
        {sentenceBar}
        <Txt variant="overline" color={colors.inkSoft} style={{ marginBottom: 6 }}>
          TÜRKÇE CÜMLE
        </Txt>
        {trSentence(isReorder ? undefined : step.trPiece)}

        <Surface raised style={{ marginTop: 18, gap: 12 }}>
          {isReorder ? (
            <View style={styles.questionChip}>
              <Icon name="refresh" size={14} color={colors.accentDark} />
              <Txt variant="caption" color={colors.accentDark} style={{ fontWeight: "800" }}>
                Şimdi aynı cümleyi bağlacı ORTAYA alarak söyle.
              </Txt>
            </View>
          ) : step.question ? (
            <View style={styles.questionChip}>
              <Txt variant="caption" color={colors.accentDark} style={{ fontWeight: "800" }}>
                {step.question}
              </Txt>
            </View>
          ) : (
            <Txt variant="caption" color={colors.inkSoft}>
              Bu adımda ekle:
            </Txt>
          )}
          {!isReorder && (
            <View style={{ gap: 2 }}>
              <Txt variant="title3" color={colors.gold}>
                {step.trPiece}
              </Txt>
              <Txt variant="caption" color={colors.inkSoft}>
                → {step.trSoFar}
              </Txt>
            </View>
          )}
          {sti > 0 && !isReorder && (
            <View style={{ gap: 2 }}>
              <Txt variant="caption" color={colors.inkSoft}>
                Şu ana kadar
              </Txt>
              <Txt variant="headline" style={rtl ? styles.rtl : undefined}>
                {sentence.steps[sti - 1].target} …
              </Txt>
            </View>
          )}

          {!verdict && (
            <>
              {dictation.listening && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Wave active color={colors.accent} />
                  <Txt variant="callout" color={colors.inkSoft} style={{ flex: 1, fontStyle: "italic" }}>
                    {dictation.partial || "Dinliyorum — bırakınca biter"}
                  </Txt>
                </View>
              )}
              {dictation.error && (
                <Txt variant="caption" color={colors.danger}>
                  {dictation.error}
                </Txt>
              )}
              <TextInput
                style={[styles.input, rtl && styles.rtl]}
                value={answer}
                onChangeText={setAnswer}
                placeholder="Cümlenin tamamını söyle ya da yaz"
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="sentences"
                autoCorrect={false}
                onSubmitEditing={() => void check(answer)}
              />
            </>
          )}
        </Surface>

        {verdict && (
          <View style={[styles.verdict, { backgroundColor: verdictTone }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon
                name={revealed ? "bulb" : verdict === "dogru" ? "check" : verdict === "yakin" ? "target" : "close"}
                size={18}
                color={verdictInk}
                strokeWidth={2.6}
              />
              <Txt variant="headline" color={verdictInk} style={{ fontSize: 15 }}>
                {revealed
                  ? "Doğrusu:"
                  : verdict === "dogru"
                    ? "Doğru"
                    : verdict === "yakin"
                      ? "Çok yakın — doğrusu:"
                      : "Doğrusu:"}
              </Txt>
            </View>
            <PressableScale onPress={() => speakTarget(step.target)} accessibilityLabel="Doğrusunu dinle" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name="volume" size={20} color={colors.ink} />
              <Txt variant="title3" style={[{ flex: 1 }, rtl && styles.rtl]}>
                {step.target}
              </Txt>
            </PressableScale>
            {!!step.translit && (
              <Txt variant="caption" color={colors.inkSoft}>
                {step.translit}
              </Txt>
            )}
            {step.alts.length > 0 && (
              <Txt variant="caption" color={colors.inkSoft}>
                {ltrLine(`Ayrıca doğru: ${step.alts.join(" · ")}`)}
              </Txt>
            )}
            {!!step.note && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Icon name="bulb" size={16} color={colors.gold} />
                <Txt variant="callout" color={colors.ink} style={{ flex: 1 }}>
                  {ltrLine(step.note)}
                </Txt>
              </View>
            )}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 40 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
    focusCard: { backgroundColor: colors.deep, borderRadius: 26, padding: 20, marginBottom: 14, overflow: "hidden" },
    ladderRow: { flexDirection: "row", gap: 8, marginBottom: 22 },
    ladderCell: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 9,
      alignItems: "center",
      gap: 2,
    },
    segments: { flexDirection: "row", gap: 4, marginBottom: 18 },
    segment: { flex: 1, height: 4, borderRadius: 2 },
    questionChip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accentSoft,
      borderRadius: 14,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    contrastBox: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: colors.goldSoft,
      borderRadius: 12,
      padding: 10,
      marginTop: 2,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: 14,
      backgroundColor: colors.bg,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontFamily: "Manrope",
      fontWeight: "600",
      fontSize: 17,
      color: colors.ink,
    },
    verdict: { borderRadius: 22, padding: 16, gap: 10, marginTop: 14 },
    rtl: { writingDirection: "rtl", textAlign: "right" },
  });
}
