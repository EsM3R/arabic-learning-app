import React, { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { AgentContext, TEACHER_TOOLS } from "../agent";
import { agenticChat, generateCurriculum } from "../claude";
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
import { weekDays } from "../stats";
import type { WeekDay } from "../stats";
import { loadStats, loadStatsSummary } from "../statsStore";
import {
  clearModuleChats,
  loadFluency,
  loadFushaMigrated,
  loadLastActivity,
  loadLastExportAt,
  loadMistakes,
  loadNotes,
  loadReadings,
  loadRepairSeen,
  loadVocab,
  loadWakeCheck,
  saveFushaMigrated,
  saveVocab,
  saveWakeCheck,
} from "../storage";
import { useTheme } from "../useTheme";
import {
  Curriculum,
  CurriculumModule,
  defaultAssessment,
  MistakeEntry,
  NavigationSuggestion,
  Profile,
  VocabCard,
} from "../types";
import type { HomeModel } from "./home/model";
import NotebookTab from "./home/NotebookTab";
import PracticeTab from "./home/PracticeTab";
import ProfileTab from "./home/ProfileTab";
import TabBar from "./home/TabBar";
import type { TabKey } from "./home/TabBar";
import TodayTab from "./home/TodayTab";

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
  onOpenConversation: () => void;
  onOpenSentences: () => void;
  onSwitchLanguage: (id: LanguageId) => void;
  onOpenLevel: () => void;
  /** Panelden kurulan müfredatı profile yazar. */
  onCurriculumBuilt: (curriculum: Curriculum) => void;
  onLevelUp: () => void;
  onOpenSettings: () => void;
  onReset: () => void;
}

/**
 * Bir alt ekrana gidip dönünce panel yeniden kurulur; öğrenci hangi
 * sekmedeyse oraya dönsün (Pratik'ten Okuma'ya girip çıkan Bugün'e
 * fırlatılmasın).
 */
let lastTab: TabKey = "today";

/** Testler ve sıfırlama için: bir sonraki açılış Bugün'den başlasın. */
export function resetHomeTab(): void {
  lastTab = "today";
}

/**
 * ANA EKRAN — dört sekmeli kabuk.
 *
 * Eski panel tek bir uzun kaydırmaydı: 14 blok aynı görsel ağırlıkta,
 * "şimdi ne yapayım" sorusunun cevabı kalabalıkta kayboluyordu. Şimdi:
 * Bugün (tek bir sıradaki adım), Pratik (bütün çalışma odaları),
 * Defter (kelime + hata), Profil (seviye, müfredat, dil, ayarlar).
 * Veri ve eylemler burada; sekmeler yalnız çizer (bkz. home/model.ts).
 */
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
  onOpenConversation,
  onOpenSentences,
  onSwitchLanguage,
  onOpenLevel,
  onCurriculumBuilt,
  onLevelUp,
  onOpenSettings,
  onReset,
}: Props) {
  const c = useTheme();
  const [tab, setTab] = useState<TabKey>(lastTab);
  const goTab = (t: TabKey) => {
    lastTab = t;
    setTab(t);
  };
  const pack = getActivePack();
  const { assessment, curriculum, completedModuleIds } = profile;
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
  const [week, setWeek] = useState<WeekDay[]>([]);
  const [recentWords, setRecentWords] = useState<VocabCard[]>([]);
  const [recentMistakes, setRecentMistakes] = useState<MistakeEntry[]>([]);
  const wakeStarted = React.useRef(false);

  const totalModules = curriculum?.modules.length ?? 0;
  const doneModules =
    curriculum?.modules.filter((m) => completedModuleIds.includes(m.id)).length ?? 0;
  const progress = totalModules > 0 ? doneModules / totalModules : 0;

  useEffect(() => {
    void (async () => {
      const [cards, mistakes, stats, readings, lastActivity, statsMap] = await Promise.all([
        loadVocab(),
        loadMistakes(),
        loadStatsSummary(),
        loadReadings(),
        loadLastActivity(),
        loadStats(),
      ]);
      setWeek(weekDays(statsMap, new Date()));
      setRecentWords([...cards].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 5));
      setRecentMistakes(
        mistakes
          .filter((x) => !x.resolved)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 3)
      );
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
          repairMoves: (await loadRepairSeen()).length,
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
          wakeRepair,
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
            loadRepairSeen(),
          ]);
        const due = dueCards(cards).length;
        const daysSince = lastActivity
          ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
          : 0;
        const balance = speakingBalance(wakeStats);
        // Sessiz kalma eşiğine KONUŞMA DENGESİ de eklendi: çalışkan ama hiç
        // konuşmayan öğrenci eskiden hiç dürtülmüyordu — tekrarını aksatmadığı
        // için "dürtecek bir şey yok" sayılıyordu. Asıl dürtülmesi gereken o.
        const voiceProblem =
          balance.imbalanced ||
          (balance.neverSpoken && cards.length >= 20) ||
          (wakeRepair.length === 0 && cards.length >= 30);
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
        // Onarım refleksi de özete girer: hoca panelde kendiliğinden
        // konuşurken öğrencinin hiç "anlamadım" dememiş olduğunu bilmeliydi,
        // bilmiyordu — derste görüyordu, panelde görmüyordu.
        const repairNote =
          wakeRepair.length === 0
            ? "bir kez bile onarım hamlesi (anlamadım/tekrar eder misin) yapmamış"
            : `${wakeRepair.length} çeşit onarım hamlesi kullanmış`;
        const digest = `${due} kelimenin tekrarı gelmiş; öğrenci ${
          daysSince === 0 ? "bugün de çalışmış" : `${daysSince} gündür çalışmamış`
        }; ${voiceNote}; ${repairNote}; açık hata sayısı ${mistakes.filter((m) => !m.resolved).length}; kurulu hatırlatıcı ${reminders.length} adet.`;

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
    else if (s.screen === "conversation") onOpenConversation();
    else if (s.screen === "sentences") onOpenSentences();
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
          text: `${l.label} (${l.teacherName})`,
          onPress: () => onSwitchLanguage(l.id),
        })),
        { text: "Vazgeç", style: "cancel" as const },
      ]
    );
  };

  const model: HomeModel = {
    profile,
    pack,
    loaded,
    vocabTotal,
    vocabDue,
    mistakeCount,
    weekLine,
    recentWords,
    recentMistakes,
    week,
    today,
    teacherNote,
    teacherSuggestion,
    fusha,
    backupWarn,
    building: buildingCurriculum,
    buildElapsed,
    buildError,
    totalModules,
    doneModules,
    progress,
    openToday,
    onSuggestionPress,
    startCurriculumBuild,
    confirmFushaMigration,
    startQuiz,
    pickLanguage,
    confirmReset,
    onOpenModule,
    onFreeChat,
    onOpenReview,
    onOpenMistakes,
    onOpenPronunciation,
    onOpenReading,
    onOpenShadowing,
    onOpenFluency,
    onOpenConversation,
    onOpenSentences,
    onOpenLevel,
    onLevelUp,
    onOpenSettings,
    goTab,
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1 }}>
        {tab === "today" && <TodayTab m={model} />}
        {tab === "practice" && <PracticeTab m={model} />}
        {tab === "notebook" && <NotebookTab m={model} />}
        {tab === "profile" && <ProfileTab m={model} />}
      </View>
      <TabBar active={tab} onChange={goTab} onSpeak={onOpenConversation} />
    </View>
  );
}
