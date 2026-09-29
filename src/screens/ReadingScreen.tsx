import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { generateReadingText } from "../claude";
import Header from "../components/Header";
import Icon from "../components/Icon";
import type { IconName } from "../components/Icon";
import {
  Button,
  Chip,
  Empty,
  IconButton,
  ListGroup,
  PressableScale,
  Screen,
  SectionLabel,
  Segmented,
  Surface,
  TargetText,
  TeacherAvatar,
  Txt,
} from "../components/kit";
import { ltrLine } from "../richtext";
import { getActivePack } from "../languages";
import { COMPLIANCE_WARN, LENGTH_SPECS, pruneReadings } from "../reading";
import { newCard } from "../srs";
import { SequenceHandle, speakSequence, speakTarget, stopSpeaking } from "../speech";
import { recordStat } from "../statsStore";
import { loadReadings, loadVocab, saveReadings, saveVocab, touchLastActivity } from "../storage";
import { arabicText, shadow } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
import { Profile, ReadingLength, ReadingText } from "../types";
import { normalizeTarget } from "../textnorm";
import { isRtl, needsTranslit } from "../scripts";

interface Props {
  profile: Profile;
  onBack: () => void;
}

type View_ = "list" | "create" | "reader";

/**
 * Okuma Salonu: hocanın, öğrencinin KENDİ kelime defterinden ördüğü metinler.
 * Üretim tek API çağrısı; okuma, dinleme, sorular ve deftere ekleme tamamen
 * cihazda ve bedava. Ekranı açmak tek başına hiçbir istek harcamaz.
 */
