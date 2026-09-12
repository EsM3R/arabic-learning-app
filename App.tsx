import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { installGlobalErrorHandler, reportError } from "./src/errorLog";
import DashboardScreen from "./src/screens/DashboardScreen";
import FluencyScreen from "./src/screens/FluencyScreen";
import LessonScreen from "./src/screens/LessonScreen";
import LevelScreen from "./src/screens/LevelScreen";
import LevelUpScreen from "./src/screens/LevelUpScreen";
import MistakesScreen from "./src/screens/MistakesScreen";
import PronunciationScreen from "./src/screens/PronunciationScreen";
import ReadingScreen from "./src/screens/ReadingScreen";
import ReviewScreen from "./src/screens/ReviewScreen";
import ShadowingScreen from "./src/screens/ShadowingScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import SetupScreen from "./src/screens/SetupScreen";
import { getActiveLanguageId, LanguageId, setActiveLanguage } from "./src/languages";
import { snapshotDue } from "./src/autobackup";
import { FUTURE_SCHEMA_WARNING } from "./src/schema";
import { writeSnapshot } from "./src/snapshots";
import {
  clearModuleChats,
  ensureSchema,
  loadLastSnapshotAt,
  loadProfile,
  loadVocab,
  saveLastSnapshotAt,
  resetAll,
  saveProfile,
  switchLanguageProgress,
} from "./src/storage";
import { useTheme } from "./src/useTheme";
import {
  Assessment,
  Curriculum,
  CurriculumModule,
  defaultAssessment,
  NavigationSuggestion,
  Profile,
} from "./src/types";

type Screen =
  | { name: "loading" }
  | { name: "setup" }
  | { name: "dashboard" }
  | { name: "lesson"; module: CurriculumModule | null; quiz?: boolean }
  | { name: "review" }
  | { name: "mistakes" }
  | { name: "pronunciation" }
  | { name: "reading" }
  | { name: "shadowing" }
  | { name: "fluency" }
  | { name: "settings" }
  | { name: "level" }
  | { name: "levelup" };

/**
 * İki taraf da profili değiştirebilir: öğrenci (düğmeler) ve Üstaz (araçlar).
 * Bir tur uçarken öğrenci modül tamamlarsa, turun sonundaki yazma onu ezmesin
 * diye tamamlanan modülleri birleştiriyoruz.
 */
function mergeProfile(prev: Profile, next: Profile): Profile {
  return {
    ...next,
    completedModuleIds: Array.from(
      new Set([...prev.completedModuleIds, ...next.completedModuleIds])
    ),
  };
}

