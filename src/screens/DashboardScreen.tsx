import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AgentContext, TEACHER_TOOLS } from "../agent";
import { agenticChat, generateCurriculum } from "../claude";
import { getActivePack, LANGUAGE_LIST, LanguageId } from "../languages";
import { pendingReminders } from "../notifications";
import { memoryContext, retentionDigest, wakeCheckEvent, wakeCheckSystem } from "../prompts";
import { dueCards } from "../srs";
import { loadStatsSummary } from "../statsStore";
import {
  loadLastActivity,
  loadMistakes,
  loadNotes,
  loadVocab,
  loadWakeCheck,
  saveWakeCheck,
} from "../storage";
import { colors, radius, shadow, shadowLift } from "../theme";
import {
  Curriculum,
  CurriculumModule,
  defaultAssessment,
  NavigationSuggestion,
  Profile,
  Track,
} from "../types";

interface Props {
  profile: Profile;
  onOpenModule: (module: CurriculumModule) => void;
  onFreeChat: () => void;
  onQuiz: () => void;
  onOpenReview: () => void;
  onOpenMistakes: () => void;
  onOpenPronunciation: () => void;
  onOpenReading: () => void;
  onOpenShadowing: () => void;
  onSwitchLanguage: (id: LanguageId) => void;
  onOpenLevel: () => void;
  /** Panelden kurulan müfredatı profile yazar. */
  onCurriculumBuilt: (curriculum: Curriculum) => void;
  onLevelUp: () => void;
  onOpenSettings: () => void;
  onReset: () => void;
}

