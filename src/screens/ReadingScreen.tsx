import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { generateReadingText } from "../claude";
import Header from "../components/Header";
import { getActivePack } from "../languages";
import { COMPLIANCE_WARN, LENGTH_SPECS, pruneReadings } from "../reading";
import { newCard } from "../srs";
import { SequenceHandle, speakSequence, speakTarget, stopSpeaking } from "../speech";
import { recordStat } from "../statsStore";
import { loadReadings, loadVocab, saveReadings, saveVocab, touchLastActivity } from "../storage";
import { ARABIC_FONT, arabicText, colors, radius, shadow, shadowLift } from "../theme";
import { Profile, ReadingLength, ReadingText } from "../types";
import { normalizeTarget } from "../textnorm";

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
        normalizeTarget(c.arabic, pack.scriptExtract) ===
        normalizeTarget(w.word, pack.scriptExtract)
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

  const badge = (r: ReadingText) =>
    r.coldStart
      ? "🌱 Başlangıç metni"
      : r.complianceRatio >= COMPLIANCE_WARN
        ? "✅ Defterine göre örüldü"
        : "🟡 Beklenenden çok yeni kelime";

  // ------------------------------------------------------------------ üretiliyor
  if (generating) {
    return (
      <View style={styles.container}>
        <Header title="Okuma Salonu" subtitle="metin yazılıyor…" onBack={onBack} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingTitle}>{pack.teacherName} metnini yazıyor…</Text>
          <Text style={styles.loadingText}>
            Kelime defterindeki kelimelerden, senin seviyende özgün bir metin örüyor.
            {"\n"}Geçen süre: {elapsed} sn
          </Text>
        </View>
      </View>
    );
  }

  // ------------------------------------------------------------------ okuyucu
  if (view === "reader" && current) {
    const showWarn = !current.coldStart && current.complianceRatio < COMPLIANCE_WARN;
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
        <ScrollView ref={readerScroll} contentContainerStyle={styles.body}>
          {error && (
            <View style={styles.warnBand}>
              <Text style={styles.warnText}>{error}</Text>
            </View>
          )}
          {showWarn && (
            <View style={styles.warnBand}>
              <Text style={styles.warnText}>
                ⚠️ Bu metinde beklenenden çok yeni kelime var.
              </Text>
              <TouchableOpacity
                onPress={() =>
                  confirmGenerate({ avoidWords: current.unplannedUnknown, regenOf: current })
                }
              >
                <Text style={styles.warnAction}>Yeniden üret ›</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.title, pack.scriptExtract && styles.rtl]}>{current.title}</Text>
          <Text style={styles.badgeLine}>{badge(current)}</Text>

          <View style={styles.listenRow}>
            <TouchableOpacity style={styles.listenButton} onPress={listen}>
              <Text style={styles.listenText}>▶️ Baştan dinle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.listenButton} onPress={stopListening}>
              <Text style={styles.listenText}>⏹ Durdur</Text>
            </TouchableOpacity>
          </View>

          {current.sentences.map((s, i) => {
            const open = revealed.has(i);
            return (
              <TouchableOpacity
                key={i}
                style={[styles.sentenceCard, activeIndex === i && styles.sentenceActive]}
                // Dinlerken okunan cümleye kendiliğinden kaydırabilmek için
                // her cümlenin dikey konumu ölçülür.
                onLayout={(e) => {
                  sentenceY.current[i] = e.nativeEvent.layout.y;
                }}
                activeOpacity={0.9}
                onPress={() =>
                  setRevealed((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
              >
                <Text style={[styles.sentenceTarget, pack.scriptExtract && styles.rtlBig]}>
                  {s.target}
                </Text>
                {open ? (
                  <View style={styles.revealBlock}>
                    {pack.scriptExtract && !!s.translit && (
                      <Text style={styles.sentenceTranslit}>{s.translit}</Text>
                    )}
                    <Text style={styles.sentenceTr}>🇹🇷 {s.tr}</Text>
                  </View>
                ) : (
                  <Text style={styles.revealHint}>çeviri için dokun</Text>
                )}
                <View style={styles.sentenceSpeakRow}>
                  <TouchableOpacity
                    hitSlop={8}
                    onPress={() => {
                      speakTarget(s.target);
                      void recordStat("readSentence");
                    }}
                  >
                    <Text style={styles.speakEmoji}>🔊</Text>
                  </TouchableOpacity>
                  <TouchableOpacity hitSlop={8} onPress={() => speakTarget(s.target, true)}>
                    <Text style={styles.speakEmoji}>🐢</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}

          {current.reviewCardIds.length > 0 && (
            <View style={styles.sectionBox}>
              <Text style={styles.sectionTitle}>🔁 Bu metinde tekrar ettiklerin</Text>
              <Text style={styles.sectionMeta}>
                {current.usedReviewWords.join(pack.scriptExtract ? " · " : " · ") ||
                  `${current.reviewCardIds.length} kelime`}
              </Text>
            </View>
          )}

          {current.newWords.length > 0 && (
            <View style={styles.sectionBox}>
              <Text style={styles.sectionTitle}>✨ Yeni kelimeler</Text>
              {current.newWords.map((w, i) => {
                const inDeck = addedWords.has(w.word);
                return (
                  <View key={i} style={styles.newWordRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.newWordTarget, pack.scriptExtract && styles.rtl]}>
                        {w.word}
                      </Text>
                      <Text style={styles.newWordMeta}>
                        {pack.scriptExtract && w.translit ? `${w.translit} — ` : ""}
                        {w.tr}
                      </Text>
                      <Text style={styles.newWordHint}>💡 {w.hint}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.addButton, inDeck && styles.addButtonDone]}
                      disabled={inDeck}
                      onPress={() => void addWordToDeck(i)}
                    >
                      <Text style={[styles.addButtonText, inDeck && styles.addButtonTextDone]}>
                        {inDeck ? "✓ Defterde" : "📇 Deftere ekle"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {current.questions.length > 0 && (
            <View style={styles.sectionBox}>
              <Text style={styles.sectionTitle}>🧠 Anlama soruları</Text>
              {current.questions.map((q, qi) => {
                const sel = quizSel[qi];
                return (
                  <View key={qi} style={styles.questionBlock}>
                    <Text style={styles.questionText}>
                      {qi + 1}. {q.q}
                    </Text>
                    {q.choices.map((c, ci) => {
                      const chosen = sel === ci;
                      const isCorrect = ci === q.answer;
                      const showState = sel !== undefined && (chosen || isCorrect);
                      return (
                        <TouchableOpacity
                          key={ci}
                          style={[
                            styles.choice,
                            showState && isCorrect && styles.choiceCorrect,
                            showState && chosen && !isCorrect && styles.choiceWrong,
                          ]}
                          disabled={sel !== undefined}
                          onPress={() => answerQuestion(qi, ci)}
                        >
                          <Text
                            style={[
                              styles.choiceText,
                              showState && isCorrect && styles.choiceTextCorrect,
                            ]}
                          >
                            {showState ? (isCorrect ? "✓ " : chosen ? "✗ " : "") : ""}
                            {c}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.sectionBox}>
            <Text style={styles.sectionTitle}>✍️ Şimdi sen</Text>
            <Text style={styles.productionInstruction}>{current.productionTask.instruction}</Text>
            <TextInput
              style={[styles.productionInput, pack.scriptExtract && styles.rtl]}
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
            <TouchableOpacity onPress={() => setShowExample((v) => !v)}>
              <Text style={styles.exampleToggle}>
                {showExample ? "Örneği gizle" : "Örneği gör"}
              </Text>
            </TouchableOpacity>
            {showExample && (
              <Text style={[styles.exampleText, pack.scriptExtract && styles.rtl]}>
                {current.productionTask.example}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.finishButton, !allAnswered && styles.finishDisabled]}
            disabled={!allAnswered}
            onPress={() => void finishReading()}
          >
            <Text style={styles.finishText}>
              {current.finishedAt
                ? "🏁 Yeniden bitir"
                : allAnswered
                  ? "🏁 Okumayı bitir"
                  : "Önce soruları cevapla"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ------------------------------------------------------------------ yeni metin
  if (view === "create") {
    const scenarioChips = pack.scenarios
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    return (
      <View style={styles.container}>
        <Header title="Yeni Metin" subtitle="konu ve uzunluk seç" onBack={() => setView("list")} />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error && (
            <View style={styles.warnBand}>
              <Text style={styles.warnText}>{error}</Text>
            </View>
          )}
          <Text style={styles.formLabel}>Konu</Text>
          <View style={styles.chipsWrap}>
            {nextReadingModule && (
              <TouchableOpacity
                style={[styles.chip, moduleId === nextReadingModule.id && styles.chipActive]}
                onPress={() => {
                  setModuleId(moduleId === nextReadingModule.id ? undefined : nextReadingModule.id);
                  setTopic("");
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    moduleId === nextReadingModule.id && styles.chipTextActive,
                  ]}
                >
                  📚 Müfredattan: {nextReadingModule.title}
                </Text>
              </TouchableOpacity>
            )}
            {scenarioChips.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, topic === s && styles.chipActive]}
                onPress={() => {
                  setTopic(topic === s ? "" : s);
                  setModuleId(undefined);
                }}
              >
                <Text style={[styles.chipText, topic === s && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
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

          <Text style={styles.formLabel}>Uzunluk</Text>
          <View style={styles.chipsWrap}>
            {(Object.keys(LENGTH_SPECS) as ReadingLength[]).map((l) => (
              <TouchableOpacity
                key={l}
                style={[styles.chip, length === l && styles.chipActive]}
                onPress={() => setLength(l)}
              >
                <Text style={[styles.chipText, length === l && styles.chipTextActive]}>
                  {LENGTH_SPECS[l].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={() => confirmGenerate()}>
            <Text style={styles.primaryButtonText}>✨ Metni hazırla</Text>
          </TouchableOpacity>
          <Text style={styles.costNote}>
            Üretim bir API isteği harcar; okuması, dinlemesi ve soruları sonsuza dek bedava.
          </Text>
        </ScrollView>
      </View>
    );
  }

  // ------------------------------------------------------------------ kütüphane
  return (
    <View style={styles.container}>
      <Header
        title="Okuma Salonu"
        subtitle={`${library.length} metin`}
        onBack={onBack}
        right={
          <TouchableOpacity style={styles.newButton} onPress={() => setView("create")}>
            <Text style={styles.newButtonText}>＋ Yeni</Text>
          </TouchableOpacity>
        }
      />
      {library.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📖</Text>
          <Text style={styles.emptyTitle}>Sana özel okuma metinleri</Text>
          <Text style={styles.emptyText}>
            {pack.teacherName}, kelime defterindeki kelimelerden — %98'i senin bildiğin,
            %2'si tam kıvamında yeni — özgün metinler yazar. Okur, dinler, soruları çözersin;
            tekrarı gelen kelimeler metnin içinde kendiliğinden tekrar edilir.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setView("create")}>
            <Text style={styles.primaryButtonText}>İlk metnini hazırlat</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {library.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.libCard}
              activeOpacity={0.85}
              onPress={() => openReader(r)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.libTitleTr}>{r.titleTr}</Text>
                <Text style={[styles.libTitle, pack.scriptExtract && styles.rtl]}>{r.title}</Text>
                <Text style={styles.libMeta}>
                  {LENGTH_SPECS[r.length].label} · {r.level} · {r.createdAt.slice(0, 10)}
                </Text>
                <Text style={styles.libBadge}>{badge(r)}</Text>
              </View>
              <Text style={styles.libRight}>
                {r.finishedAt ? `✅ ${r.quizCorrect}/${r.quizTotal}` : "›"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
  body: { padding: 16, paddingBottom: 40 },
  loadingTitle: { fontSize: 17, fontWeight: "800", color: colors.ink },
  loadingText: { fontSize: 13, color: colors.inkSoft, textAlign: "center", lineHeight: 20 },
  // writingDirection Android'de etkisizdir; yön BiDi ile içerikten çıkar.
  // Arapça fontu ve letterSpacing:0 burada verilir (bitişik yazı kopmasın).
  rtl: { textAlign: "right", fontFamily: ARABIC_FONT, letterSpacing: 0 },
  // 26/44 oranı (1.69) harekeleri kırpıyordu; arabicText 2.25 kuralını uygular.
  rtlBig: { ...arabicText(26), textAlign: "right" },
  warnBand: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  warnText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19 },
  warnAction: { color: colors.gold, fontWeight: "800", fontSize: 13 },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink, marginBottom: 4 },
  badgeLine: { fontSize: 12, color: colors.inkSoft, marginBottom: 12 },
  listenRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  listenButton: {
    flex: 1,
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  listenText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  sentenceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
    ...shadow,
  },
  sentenceActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  sentenceTarget: { fontSize: 17, color: colors.ink, lineHeight: 27 },
  revealBlock: { marginTop: 8, gap: 3 },
  sentenceTranslit: { fontSize: 13.5, color: colors.accent, fontWeight: "600" },
  sentenceTr: { fontSize: 13.5, color: colors.inkSoft, lineHeight: 19 },
  revealHint: { fontSize: 11, color: colors.inkFaint, marginTop: 6 },
  sentenceSpeakRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 8,
    justifyContent: "flex-end",
  },
  speakEmoji: { fontSize: 17 },
  sectionBox: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 8,
    marginBottom: 8,
    ...shadow,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.ink, marginBottom: 8 },
  sectionMeta: { fontSize: 13.5, color: colors.inkSoft, lineHeight: 21 },
  newWordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  newWordTarget: { fontSize: 19, color: colors.ink },
  newWordMeta: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  newWordHint: { fontSize: 12, color: colors.gold, marginTop: 3, lineHeight: 17 },
  addButton: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addButtonDone: { backgroundColor: colors.bg },
  addButtonText: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  addButtonTextDone: { color: colors.inkFaint },
  questionBlock: { marginBottom: 12 },
  questionText: { fontSize: 14.5, fontWeight: "700", color: colors.ink, marginBottom: 8 },
  choice: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  choiceCorrect: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  choiceWrong: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  choiceText: { fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  choiceTextCorrect: { fontWeight: "700", color: colors.accentDark },
  productionInstruction: { fontSize: 13.5, color: colors.ink, lineHeight: 20, marginBottom: 10 },
  productionInput: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.bg,
    textAlignVertical: "top",
  },
  exampleToggle: { color: colors.accent, fontWeight: "700", fontSize: 13, marginTop: 10 },
  exampleText: {
    marginTop: 8,
    fontSize: 15,
    color: colors.inkSoft,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 10,
    lineHeight: 24,
  },
  finishButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
    ...shadowLift,
  },
  finishDisabled: { opacity: 0.4 },
  finishText: { color: "#FFFFFF", fontSize: 15.5, fontWeight: "800" },
  formLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 6,
  },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: colors.deep, borderColor: colors.deep },
  chipText: { fontSize: 13, color: colors.ink, fontWeight: "600" },
  chipTextActive: { color: colors.onDeep },
  topicInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 14.5,
    color: colors.ink,
    backgroundColor: colors.card,
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 30,
    alignItems: "center",
    marginTop: 8,
    ...shadowLift,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15.5, fontWeight: "800" },
  costNote: {
    fontSize: 12,
    color: colors.inkFaint,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 17,
  },
  newButton: {
    backgroundColor: colors.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newButtonText: { color: colors.gold, fontWeight: "800", fontSize: 12 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  emptyText: { fontSize: 13.5, color: colors.inkSoft, textAlign: "center", lineHeight: 20 },
  libCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
    ...shadow,
  },
  libTitleTr: { fontSize: 15.5, fontWeight: "800", color: colors.ink },
  libTitle: { fontSize: 15, color: colors.inkSoft, marginTop: 2 },
  libMeta: { fontSize: 11.5, color: colors.inkFaint, marginTop: 4 },
  libBadge: { fontSize: 11.5, color: colors.inkSoft, marginTop: 3 },
  libRight: { fontSize: 15, color: colors.inkFaint, fontWeight: "700" },
});