export default function App() {
  const colors = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  /** Aktif dil — ekran anahtarı olarak da kullanılır ki dil değişince ekranlar tazelensin. */
  const [lang, setLang] = useState<LanguageId>("ar");
  /** En güncel profil — asenkron turların eski anlık görüntüyle yazmasını engeller. */
  const profileRef = useRef<Profile | null>(null);
  /** Her depodan yüklemede artar; ekran anahtarına girer ki yedekten dönüşte paneller tazelensin. */
  const [bootId, setBootId] = useState(0);

  /** Depodan profili yükleyip panele geç — açılışta ve yedekten dönüşte. */
  const bootFromStorage = async () => {
    try {
      // Şema kontrolü HER ŞEYDEN ÖNCE: veri bu derlemeden yeniyse hiçbir
      // şeye dokunmadan uyarırız, yoksa eski kod yeni biçimin üstüne yazar.
      const schema = await ensureSchema();
      if (schema.status === "gelecekten") {
        Alert.alert("Uygulamayı güncelle", FUTURE_SCHEMA_WARNING);
      }
      const saved = await loadProfile();
      if (!saved) {
        profileRef.current = null;
        setProfile(null);
        setScreen({ name: "setup" });
        return;
      }
      setActiveLanguage(saved.activeLanguage);
      setLang(getActiveLanguageId());
      // Seviye tespiti diye bir şey yok: herkes A0'dan başlar, seviyeyi
      // zamanla hoca yükseltir. Eski kayıtta assessment yoksa sıfırla doldur.
      const patched = saved.assessment
        ? saved
        : { ...saved, assessment: defaultAssessment() };
      if (patched !== saved) await saveProfile(patched);
      profileRef.current = patched;
      setProfile(patched);
      void takeSnapshotIfDue();
      setBootId((n) => n + 1);
      setScreen({ name: "dashboard" });
    } catch (e) {
      // Kayıtlı profil okunamazsa açılış ekranında sonsuza kadar beklemek
      // yerine kurulum ekranına düş; hata da görünür olsun.
      reportError(e, "profil yüklenirken", false);
      setScreen({ name: "setup" });
    }
  };

  /**
   * Otomatik anlık görüntü — açılışta ve arka planda. Hata YUTULUR ve
   * kullanıcıya gösterilmez: yedek alamamak dersi engellememeli, ama
   * sessizce başarısız olduğunu Ayarlar'daki durum satırı ele verir.
   */
  const takeSnapshotIfDue = async () => {
    try {
      const [lastAt, vocab] = await Promise.all([loadLastSnapshotAt(), loadVocab()]);
      if (!snapshotDue(lastAt, vocab.length).due) return;
      const res = await writeSnapshot();
      if (res.ok) await saveLastSnapshotAt(new Date().toISOString());
    } catch {
      // sessiz: bir sonraki açılışta yeniden denenir
    }
  };

  useEffect(() => {
    installGlobalErrorHandler();
    void bootFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Yedekten dönüldü: depo baştan yazıldı, her şey depodan yeniden yüklenir. */
  const onRestored = () => {
    setScreen({ name: "loading" });
    void bootFromStorage();
  };

  const persist = async (next: Profile) => {
    const merged = profileRef.current ? mergeProfile(profileRef.current, next) : next;
    profileRef.current = merged;
    setProfile(merged);
    await saveProfile(merged);
  };

  const onSetupDone = async (
    name: string,
    apiKey: string,
    languageId: LanguageId,
    providerId: string
  ) => {
    setActiveLanguage(languageId);
    setLang(getActiveLanguageId());
    const fresh: Profile = {
      name,
      // Eski alan yalnızca Anthropic anahtarını taşır (geriye dönük uyumluluk)
      apiKey: providerId === "anthropic" ? apiKey : "",
      provider: providerId,
      apiKeys: { [providerId]: apiKey },
      activeLanguage: languageId,
      assessment: defaultAssessment(), // sıfırdan başlangıç — tespit yok
      completedModuleIds: [],
    };
    profileRef.current = fresh;
    setProfile(fresh);
    await saveProfile(fresh);
    setScreen({ name: "dashboard" });
  };

  /** Panelden dil değiştirme: mevcut ilerleme saklanır, hedef dilinki yüklenir. */
  const onSwitchLanguage = async (targetId: LanguageId) => {
    const current = profileRef.current;
    if (!current || targetId === getActiveLanguageId()) return;
    const switched = await switchLanguageProgress(current, targetId);
    // Yeni dilin ilerlemesi boşsa o dil de sıfırdan (A0) başlar.
    const next = switched.assessment
      ? switched
      : { ...switched, assessment: defaultAssessment() };
    if (next !== switched) await saveProfile(next);
    profileRef.current = next;
    setProfile(next);
    setLang(getActiveLanguageId());
    setScreen({ name: "dashboard" });
  };

  /**
   * Panelden müfredat kuruldu. completedModuleIds SIFIRLANIR: yeni müfredat
   * da "k1", "o1"... id'leri ürettiği için eski liste taşınsaydı (persist
   * onları birleştirir) yeni modüller baştan bitmiş görünürdü.
   */
  const onCurriculumBuilt = async (curriculum: Curriculum) => {
    const current = profileRef.current;
    if (!current) return;
    const next: Profile = { ...current, curriculum, completedModuleIds: [] };
    profileRef.current = next;
    setProfile(next);
    await saveProfile(next);
    // Modül id'leri yeniden kullanıldığı için eski sohbetler yeni derse sızar.
    await clearModuleChats();
  };

  /**
   * Seviye atlama: yeni müfredat gelince tamamlanan modüller SIFIRLANIR.
   * Yeni müfredatın id'leri de "k1", "o1"... biçiminde üretiliyor; eski
   * listeyi taşırsak yeni modüller daha baştan bitmiş görünürdü.
   */
  const onLevelUp = async (assessment: Assessment, curriculum: Curriculum) => {
    const current = profileRef.current;
    if (!current) return;
    const next: Profile = { ...current, assessment, curriculum, completedModuleIds: [] };
    profileRef.current = next;
    setProfile(next);
    await saveProfile(next);
    await clearModuleChats(); // bkz. onCurriculumBuilt
    setScreen({ name: "dashboard" });
  };

  const onCompleteModule = async (moduleId: string) => {
    const current = profileRef.current;
    if (!current) return;
    if (!current.completedModuleIds.includes(moduleId)) {
      await persist({
        ...current,
        completedModuleIds: [...current.completedModuleIds, moduleId],
      });
    }
    setScreen({ name: "dashboard" });
  };

  /** Üstaz'ın ekrana_git önerisini öğrenci onayladığında. */
  const onNavigate = (s: NavigationSuggestion) => {
    switch (s.screen) {
      case "review":
        setScreen({ name: "review" });
        break;
      case "quiz":
        setScreen({ name: "lesson", module: null, quiz: true });
        break;
      case "pronunciation":
        setScreen({ name: "pronunciation" });
        break;
      case "reading":
        setScreen({ name: "reading" });
        break;
      case "shadowing":
        setScreen({ name: "shadowing" });
        break;
      case "fluency":
        setScreen({ name: "fluency" });
        break;
      case "mistakes":
        setScreen({ name: "mistakes" });
        break;
      case "module": {
        const target = profileRef.current?.curriculum?.modules.find((m) => m.id === s.moduleId);
        setScreen(target ? { name: "lesson", module: target } : { name: "dashboard" });
        break;
      }
      default:
        setScreen({ name: "dashboard" });
    }
  };

  const onReset = async () => {
    await resetAll();
    setActiveLanguage("ar");
    setLang("ar");
    profileRef.current = null;
    setProfile(null);
    setScreen({ name: "setup" });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="auto" />
      {screen.name === "loading" && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}
      {screen.name === "setup" && <SetupScreen onDone={onSetupDone} />}
      {screen.name === "dashboard" && profile && (
        <DashboardScreen
          key={`${lang}.${bootId}`}
          profile={profile}
          onOpenModule={(module) => setScreen({ name: "lesson", module })}
          onFreeChat={() => setScreen({ name: "lesson", module: null })}
          onQuiz={() => setScreen({ name: "lesson", module: null, quiz: true })}
          onOpenReview={() => setScreen({ name: "review" })}
          onOpenMistakes={() => setScreen({ name: "mistakes" })}
          onOpenPronunciation={() => setScreen({ name: "pronunciation" })}
          onOpenReading={() => setScreen({ name: "reading" })}
          onOpenShadowing={() => setScreen({ name: "shadowing" })}
          onOpenFluency={() => setScreen({ name: "fluency" })}
          onSwitchLanguage={(id) => void onSwitchLanguage(id)}
          onOpenLevel={() => setScreen({ name: "level" })}
          onCurriculumBuilt={(c) => void onCurriculumBuilt(c)}
          onLevelUp={() => setScreen({ name: "levelup" })}
          onOpenSettings={() => setScreen({ name: "settings" })}
          onReset={onReset}
        />
      )}
      {screen.name === "levelup" && profile && (
        <LevelUpScreen
          key={lang}
          profile={profile}
          onComplete={(assessment, curriculum) => void onLevelUp(assessment, curriculum)}
          onBack={() => setScreen({ name: "dashboard" })}
        />
      )}
      {screen.name === "level" && profile && (
        <LevelScreen profile={profile} onBack={() => setScreen({ name: "dashboard" })} />
      )}
      {screen.name === "settings" && profile && (
        <SettingsScreen
          profile={profile}
          onSave={(next) => void persist(next)}
          onRestored={onRestored}
          onBack={() => setScreen({ name: "dashboard" })}
        />
      )}
      {screen.name === "lesson" && profile && (
        <LessonScreen
          key={`${lang}.${screen.quiz ? "quiz" : screen.module?.id ?? "freechat"}`}
          profile={profile}
          module={screen.module}
          quiz={screen.quiz}
          onBack={() => setScreen({ name: "dashboard" })}
          onCompleteModule={onCompleteModule}
          onProfileChange={(next) => void persist(next)}
          onNavigate={onNavigate}
        />
      )}
      {screen.name === "review" && (
        <ReviewScreen onBack={() => setScreen({ name: "dashboard" })} />
      )}
      {screen.name === "mistakes" && (
        <MistakesScreen onBack={() => setScreen({ name: "dashboard" })} />
      )}
      {screen.name === "pronunciation" && profile && (
        <PronunciationScreen profile={profile} onBack={() => setScreen({ name: "dashboard" })} />
      )}
      {screen.name === "reading" && profile && (
        <ReadingScreen key={lang} profile={profile} onBack={() => setScreen({ name: "dashboard" })} />
      )}
      {screen.name === "shadowing" && (
        <ShadowingScreen
          key={lang}
          onBack={() => setScreen({ name: "dashboard" })}
          onOpenPronunciation={() => setScreen({ name: "pronunciation" })}
          onOpenReading={() => setScreen({ name: "reading" })}
        />
      )}
      {screen.name === "fluency" && profile && (
        <FluencyScreen
          key={lang}
          profile={profile}
          onBack={() => setScreen({ name: "dashboard" })}
        />
      )}
    </View>
  );
}
