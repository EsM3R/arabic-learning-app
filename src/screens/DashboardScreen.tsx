import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useState } from "react";
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
import { Card, Pill, ProgressRing, SectionHeader, Skeleton } from "../components/ui";
import { exportReminder } from "../backup";
import type { ExportReminder } from "../backup";
import { migrationScope, migrationSummary, MigrationScope, withoutColloquial } from "../fusha";
import { getActiveLanguageId, getActivePack, LANGUAGE_LIST, LanguageId } from "../languages";
import { nextAction, NextAction } from "../nextaction";
import { pendingReminders } from "../notifications";
import { fluencyTrend } from "../fluency";
import { progressDigest, readingPerformance, speakingBalance } from "../progress";
import { memoryContext, retentionDigest, wakeCheckEvent, wakeCheckSystem } from "../prompts";
import { dueCards } from "../srs";
import { COMPLIANCE_WARN } from "../reading";
import { loadStatsSummary } from "../statsStore";
import {
  clearModuleChats,
  loadFluency,
  loadFushaMigrated,
  loadLastActivity,
  loadLastExportAt,
  loadMistakes,
  loadNotes,
  loadReadings,
  loadVocab,
  loadWakeCheck,
  saveFushaMigrated,
  saveVocab,
  saveWakeCheck,
} from "../storage";
import { colors, radius, shadow, shadowLift, spacing } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
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
  onOpenFluency: () => void;
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
  onOpenFluency,
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
  /** Veriler yüklenene kadar sıfır gösterme — iskelet çiz. */
  const [loaded, setLoaded] = useState(false);
  /** "Şimdi ne yapmalıyım" kartının içeriği. */
  const [today, setToday] = useState<NextAction | null>(null);
  /** Ammice → fusha geçişi (tek seferlik); null = gerekmiyor. */
  const [fusha, setFusha] = useState<MigrationScope | null>(null);
  /** Yedek hatırlatması — veri yalnız bu telefonda duruyor. */
  const [backupWarn, setBackupWarn] = useState<ExportReminder | null>(null);
  const wakeStarted = React.useRef(false);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const totalModules = curriculum?.modules.length ?? 0;
  const doneModules =
    curriculum?.modules.filter((m) => completedModuleIds.includes(m.id)).length ?? 0;
  const progress = totalModules > 0 ? doneModules / totalModules : 0;

  useEffect(() => {
    void (async () => {
      const [cards, mistakes, stats, readings, lastActivity] = await Promise.all([
        loadVocab(),
        loadMistakes(),
        loadStatsSummary(),
        loadReadings(),
        loadLastActivity(),
      ]);
      const due = dueCards(cards).length;
      const open = mistakes.filter((m) => !m.resolved).length;
      setVocabTotal(cards.length);
      setVocabDue(due);
      setMistakeCount(open);

      // "Bugün" kartı: uygulamanın tuttuğu veriden tek bir öneri (src/nextaction.ts).
      const modules = curriculum?.modules ?? [];
      const balance = speakingBalance(stats);
      const reminder = exportReminder(await loadLastExportAt(), cards.length);
      setBackupWarn(reminder.needed ? reminder : null);
      const nextMod = modules.find((m) => !completedModuleIds.includes(m.id));
      setToday(
        nextAction({
          vocabTotal: cards.length,
          dueCount: due,
          openMistakes: open,
          hasCurriculum: modules.length > 0,
          nextModule: nextMod
            ? { id: nextMod.id, title: nextMod.title, track: nextMod.track }
            : undefined,
          curriculumDone: modules.length > 0 && !nextMod,
          spokenTotal: stats.total.spoken ?? 0,
          shadowedTotal: stats.total.shadowed ?? 0,
          fluencyTotal: stats.total.fluencyRound ?? 0,
          readingsFinished: readings.filter((r) => r.finishedAt).length,
          // Konuşma dengesi: sesli iş (mikrofon + gölgeleme) sessiz işe
          // (tekrar + okuma) karşı. progress.ts ile AYNI tanım.
          voiceWorkWeek: balance.voiceWork,
          silentWorkWeek: balance.silentWork,
          activeDays7: stats.activeDays7,
          daysSinceActivity: lastActivity
            ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
            : 0,
        })
      );
      setLoaded(true);

      // Ammice → fusha geçişi: tek seferlik, bayrakla kilitli (bkz. src/fusha.ts).
      const lang = getActiveLanguageId();
      const migrated = await loadFushaMigrated();
      const scope = migrationScope(cards, curriculum, migrated, lang);
      if (scope.needed) setFusha(scope);
      // Bayrağı yalnız Arapça panelindeyken koy: başka bir dilde "temizlenecek
      // bir şey yok" diye bayrak konsaydı Arapça geçişi hiç sorulmazdı.
      else if (!migrated && lang === "ar") await saveFushaMigrated();

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
        const [
          cards,
          mistakes,
          notes,
          lastActivity,
          reminders,
          wakeStats,
          wakeReadings,
          wakeFluency,
        ] =
          await Promise.all([
            loadVocab(),
            loadMistakes(),
            loadNotes(),
            loadLastActivity(),
            pendingReminders(),
            loadStatsSummary(),
            loadReadings(),
            loadFluency(),
          ]);
        const due = dueCards(cards).length;
        const daysSince = lastActivity
          ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
          : 0;
        const balance = speakingBalance(wakeStats);
        // Sessiz kalma eşiğine KONUŞMA DENGESİ de eklendi: çalışkan ama hiç
        // konuşmayan öğrenci eskiden hiç dürtülmüyordu — tekrarını aksatmadığı
        // için "dürtecek bir şey yok" sayılıyordu. Asıl dürtülmesi gereken o.
        const voiceProblem = balance.imbalanced || (balance.neverSpoken && cards.length >= 20);
        if (due < 5 && daysSince < 2 && !voiceProblem) return;

        // Konuşma durumu özete GİRMELİ: bu mesaj hocanın kendiliğinden
        // konuştuğu tek yer ve eskiden burada sesli çalışmadan hiç söz
        // edilmiyordu — öğrenci aylarca yazsa hoca fark etmezdi.
        const voiceNote = balance.neverSpoken
          ? "mikrofonla HİÇ konuşmamış"
          : balance.imbalanced
            ? `bu hafta ${balance.silentWork} sessiz işe karşılık yalnız ${balance.voiceWork} sesli iş yapmış`
            : balance.voiceWork === 0
              ? "bu hafta hiç sesli çalışmamış"
              : `bu hafta ${balance.voiceWork} sesli iş yapmış`;
        const digest = `${due} kelimenin tekrarı gelmiş; öğrenci ${
          daysSince === 0 ? "bugün de çalışmış" : `${daysSince} gündür çalışmamış`
        }; ${voiceNote}; açık hata sayısı ${mistakes.filter((m) => !m.resolved).length}; kurulu hatırlatıcı ${reminders.length} adet.`;

        const ctx: AgentContext = { profile, profileChanged: false };
        const reply = await agenticChat(
          {
            stable: wakeCheckSystem(profile),
            dynamic:
              memoryContext(mistakes, notes) +
              retentionDigest(cards) +
              progressDigest(
                wakeStats,
                readingPerformance(wakeReadings, COMPLIANCE_WARN),
                fluencyTrend(wakeFluency)
              ),
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

  /** "Bugün" kartındaki öneriyi ilgili ekrana bağlar. */
  const openToday = () => {
    if (!today) return;
    switch (today.screen) {
      case "review":
        return onOpenReview();
      case "reading":
        return onOpenReading();
      case "pronunciation":
        return onOpenPronunciation();
      case "shadowing":
        return onOpenShadowing();
      case "fluency":
        return onOpenFluency();
      case "mistakes":
        return onOpenMistakes();
      case "lesson":
        return onFreeChat();
      case "curriculum":
        return totalModules === 0 ? startCurriculumBuild() : onLevelUp();
      case "module": {
        const m = curriculum?.modules.find((x) => x.id === today.moduleId);
        if (m) onOpenModule(m);
        return;
      }
    }
  };

  const onSuggestionPress = () => {
    const s = teacherSuggestion;
    if (!s) return;
    if (s.screen === "review") onOpenReview();
    else if (s.screen === "quiz") onQuiz();
    else if (s.screen === "pronunciation") onOpenPronunciation();
    else if (s.screen === "reading") onOpenReading();
    else if (s.screen === "shadowing") onOpenShadowing();
    else if (s.screen === "fluency") onOpenFluency();
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

  /**
   * Ammice → fusha geçişi. Sessiz göç YAPILMAZ: kaç kartın gideceği
   * söylenir, onay alınır, sonra defter temizlenir ve müfredat sıfırlanır.
   * Bayrak konur — bir daha asla kart silinmez (bkz. src/fusha.ts).
   */
  const runFushaMigration = async () => {
    const cards = await loadVocab();
    await saveVocab(withoutColloquial(cards));
    await saveFushaMigrated();
    await clearModuleChats();
    setFusha(null);
    // Müfredatı sıfırla: ammiceye göre kurulmuştu, artık geçersiz.
    onCurriculumBuilt({ modules: [], generatedAt: new Date().toISOString() });
  };

  const confirmFushaMigration = () => {
    if (!fusha) return;
    Alert.alert("Fushaya geç", migrationSummary(fusha), [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Evet, temizle",
        style: "destructive",
        onPress: () => void runFushaMigration(),
      },
    ]);
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
      { text: "Ayarlar · model, anahtar, yedek", onPress: onOpenSettings },
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

      </LinearGradient>

      <View style={styles.body}>
        {backupWarn && (
          <TouchableOpacity
            style={styles.backupCard}
            onPress={onOpenSettings}
            activeOpacity={0.85}
          >
            <Text style={styles.backupTitle}>💾 Yedek al</Text>
            <Text style={styles.backupText}>{backupWarn.message}</Text>
            <Text style={styles.backupCta}>Ayarlar → Yedek al ›</Text>
          </TouchableOpacity>
        )}

        {fusha && (
          <View style={styles.fushaCard}>
            <Text style={styles.fushaTitle}>🕌 Fushaya geçiş</Text>
            <Text style={styles.fushaText}>
              Artık yalnız fusha öğreniyorsun; ammice dersleri kaldırıldı. Defterindeki
              eski ammice kartların ve ammiceye göre kurulmuş müfredatın temizlenmesi
              gerekiyor — sonrasında hocan sıfırdan fusha müfredatı kuracak.
            </Text>
            <Text style={styles.fushaCount}>
              {fusha.cardsToRemove > 0
                ? `${fusha.cardsToRemove} ammice kart · ${fusha.modulesToClear} modül`
                : `${fusha.modulesToClear} modül`}
            </Text>
            <TouchableOpacity style={styles.fushaButton} onPress={confirmFushaMigration}>
              <Text style={styles.fushaButtonText}>Temizle ve fushaya geç ›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ---------------- BUGÜN: "şimdi ne yapmalıyım" sorusunun tek cevabı.
            Panelin geri kalanından belirgin biçimde ağır olmalı; denetimde
            14 bloğun aynı görsel ağırlıkta olması en büyük kusurdu. */}
        {!loaded ? (
          <View style={styles.todayCard}>
            <Skeleton width="40%" height={11} />
            <Skeleton width="85%" height={20} style={{ marginTop: 12 }} />
            <Skeleton width="65%" height={13} style={{ marginTop: 10 }} />
          </View>
        ) : today ? (
          <TouchableOpacity onPress={openToday} activeOpacity={0.86}>
            <LinearGradient
              colors={[colors.accent, colors.accentDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.todayCard}
            >
              <View style={styles.todayTopRow}>
                <Text style={styles.todayKicker}>BUGÜN</Text>
                {today.badge ? (
                  <View style={styles.todayBadge}>
                    <Text style={styles.todayBadgeText}>{today.badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.todayTitle}>{today.label}</Text>
              <Text style={styles.todayReason}>{today.reason}</Text>
              <View style={styles.todayGo}>
                <Text style={styles.todayGoText}>Başla ›</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        {/* Müfredat ilerlemesi artık halka olarak — tek bakışta okunur. */}
        {totalModules > 0 && (
          <Card style={styles.curriculumRow}>
            <ProgressRing
              progress={progress}
              label={`${Math.round(progress * 100)}%`}
              sublabel="MÜFREDAT"
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.curriculumTitle, { color: colors.ink }]}>
                {doneModules}/{totalModules} modül tamam
              </Text>
              <Text style={[styles.curriculumSub, { color: colors.inkSoft }]}>
                {assessment?.speakingLevel ?? "A0"} konuşma · {assessment?.readingLevel ?? "A0"} okuma
              </Text>
            </View>
            <TouchableOpacity onPress={onOpenLevel} hitSlop={10}>
              <Pill text="Rapor ›" tone="accent" />
            </TouchableOpacity>
          </Card>
        )}
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

        {/* Açılışta "0 / 0 / 0" yanıp sönüyordu — yüklenene kadar iskelet. */}
        <View style={styles.statsRow}>
          {[
            { v: vocabTotal, l: "kelime", danger: false },
            { v: vocabDue, l: "tekrar bekliyor", danger: vocabDue > 0 },
            { v: mistakeCount, l: "açık hata", danger: false },
          ].map((s) => (
            <View key={s.l} style={styles.statTile}>
              {loaded ? (
                <Text style={[styles.statValue, s.danger && { color: colors.danger }]}>{s.v}</Text>
              ) : (
                <Skeleton width={28} height={20} />
              )}
              <Text style={styles.statLabel}>{s.l}</Text>
            </View>
          ))}
        </View>

        <SectionHeader title="Çalış" hint="Hocanla konuş, oku, telaffuz et" />

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
            <Text style={styles.cardMeta}>Dinle, üstüne konuş — taklitle prosodi</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.readingCard, { marginBottom: 26 }]}
          onPress={onOpenFluency}
          activeOpacity={0.85}
        >
          <View style={[styles.iconSquare, { backgroundColor: colors.goldSoft }]}>
            <Text style={styles.iconSquareText}>⏱️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Akıcılık Odası · 4·3·2</Text>
            <Text style={styles.cardMeta}>
              Aynı şeyi azalan sürede üç kez anlat — hızlanman ölçülür
            </Text>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </TouchableOpacity>

        <SectionHeader title="Defterlerin" hint="Kelimeler ve hatalar burada birikiyor" />

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

/**
 * Stiller paletin FONKSİYONU. Panel useTheme'i çağırıyordu ama stil bloğu
 * modül düzeyinde donmuştu: karanlık modda yalnız iki satır renk
 * değişiyor, panelin geri kalanı açık palete çakılı kalıyordu.
 */
function makeStyles(colors: Palette) {
  return StyleSheet.create({
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
  body: { paddingHorizontal: 18, marginTop: -24 },
  backupCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.goldDeep,
  },
  backupTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  backupText: { fontSize: 13, lineHeight: 19, color: colors.inkSoft, marginTop: 6 },
  backupCta: { fontSize: 13, fontWeight: "800", color: colors.goldDeep, marginTop: 8 },
  fushaCard: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.goldDeep,
    padding: 16,
    marginBottom: 14,
    ...shadow,
  },
  fushaTitle: { fontSize: 16, fontWeight: "800", color: colors.gold, marginBottom: 6 },
  fushaText: { fontSize: 13, color: colors.ink, lineHeight: 19 },
  fushaCount: { fontSize: 12.5, fontWeight: "800", color: colors.gold, marginTop: 10 },
  fushaButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: colors.gold,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  fushaButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  // "Bugün" kartı: panelin en ağır öğesi olmalı — tek cevap burada.
  todayCard: {
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 14,
    minHeight: 132,
    ...shadowLift,
  },
  todayTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  todayKicker: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  todayBadge: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    minWidth: 26,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignItems: "center",
  },
  todayBadgeText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
  todayTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginTop: 10,
    lineHeight: 29,
  },
  todayReason: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 6,
  },
  todayGo: {
    alignSelf: "flex-start",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  todayGoText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "800" },
  curriculumRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginBottom: 14,
  },
  curriculumTitle: { fontSize: 15.5, fontWeight: "800" },
  curriculumSub: { fontSize: 12.5, marginTop: 2 },
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
}