export default function DashboardScreen({
  profile,
  onOpenModule,
  onFreeChat,
  onQuiz,
  onOpenReview,
  onOpenMistakes,
  onOpenPronunciation,
  onOpenReading,
  onOpenShadowing,
  onSwitchLanguage,
  onOpenLevel,
  onCurriculumBuilt,
  onLevelUp,
  onOpenSettings,
  onReset,
}: Props) {
  const pack = getActivePack();
  const { assessment, curriculum, completedModuleIds } = profile;
  const tracks: Track[] = ["konusma", "okuma"];
  const [vocabTotal, setVocabTotal] = useState(0);
  const [vocabDue, setVocabDue] = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [weekLine, setWeekLine] = useState<string | null>(null);
  const [buildingCurriculum, setBuildingCurriculum] = useState(false);
  const [buildElapsed, setBuildElapsed] = useState(0);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [teacherNote, setTeacherNote] = useState<string | null>(null);
  const [teacherSuggestion, setTeacherSuggestion] = useState<NavigationSuggestion | null>(null);
  const wakeStarted = React.useRef(false);

  const totalModules = curriculum?.modules.length ?? 0;
  const doneModules =
    curriculum?.modules.filter((m) => completedModuleIds.includes(m.id)).length ?? 0;
  const progress = totalModules > 0 ? doneModules / totalModules : 0;

  useEffect(() => {
    void (async () => {
      const [cards, mistakes, stats] = await Promise.all([
        loadVocab(),
        loadMistakes(),
        loadStatsSummary(),
      ]);
      setVocabTotal(cards.length);
      setVocabDue(dueCards(cards).length);
      setMistakeCount(mistakes.filter((m) => !m.resolved).length);
      // Üretim odaklı hafta özeti — gün serisi değil: ne ÜRETTİN?
      const w = stats.week;
      const produced = w.produced ?? 0;
      const reviewed = w.reviewed ?? 0;
      const shadowed = w.shadowed ?? 0;
      const read = w.readSentence ?? 0;
      if (produced + reviewed + shadowed + read > 0) {
        const parts: string[] = [];
        if (produced > 0) parts.push(`${produced} cümle ürettin`);
        if (reviewed > 0) parts.push(`${reviewed} kelime tekrar ettin`);
        if (read > 0) parts.push(`${read} cümle okudun`);
        if (shadowed > 0) parts.push(`${shadowed} gölgeleme yaptın`);
        setWeekLine(`Bu hafta: ${parts.join(" · ")} — ${stats.activeDays7} gün aktiftin.`);
      }
    })();
  }, []);

  /**
   * Uyanış kontrolü: uygulama açıldığında Üstaz duruma bakar ve gerekirse
   * panele kişisel bir karşılama notu bırakır. En fazla 12 saatte bir çalışır;
   * tetik yoksa (tekrar birikmemiş, ara verilmemiş) API'ye hiç gitmez.
   */
  useEffect(() => {
    if (wakeStarted.current || !curriculum) return;
    wakeStarted.current = true;
    void (async () => {
      try {
        const HOURS_12 = 12 * 3600 * 1000;
        const previous = await loadWakeCheck();
        if (previous && Date.now() - new Date(previous.at).getTime() < HOURS_12) {
          setTeacherNote(previous.message);
          return;
        }
        const [cards, mistakes, notes, lastActivity, reminders] = await Promise.all([
          loadVocab(),
          loadMistakes(),
          loadNotes(),
          loadLastActivity(),
          pendingReminders(),
        ]);
        const due = dueCards(cards).length;
        const daysSince = lastActivity
          ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
          : 0;
        if (due < 5 && daysSince < 2) return; // dürtecek bir şey yok — sessiz kal

        const digest = `${due} kelimenin tekrarı gelmiş; öğrenci ${
          daysSince === 0 ? "bugün de çalışmış" : `${daysSince} gündür çalışmamış`
        }; açık hata sayısı ${mistakes.filter((m) => !m.resolved).length}; kurulu hatırlatıcı ${reminders.length} adet.`;

        const ctx: AgentContext = { profile, profileChanged: false };
        const reply = await agenticChat(
          {
            stable: wakeCheckSystem(profile),
            dynamic: memoryContext(mistakes, notes) + retentionDigest(cards),
          },
          [{ role: "user", content: wakeCheckEvent(digest) }],
          ctx,
          { tools: TEACHER_TOOLS, maxRounds: 6, effort: "medium" }
        );
        await saveWakeCheck({ at: new Date().toISOString(), message: reply.text });
        setTeacherNote(reply.text);
        if (ctx.pendingNavigation) setTeacherSuggestion(ctx.pendingNavigation);
      } catch {
        // Karşılama notu süs değil ama can damarı da değil — sessizce vazgeç.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSuggestionPress = () => {
    const s = teacherSuggestion;
    if (!s) return;
    if (s.screen === "review") onOpenReview();
    else if (s.screen === "quiz") onQuiz();
    else if (s.screen === "pronunciation") onOpenPronunciation();
    else if (s.screen === "reading") onOpenReading();
    else if (s.screen === "shadowing") onOpenShadowing();
    else if (s.screen === "mistakes") onOpenMistakes();
    else if (s.screen === "module") {
      const target = curriculum?.modules.find((m) => m.id === s.moduleId);
      if (target) onOpenModule(target);
    }
  };

  /**
   * Müfredat kurulumu: seviye tespiti YOK — sıfırdan (A0) başlangıç varsayılır,
   * hoca zamanla seviyeyi kendisi yükseltir. Tek yapılandırılmış çağrı;
   * varsa hata defteri/notlardaki gözlemler prompta beslenir.
   */
  const buildCurriculum = async () => {
    setBuildingCurriculum(true);
    setBuildError(null);
    setBuildElapsed(0);
    const timer = setInterval(() => setBuildElapsed((n) => n + 1), 1000);
    try {
      const [mistakes, notes] = await Promise.all([loadMistakes(), loadNotes()]);
      const observations = [
        ...mistakes.slice(-10).map((m) => `- [${m.topic}] "${m.mistake}" → "${m.correction}"`),
        ...notes.slice(-5).map((n) => `- ${n.note}`),
      ].join("\n");
      const curriculum = await generateCurriculum(
        profile,
        profile.assessment ?? defaultAssessment(),
        observations || undefined
      );
      if ((curriculum.modules?.length ?? 0) < 4) {
        throw new Error("Müfredat beklenenden kısa geldi. Tekrar denemek genelde çözer.");
      }
      onCurriculumBuilt(curriculum);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(timer);
      setBuildingCurriculum(false);
    }
  };

  const startCurriculumBuild = () => {
    if (buildingCurriculum) return;
    Alert.alert(
      "Müfredatı kur",
      `${pack.teacherName} sıfırdan başlangıç için iki parkurluk müfredat tasarlasın mı? Bu bir API isteği harcar (yaklaşık birkaç lira).`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Evet, kursun", onPress: () => void buildCurriculum() },
      ]
    );
  };

  // Defter boşken sınav başlatmak, hocanın "tekrar edecek kelime yok" demesi
  // için boşuna bir API çağrısı harcıyordu.
  const startQuiz = () => {
    if (vocabTotal === 0) {
      Alert.alert(
        "Kelime defteri boş",
        `Önce ${pack.teacherName} ile bir ders yap — öğrendiğin kelimeleri kendisi deftere ekleyecek. Sınav ondan sonra anlamlı olur.`
      );
      return;
    }
    onQuiz();
  };

  const openMenu = () => {
    Alert.alert("Ayarlar", undefined, [
      { text: "Model ve Anahtarlar", onPress: onOpenSettings },
      { text: "Sıfırla", style: "destructive", onPress: confirmReset },
      { text: "Vazgeç", style: "cancel" },
    ]);
  };

  const confirmReset = () => {
    Alert.alert("Sıfırla", "Tüm ilerleme ve ayarlar silinecek. Emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Sıfırla", style: "destructive", onPress: onReset },
    ]);
  };

  const pickLanguage = () => {
    Alert.alert(
      "Dil değiştir",
      "Her dilin müfredatı, kelime defteri ve hafızası ayrı tutulur.",
      [
        ...LANGUAGE_LIST.filter((l) => l.id !== pack.id).map((l) => ({
          text: `${l.flag} ${l.label} (${l.teacherName})`,
          onPress: () => onSwitchLanguage(l.id),
        })),
        { text: "Vazgeç", style: "cancel" as const },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} bounces={false}>
      <LinearGradient
        colors={[colors.deep, colors.deepAlt]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroSalam}>{pack.greeting}</Text>
            <Text style={styles.heroName}>{profile.name}</Text>
          </View>
          <TouchableOpacity onPress={pickLanguage} style={styles.langButton} hitSlop={8}>
            <Text style={styles.langButtonText}>
              {pack.flag} {pack.label}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openMenu} style={styles.resetButton} hitSlop={8}>
            <Text style={styles.resetText}>⋯</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.levelRow}
          onPress={onOpenLevel}
          activeOpacity={0.85}
        >
          <View style={styles.levelChip}>
            <Text style={styles.levelChipLabel}>🗣️ Konuşma</Text>
            <Text style={styles.levelChipValue}>{assessment?.speakingLevel ?? "-"}</Text>
          </View>
          <View style={styles.levelChip}>
            <Text style={styles.levelChipLabel}>📖 Okuma</Text>
            <Text style={styles.levelChipValue}>{assessment?.readingLevel ?? "-"}</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.levelHint}>Seviye raporun için dokun ›</Text>

        <View style={styles.progressBlock}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>Müfredat ilerlemesi</Text>
            <Text style={styles.progressValue}>
              {doneModules}/{totalModules} modül
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(progress * 100, 2)}%` }]} />
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {totalModules > 0 && doneModules === totalModules && (
          <TouchableOpacity style={styles.levelUpCard} onPress={onLevelUp} activeOpacity={0.85}>
            <Text style={styles.levelUpEmoji}>🎓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.levelUpTitle}>Bu seviyeyi bitirdin</Text>
              <Text style={styles.levelUpText}>
                {totalModules} modülün hepsi tamam. {pack.teacherName} ilerlemene baksın ve
                sıradaki seviyenin müfredatını kursun.
              </Text>
            </View>
            <Text style={styles.levelUpArrow}>›</Text>
          </TouchableOpacity>
        )}

        {teacherNote && (
          <View style={styles.teacherNoteCard}>
            <View style={styles.teacherNoteHeader}>
              <View style={styles.teacherAvatar}>
                <Text style={styles.teacherAvatarText}>{pack.avatarLetter}</Text>
              </View>
              <Text style={styles.teacherNoteTitle}>Hocandan not</Text>
            </View>
            <Text style={styles.teacherNoteText}>{teacherNote}</Text>
            {teacherSuggestion && (
              <TouchableOpacity style={styles.teacherNoteButton} onPress={onSuggestionPress}>
                <Text style={styles.teacherNoteButtonText}>{teacherSuggestion.label} ›</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {weekLine && (
          <View style={styles.weekCard}>
            <Text style={styles.weekText}>📈 {weekLine}</Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{vocabTotal}</Text>
            <Text style={styles.statLabel}>kelime</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={[styles.statValue, vocabDue > 0 && { color: colors.danger }]}>
              {vocabDue}
            </Text>
            <Text style={styles.statLabel}>tekrar bekliyor</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{mistakeCount}</Text>
            <Text style={styles.statLabel}>açık hata</Text>
          </View>
        </View>

        <TouchableOpacity onPress={onFreeChat} activeOpacity={0.85}>
          <LinearGradient
            colors={[colors.accent, colors.accentDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.chatButton}
          >
            <Text style={styles.chatButtonEmoji}>💬</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.chatButtonTitle}>{pack.teacherName} ile Serbest Sohbet</Text>
              <Text style={styles.chatButtonSub}>{pack.tracks.konusma.subtitle}</Text>
            </View>
            <Text style={styles.chatButtonArrow}>›</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quizCard} onPress={startQuiz} activeOpacity={0.85}>
          <View style={[styles.iconSquare, { backgroundColor: colors.goldSoft }]}>
            <Text style={styles.iconSquareText}>🧠</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{pack.teacherName} ile Tekrar</Text>
            <Text style={styles.cardMeta}>Sözlü sınav — hocan sorar, puanlar, takvimini kurar</Text>
          </View>
          {vocabDue > 0 ? (
            <View style={styles.readyPill}>
              <Text style={styles.readyPillText}>{vocabDue} hazır</Text>
            </View>
          ) : (
            <Text style={styles.cardArrow}>›</Text>
          )}
        </TouchableOpacity>

        <View style={styles.toolsRow}>
          <TouchableOpacity style={styles.toolCard} onPress={onOpenReview} activeOpacity={0.85}>
            <View style={[styles.iconSquare, { backgroundColor: colors.accentSoft }]}>
              <Text style={styles.iconSquareText}>📇</Text>
            </View>
            <Text style={styles.cardTitle}>Kelime Defteri</Text>
            <Text style={styles.cardMeta}>{vocabTotal} kelime</Text>
            {vocabDue > 0 && (
              <View style={styles.dueBadge}>
                <Text style={styles.dueBadgeText}>{vocabDue}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolCard} onPress={onOpenMistakes} activeOpacity={0.85}>
            <View style={[styles.iconSquare, { backgroundColor: colors.dangerSoft }]}>
              <Text style={styles.iconSquareText}>📒</Text>
            </View>
            <Text style={styles.cardTitle}>Hata Defteri</Text>
            <Text style={styles.cardMeta}>{mistakeCount} açık kayıt</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.readingCard}
          onPress={onOpenReading}
          activeOpacity={0.85}
        >
          <View style={[styles.iconSquare, { backgroundColor: colors.goldSoft }]}>
            <Text style={styles.iconSquareText}>📖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Okuma Salonu</Text>
            <Text style={styles.cardMeta}>
              Kelime defterinden örülmüş, sana özel okuma metinleri
            </Text>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </TouchableOpacity>

        <View style={[styles.toolsRow, { marginBottom: 26 }]}>
          <TouchableOpacity
            style={styles.toolCard}
            onPress={onOpenPronunciation}
            activeOpacity={0.85}
          >
            <View style={[styles.iconSquare, { backgroundColor: colors.accentSoft }]}>
              <Text style={styles.iconSquareText}>🎙️</Text>
            </View>
            <Text style={styles.cardTitle}>Telaffuz Stüdyosu</Text>
            <Text style={styles.cardMeta}>Kulak turu + dinle-kaydet-karşılaştır</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolCard}
            onPress={onOpenShadowing}
            activeOpacity={0.85}
          >
            <View style={[styles.iconSquare, { backgroundColor: colors.goldSoft }]}>
              <Text style={styles.iconSquareText}>🗣️</Text>
            </View>
            <Text style={styles.cardTitle}>Gölgeleme</Text>
            <Text style={styles.cardMeta}>Dinle, üstüne konuş — akıcılık antrenmanı</Text>
          </TouchableOpacity>
        </View>

        {totalModules === 0 && (
          <View style={styles.noCurriculumCard}>
            <Text style={styles.noCurriculumTitle}>📚 Müfredatını kur</Text>
            <Text style={styles.noCurriculumText}>
              Sıfırdan başlıyorsun — {pack.teacherName} iki parkur için 12-16 derslik bir
              başlangıç müfredatı tasarlasın. Bir API isteği harcar; sonrası panelde hazır.
            </Text>
            {buildError && (
              <Text style={styles.noCurriculumError} selectable>
                {buildError}
              </Text>
            )}
            <TouchableOpacity
              style={styles.noCurriculumButton}
              onPress={startCurriculumBuild}
              disabled={buildingCurriculum}
            >
              <Text style={styles.noCurriculumButtonText}>
                {buildingCurriculum
                  ? `Hazırlanıyor… ${buildElapsed}s`
                  : buildError
                    ? "Tekrar dene ›"
                    : "Müfredatı kur ›"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {tracks.map((track) => {
          const modules = curriculum?.modules.filter((m) => m.track === track) ?? [];
          if (modules.length === 0) return null; // müfredat yokken boş başlık gösterme
          const trackDone = modules.filter((m) => completedModuleIds.includes(m.id)).length;
          return (
            <View key={track} style={styles.trackSection}>
              <View style={styles.trackHeader}>
                <Text style={styles.trackIcon}>{pack.tracks[track].icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackTitle}>{pack.tracks[track].title}</Text>
                  <Text style={styles.trackSubtitle}>{pack.tracks[track].subtitle}</Text>
                </View>
                <View style={styles.trackCount}>
                  <Text style={styles.trackCountText}>
                    {trackDone}/{modules.length}
                  </Text>
                </View>
              </View>
              {modules.map((module, index) => {
                const done = completedModuleIds.includes(module.id);
                return (
                  <TouchableOpacity
                    key={module.id}
                    style={[styles.moduleCard, done && styles.moduleDone]}
                    onPress={() => onOpenModule(module)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.moduleBadge, done && styles.moduleBadgeDone]}>
                      <Text style={[styles.moduleBadgeText, done && styles.moduleBadgeTextDone]}>
                        {done ? "✓" : index + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.moduleTitle}>{module.title}</Text>
                      <Text style={styles.moduleDesc} numberOfLines={2}>
                        {module.description}
                      </Text>
                    </View>
                    <View style={styles.levelPill}>
                      <Text style={styles.levelPillText}>{module.level}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 44 },
  hero: {
    paddingTop: 66,
    paddingHorizontal: 22,
    paddingBottom: 46,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  langButton: {
    backgroundColor: "rgba(243,239,228,0.12)",
    borderWidth: 1,
    borderColor: "rgba(243,239,228,0.22)",
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 34,
    justifyContent: "center",
  },
  langButtonText: { color: colors.onDeep, fontSize: 12.5, fontWeight: "800" },
  heroSalam: { fontSize: 15, color: colors.goldDeep, fontWeight: "700", marginBottom: 2 },
  heroName: { fontSize: 30, fontWeight: "800", color: colors.onDeep, letterSpacing: -0.5 },
  resetButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(243,239,228,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  resetText: { color: colors.onDeep, fontSize: 18, fontWeight: "800", marginTop: -6 },
  levelRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  levelChip: {
    flex: 1,
    backgroundColor: "rgba(243,239,228,0.10)",
    borderWidth: 1,
    borderColor: "rgba(243,239,228,0.18)",
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  levelChipLabel: { color: colors.onDeepSoft, fontSize: 12.5, fontWeight: "700" },
  levelChipValue: { color: colors.goldDeep, fontSize: 18, fontWeight: "800" },
  levelHint: {
    color: colors.onDeepSoft,
    fontSize: 11,
    marginTop: 6,
    textAlign: "right",
  },
  progressBlock: { marginTop: 18 },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  progressLabel: { color: colors.onDeepSoft, fontSize: 12 },
  progressValue: { color: colors.onDeep, fontSize: 12, fontWeight: "800" },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(243,239,228,0.15)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.goldDeep },
  body: { paddingHorizontal: 18, marginTop: -24 },
  levelUpCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.deep,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 14,
    ...shadowLift,
  },
  levelUpEmoji: { fontSize: 26 },
  levelUpTitle: { fontSize: 16, fontWeight: "800", color: colors.goldDeep },
  levelUpText: { fontSize: 12.5, color: colors.onDeepSoft, lineHeight: 18, marginTop: 2 },
  levelUpArrow: { fontSize: 24, color: colors.goldDeep, fontWeight: "800" },
  teacherNoteCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.goldDeep,
    padding: 16,
    marginBottom: 14,
    ...shadowLift,
  },
  teacherNoteHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  teacherAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.deep,
    alignItems: "center",
    justifyContent: "center",
  },
  teacherAvatarText: { color: colors.goldDeep, fontSize: 13, fontWeight: "700" },
  teacherNoteTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  teacherNoteText: { fontSize: 14.5, color: colors.ink, lineHeight: 22 },
  teacherNoteButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  teacherNoteButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  noCurriculumCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 24,
    ...shadow,
  },
  noCurriculumTitle: { fontSize: 15, fontWeight: "800", color: colors.ink, marginBottom: 6 },
  noCurriculumText: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 },
  noCurriculumButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: colors.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  noCurriculumButtonText: { color: colors.gold, fontSize: 12.5, fontWeight: "800" },
  noCurriculumError: { fontSize: 12, color: colors.danger, marginTop: 8, lineHeight: 17 },
  weekCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 10,
    ...shadow,
  },
  weekText: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statTile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: "center",
    ...shadow,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.ink },
  statLabel: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 12,
    marginBottom: 12,
    ...shadowLift,
  },
  chatButtonEmoji: { fontSize: 24 },
  chatButtonTitle: { color: "#FFFFFF", fontSize: 16.5, fontWeight: "800" },
  chatButtonSub: { color: "rgba(255,255,255,0.75)", fontSize: 12.5, marginTop: 1 },
  chatButtonArrow: { color: "rgba(255,255,255,0.8)", fontSize: 24, fontWeight: "700" },
  quizCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
    marginBottom: 12,
    ...shadow,
  },
  iconSquare: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  iconSquareText: { fontSize: 20 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.inkSoft, marginTop: 2, lineHeight: 17 },
  cardArrow: { fontSize: 22, color: colors.inkFaint, fontWeight: "700" },
  readyPill: {
    backgroundColor: colors.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  readyPillText: { color: colors.gold, fontSize: 12, fontWeight: "800" },
  toolsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  toolCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadow,
  },
  dueBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: colors.danger,
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  dueBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  readingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
    marginBottom: 12,
    ...shadow,
  },
  trackSection: { marginBottom: 24 },
  trackHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  trackIcon: { fontSize: 22 },
  trackTitle: { fontSize: 16.5, fontWeight: "800", color: colors.ink, letterSpacing: -0.2 },
  trackSubtitle: { fontSize: 12, color: colors.inkSoft, marginTop: 1 },
  trackCount: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  trackCountText: { color: colors.accentDark, fontSize: 12, fontWeight: "800" },
  moduleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    marginBottom: 9,
    gap: 12,
    ...shadow,
  },
  moduleDone: { backgroundColor: "#F0F7F4", borderColor: "#CBE3DB" },
  moduleBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleBadgeDone: { backgroundColor: colors.accent },
  moduleBadgeText: { color: colors.gold, fontWeight: "800", fontSize: 14 },
  moduleBadgeTextDone: { color: "#FFFFFF" },
  moduleTitle: { fontSize: 14.5, fontWeight: "800", color: colors.ink },
  moduleDesc: { fontSize: 12, color: colors.inkSoft, marginTop: 2, lineHeight: 17 },
  levelPill: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  levelPillText: { fontSize: 11, fontWeight: "800", color: colors.accentDark },
});