export default function ReadingScreen({ profile, onBack }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const pack = getActivePack();
  const [view, setView] = useState<View_>("list");
  const [library, setLibrary] = useState<ReadingText[]>([]);
  const [current, setCurrent] = useState<ReadingText | null>(null);
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // create
  const [topic, setTopic] = useState("");
  const [moduleId, setModuleId] = useState<string | undefined>(undefined);
  const [length, setLength] = useState<ReadingLength>("orta");

  // reader
  const [activeIndex, setActiveIndex] = useState(-1);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [quizSel, setQuizSel] = useState<Record<number, number>>({});
  const [production, setProduction] = useState("");
  const [showExample, setShowExample] = useState(false);
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set());
  const handleRef = useRef<SequenceHandle | null>(null);
  /** Okuyucu kaydırma alanı ve her cümlenin dikey konumu — otomatik takip için. */
  const readerScroll = useRef<ScrollView | null>(null);
  const sentenceY = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void (async () => setLibrary(await loadReadings()))();
    return () => {
      handleRef.current?.cancel();
      stopSpeaking();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /** Sıradaki tamamlanmamış okuma modülü — "Müfredattan" çipi için. */
  const nextReadingModule = profile.curriculum?.modules.find(
    (m) => m.track === "okuma" && !profile.completedModuleIds.includes(m.id)
  );

  const openReader = (text: ReadingText) => {
    handleRef.current?.cancel();
    setCurrent(text);
    setActiveIndex(-1);
    setRevealed(new Set());
    setQuizSel({});
    setProduction("");
    setShowExample(false);
    setAddedWords(new Set());
    setView("reader");
  };

  const generate = async (opts: { avoidWords?: string[]; regenOf?: ReadingText } = {}) => {
    setGenerating(true);
    setError(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    try {
      const vocab = await loadVocab();
      const src = opts.regenOf;
      const text = await generateReadingText(profile, vocab, {
        topic: src ? src.topic : topic.trim() || undefined,
        moduleId: src ? src.moduleId : moduleId,
        length: src ? src.length : length,
        avoidWords: opts.avoidWords,
      });
      const next = pruneReadings([text, ...library]);
      setLibrary(next);
      await saveReadings(next);
      void touchLastActivity();
      openReader(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setView(opts.regenOf ? "reader" : "create");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setGenerating(false);
    }
  };

  const confirmGenerate = (opts: { avoidWords?: string[]; regenOf?: ReadingText } = {}) => {
    Alert.alert(
      opts.regenOf ? "Yeniden üret" : "Yeni metin",
      `${pack.teacherName} kelimelerinden ${opts.regenOf ? "aynı konuda yeni" : "sana özel"} bir metin yazsın mı? Bu bir API isteği harcar (yaklaşık birkaç lira).`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Evet, yazsın", onPress: () => void generate(opts) },
      ]
    );
  };

  const listen = () => {
    if (!current) return;
    handleRef.current?.cancel();
    handleRef.current = speakSequence(
      current.sentences.map((s) => s.target),
      {
        onSentence: (i) => {
          setActiveIndex(i);
          void recordStat("readSentence");
          // Okunan cümle ekrandan kaçmasın: üstte bir tutam boşluk bırakarak
          // ona kaydır (denetimdeki en kritik okuma kusuru buydu).
          const y = sentenceY.current[i];
          if (typeof y === "number") {
            readerScroll.current?.scrollTo({ y: Math.max(y - 90, 0), animated: true });
          }
        },
        onDone: () => setActiveIndex(-1),
      }
    );
  };

  const stopListening = () => {
    handleRef.current?.cancel();
    setActiveIndex(-1);
  };

  const addWordToDeck = async (wordIdx: number) => {
    if (!current) return;
    const w = current.newWords[wordIdx];
    const cards = await loadVocab();
    const dup = cards.find(
      (c) =>
        normalizeTarget(c.arabic, pack.script) ===
        normalizeTarget(w.word, pack.script)
    );
    if (!dup) {
      const card = newCard(w.word, w.translit, w.tr, "okuma", w.hint, "orta");
      await saveVocab([...cards, card]);
      const updated: ReadingText = { ...current, addedWordIds: [...current.addedWordIds, card.id] };
      setCurrent(updated);
      const next = library.map((r) => (r.id === updated.id ? updated : r));
      setLibrary(next);
      await saveReadings(next);
    }
    setAddedWords((prev) => new Set(prev).add(w.word));
  };

  const answerQuestion = (qi: number, ci: number) => {
    if (quizSel[qi] !== undefined) return; // cevap kilitli
    setQuizSel((prev) => ({ ...prev, [qi]: ci }));
  };

  const allAnswered = current ? Object.keys(quizSel).length >= current.questions.length : false;
  const quizCorrect = current
    ? current.questions.filter((q, i) => quizSel[i] === q.answer).length
    : 0;

  const finishReading = async () => {
    if (!current) return;
    const updated: ReadingText = {
      ...current,
      finishedAt: new Date().toISOString(),
      quizCorrect,
      quizTotal: current.questions.length,
    };
    const next = library.map((r) => (r.id === updated.id ? updated : r));
    setLibrary(next);
    await saveReadings(next);
    void recordStat("readingFinished");
    void touchLastActivity();
    stopListening();
    Alert.alert(
      "Tebrikler! 🏁",
      `Metni bitirdin. Anlama: ${quizCorrect}/${current.questions.length} doğru.`,
      [{ text: "Kütüphaneye dön", onPress: () => setView("list") }]
    );
  };

  const badge = (r: ReadingText): { text: string; tone: "gold" | "accent" | "danger"; icon: IconName } =>
    r.coldStart
      ? { text: "Başlangıç metni", tone: "gold", icon: "sparkles" }
      : r.complianceRatio >= COMPLIANCE_WARN
        ? { text: "Defterine göre örüldü", tone: "accent", icon: "check" }
        : { text: "Beklenenden çok yeni kelime", tone: "danger", icon: "alert" };

  const badgeView = (r: ReadingText) => {
    const b = badge(r);
    const fg = b.tone === "gold" ? colors.gold : b.tone === "accent" ? colors.accentDark : colors.danger;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Icon name={b.icon} size={13} color={fg} strokeWidth={2.4} />
        <Txt variant="caption" color={fg} style={{ fontWeight: "700" }}>
          {b.text}
        </Txt>
      </View>
    );
  };

  // ------------------------------------------------------------------ üretiliyor
  if (generating) {
    return (
      <View style={styles.container}>
        <Header title="Okuma Salonu" subtitle="metin yazılıyor…" onBack={onBack} />
        <View style={styles.center}>
          <TeacherAvatar size={76} speaking />
          <Txt variant="title3" center>
            {pack.teacherName} metnini yazıyor…
          </Txt>
          <Txt variant="callout" color={colors.inkSoft} center>
            Kelime defterindeki kelimelerden, senin seviyende özgün bir metin örüyor.
          </Txt>
          <Txt variant="caption" color={colors.inkFaint}>
            Geçen süre: {elapsed} sn
          </Txt>
        </View>
      </View>
    );
  }

  // ------------------------------------------------------------------ okuyucu
  if (view === "reader" && current) {
    const showWarn = !current.coldStart && current.complianceRatio < COMPLIANCE_WARN;
    const rtl = isRtl(pack.script);
    return (
      <View style={styles.container}>
        <Header
          title={current.titleTr}
          subtitle={`${LENGTH_SPECS[current.length].label} · ${current.level}`}
          onBack={() => {
            stopListening();
            setView("list");
          }}
        />
        <ScrollView ref={readerScroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {error && (
            <Surface tone="sunken" style={{ marginBottom: 12 }}>
              <Txt variant="callout" color={colors.danger}>
                {error}
              </Txt>
            </Surface>
          )}
          {showWarn && (
            <Surface tone="gold" style={{ marginBottom: 12, gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Icon name="alert" size={17} color={colors.gold} />
                <Txt variant="callout" style={{ flex: 1 }}>
                  Bu metinde beklenenden çok yeni kelime var.
                </Txt>
              </View>
              <Button
                variant="secondary"
                size="sm"
                icon="refresh"
                label="Yeniden üret"
                style={{ alignSelf: "flex-start" }}
                onPress={() => confirmGenerate({ avoidWords: current.unplannedUnknown, regenOf: current })}
              />
            </Surface>
          )}

          <Text style={[styles.title, rtl ? arabicText(30, true) : null, rtl && styles.rtl]}>{current.title}</Text>
          <View style={{ marginTop: 6, marginBottom: 14 }}>{badgeView(current)}</View>

          <View style={styles.listenRow}>
            <Button size="md" icon="play" label="Baştan dinle" onPress={listen} style={{ flex: 1 }} />
            <IconButton icon="stop" label="Durdur" variant="outline" size={46} onPress={stopListening} />
          </View>

          <View style={{ gap: 10 }}>
            {current.sentences.map((st, i) => {
              const open = revealed.has(i);
              const active = activeIndex === i;
              return (
                <Pressable
                  key={i}
                  style={[styles.sentenceCard, active && styles.sentenceActive]}
                  // Dinlerken okunan cümleye kendiliğinden kaydırabilmek için
                  // her cümlenin dikey konumu ölçülür.
                  onLayout={(e) => {
                    sentenceY.current[i] = e.nativeEvent.layout.y;
                  }}
                  onPress={() =>
                    setRevealed((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                >
                  <Text style={[styles.sentenceTarget, rtl && styles.rtlBig]}>{st.target}</Text>
                  {open ? (
                    <View style={{ gap: 3, marginTop: 6 }}>
                      {needsTranslit(pack.script) && !!st.translit && (
                        <Txt variant="caption" color={colors.inkSoft} style={{ fontStyle: "italic" }}>
                          {st.translit}
                        </Txt>
                      )}
                      <Txt variant="callout">{st.tr}</Txt>
                    </View>
                  ) : (
                    <Txt variant="caption" color={colors.inkFaint} style={{ marginTop: 4 }}>
                      çeviri için dokun
                    </Txt>
                  )}
                  <View style={styles.sentenceSpeakRow}>
                    <IconButton
                      icon="volume"
                      label="Cümleyi dinle"
                      variant="soft"
                      size={32}
                      onPress={() => {
                        speakTarget(st.target);
                        void recordStat("readSentence");
                      }}
                    />
                    <IconButton icon="slow" label="Yavaş dinle" variant="soft" size={32} onPress={() => speakTarget(st.target, true)} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {current.reviewCardIds.length > 0 && (
            <Surface tone="soft" style={{ marginTop: 18, gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Icon name="repeat" size={16} color={colors.accentDark} />
                <Txt variant="headline" color={colors.accentDark} style={{ fontSize: 14 }}>
                  Bu metinde tekrar ettiklerin
                </Txt>
              </View>
              <Txt variant="callout" style={rtl ? styles.rtl : undefined}>
                {current.usedReviewWords.join(" · ") || `${current.reviewCardIds.length} kelime`}
              </Txt>
            </Surface>
          )}

          {current.newWords.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <SectionLabel title="Yeni kelimeler" />
              <ListGroup>
                {current.newWords.map((w, i) => {
                  const inDeck = addedWords.has(w.word);
                  return (
                    <View key={i} style={styles.newWordRow}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <TargetText size={rtl ? 22 : 17} align="left">
                          {w.word}
                        </TargetText>
                        <Txt variant="callout" color={colors.inkSoft}>
                          {needsTranslit(pack.script) && w.translit ? `${w.translit} — ` : ""}
                          {w.tr}
                        </Txt>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          <Icon name="bulb" size={14} color={colors.gold} />
                          <Txt variant="caption" color={colors.inkSoft} style={{ flex: 1 }}>
                            {ltrLine(w.hint)}
                          </Txt>
                        </View>
                      </View>
                      <Button
                        variant={inDeck ? "ghost" : "secondary"}
                        size="sm"
                        icon={inDeck ? "check" : "bookmark"}
                        label={inDeck ? "Defterde" : "Deftere ekle"}
                        disabled={inDeck}
                        onPress={() => void addWordToDeck(i)}
                      />
                    </View>
                  );
                })}
              </ListGroup>
            </View>
          )}

          {current.questions.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <SectionLabel title="Anlama soruları" />
              <View style={{ gap: 12 }}>
                {current.questions.map((q, qi) => {
                  const sel = quizSel[qi];
                  return (
                    <Surface key={qi} style={{ gap: 8 }}>
                      <Txt variant="bodyStrong">
                        {qi + 1}. {q.q}
                      </Txt>
                      {q.choices.map((ch, ci) => {
                        const chosen = sel === ci;
                        const isCorrect = ci === q.answer;
                        const showState = sel !== undefined && (chosen || isCorrect);
                        const tone = showState ? (isCorrect ? "ok" : chosen ? "bad" : null) : null;
                        return (
                          <PressableScale
                            key={ci}
                            style={[
                              styles.choice,
                              tone === "ok" && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
                              tone === "bad" && { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
                            ]}
                            disabled={sel !== undefined}
                            onPress={() => answerQuestion(qi, ci)}
                            accessibilityLabel={tone === "ok" ? `doğru: ${ch}` : tone === "bad" ? `yanlış: ${ch}` : ch}
                          >
                            {tone && (
                              <Icon
                                name={tone === "ok" ? "check" : "close"}
                                size={16}
                                color={tone === "ok" ? colors.accentDark : colors.danger}
                                strokeWidth={2.6}
                              />
                            )}
                            <Txt
                              variant="callout"
                              color={tone === "ok" ? colors.accentDark : tone === "bad" ? colors.danger : colors.ink}
                              style={{ flex: 1, fontWeight: tone ? "700" : "600" }}
                            >
                              {ch}
                            </Txt>
                          </PressableScale>
                        );
                      })}
                    </Surface>
                  );
                })}
              </View>
            </View>
          )}

          <View style={{ marginTop: 22 }}>
            <SectionLabel title="Şimdi sen" />
            <Surface style={{ gap: 10 }}>
              <Txt variant="callout">{current.productionTask.instruction}</Txt>
              <TextInput
                style={[styles.productionInput, rtl && styles.rtl]}
                value={production}
                onChangeText={setProduction}
                onEndEditing={() => {
                  // Yazım bittiğinde sayılır — ilk harfte değil (dürüst sayaç).
                  if (production.trim().length > 0) void recordStat("produced");
                }}
                placeholder="Cevabını buraya yaz…"
                placeholderTextColor={colors.inkFaint}
                multiline
              />
              <PressableScale onPress={() => setShowExample((v) => !v)} accessibilityLabel="Örnek" haptic={false}>
                <Txt variant="caption" color={colors.accentDark} style={{ fontWeight: "800" }}>
                  {showExample ? "Örneği gizle" : "Örneği gör"}
                </Txt>
              </PressableScale>
              {showExample && (
                <TargetText size={rtl ? 20 : 16} align={rtl ? "right" : "left"}>
                  {current.productionTask.example}
                </TargetText>
              )}
            </Surface>
          </View>

          <Button
            style={{ marginTop: 20 }}
            icon={allAnswered ? "award" : undefined}
            label={current.finishedAt ? "Yeniden bitir" : allAnswered ? "Okumayı bitir" : "Önce soruları cevapla"}
            disabled={!allAnswered}
            onPress={() => void finishReading()}
          />
        </ScrollView>
      </View>
    );
  }

  // ------------------------------------------------------------------ yeni metin
  if (view === "create") {
    const scenarioChips = pack.scenarios
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 6);
    return (
      <Screen
        header={<Header title="Yeni Metin" subtitle="konu ve uzunluk seç" onBack={() => setView("list")} />}
        footer={
          <View style={{ gap: 8 }}>
            <Button icon="sparkles" label="Metni hazırla" onPress={() => confirmGenerate()} />
            <Txt variant="caption" color={colors.inkFaint} center>
              Üretim bir API isteği harcar; okuması, dinlemesi ve soruları sonsuza dek bedava.
            </Txt>
          </View>
        }
      >
        {error && (
          <Surface tone="sunken" style={{ marginBottom: 12 }}>
            <Txt variant="callout" color={colors.danger}>
              {error}
            </Txt>
          </Surface>
        )}
        <SectionLabel title="Konu" />
        <View style={styles.chipsWrap}>
          {nextReadingModule && (
            <Chip
              icon="layers"
              label={`Müfredattan: ${nextReadingModule.title}`}
              selected={moduleId === nextReadingModule.id}
              onPress={() => {
                setModuleId(moduleId === nextReadingModule.id ? undefined : nextReadingModule.id);
                setTopic("");
              }}
            />
          )}
          {scenarioChips.map((x) => (
            <Chip
              key={x}
              label={x}
              selected={topic === x}
              onPress={() => {
                setTopic(topic === x ? "" : x);
                setModuleId(undefined);
              }}
            />
          ))}
        </View>
        <TextInput
          style={styles.topicInput}
          value={topic}
          onChangeText={(t) => {
            setTopic(t);
            if (t) setModuleId(undefined);
          }}
          placeholder="…ya da kendi konunu yaz (boş bırakırsan hoca seçer)"
          placeholderTextColor={colors.inkFaint}
        />

        <SectionLabel title="Uzunluk" style={{ marginTop: 22 }} />
        <Segmented<ReadingLength>
          options={(Object.keys(LENGTH_SPECS) as ReadingLength[]).map((l) => ({ key: l, label: LENGTH_SPECS[l].label }))}
          value={length}
          onChange={setLength}
        />
      </Screen>
    );
  }

  // ------------------------------------------------------------------ kütüphane
  return (
    <View style={styles.container}>
      <Header
        title="Okuma Salonu"
        subtitle={`${library.length} metin`}
        onBack={onBack}
        right={<Button size="sm" icon="plus" label="Yeni" onPress={() => setView("create")} />}
      />
      {library.length === 0 ? (
        <Empty
          icon="bookOpen"
          title="Sana özel okuma metinleri"
          text={`${pack.teacherName}, kelime defterindeki kelimelerden — %98'i senin bildiğin, %2'si tam kıvamında yeni — özgün metinler yazar. Okur, dinler, soruları çözersin; tekrarı gelen kelimeler metnin içinde kendiliğinden tekrar edilir.`}
          action={<Button icon="sparkles" label="İlk metnini hazırlat" onPress={() => setView("create")} style={{ marginTop: 10 }} />}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12 }}>
            {library.map((r) => (
              <PressableScale key={r.id} onPress={() => openReader(r)} accessibilityLabel={r.titleTr}>
                <Surface style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Txt variant="title3">{r.titleTr}</Txt>
                    <TargetText size={isRtl(pack.script) ? 19 : 15} align="left" color={colors.inkSoft}>
                      {r.title}
                    </TargetText>
                    <Txt variant="caption" color={colors.inkFaint}>
                      {LENGTH_SPECS[r.length].label} · {r.level} · {r.createdAt.slice(0, 10)}
                    </Txt>
                    {badgeView(r)}
                  </View>
                  {r.finishedAt ? (
                    <View style={{ alignItems: "center", gap: 2 }}>
                      <Icon name="award" size={20} color={colors.gold} />
                      <Txt variant="caption" color={colors.gold} style={{ fontWeight: "800" }}>
                        {`${r.quizCorrect}/${r.quizTotal}`}
                      </Txt>
                    </View>
                  ) : (
                    <Icon name="chevronRight" size={20} color={colors.inkFaint} />
                  )}
                </Surface>
              </PressableScale>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
    body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 40 },
    title: { fontFamily: "Fraunces", fontWeight: "600", fontSize: 26, lineHeight: 32, color: colors.ink },
    rtl: { writingDirection: "rtl", textAlign: "right" },
    rtlBig: { writingDirection: "rtl", textAlign: "right", ...arabicText(24) },
    listenRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 16 },
    sentenceCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      ...shadow,
    },
    sentenceActive: { borderColor: colors.goldDeep, backgroundColor: colors.goldSoft },
    sentenceTarget: { fontFamily: "Manrope", fontWeight: "700", fontSize: 18, lineHeight: 26, color: colors.ink },
    sentenceSpeakRow: { flexDirection: "row", gap: 8, marginTop: 10 },
    newWordRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    choice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.bg,
    },
    productionInput: {
      minHeight: 90,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 14,
      fontFamily: "Manrope",
      fontSize: 16,
      color: colors.ink,
      backgroundColor: colors.bg,
      textAlignVertical: "top",
    },
    chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    topicInput: {
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontFamily: "Manrope",
      fontSize: 15,
      color: colors.ink,
      backgroundColor: colors.card,
    },
  });
}
