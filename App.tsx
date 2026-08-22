import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import AssessmentScreen from "./src/screens/AssessmentScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import LessonScreen from "./src/screens/LessonScreen";
import MistakesScreen from "./src/screens/MistakesScreen";
import PronunciationScreen from "./src/screens/PronunciationScreen";
import ReviewScreen from "./src/screens/ReviewScreen";
import SetupScreen from "./src/screens/SetupScreen";
import { loadProfile, resetAll, saveProfile } from "./src/storage";
import { colors } from "./src/theme";
import {
  Assessment,
  Curriculum,
  CurriculumModule,
  NavigationSuggestion,
  Profile,
} from "./src/types";

type Screen =
  | { name: "loading" }
  | { name: "setup" }
  | { name: "assessment" }
  | { name: "dashboard" }
  | { name: "lesson"; module: CurriculumModule | null; quiz?: boolean }
  | { name: "review" }
  | { name: "mistakes" }
  | { name: "pronunciation" };

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  /** En güncel profil — asenkron turların eski anlık görüntüyle yazmasını engeller. */
  const profileRef = useRef<Profile | null>(null);

  useEffect(() => {
    void (async () => {
      const saved = await loadProfile();
      if (!saved) {
        setScreen({ name: "setup" });
      } else {
        profileRef.current = saved;
        setProfile(saved);
        setScreen(saved.curriculum ? { name: "dashboard" } : { name: "assessment" });
      }
    })();
  }, []);

  const persist = async (next: Profile) => {
    const merged = profileRef.current ? mergeProfile(profileRef.current, next) : next;
    profileRef.current = merged;
    setProfile(merged);
    await saveProfile(merged);
  };

  const onSetupDone = async (name: string, apiKey: string) => {
    const fresh: Profile = { name, apiKey, completedModuleIds: [] };
    profileRef.current = fresh;
    setProfile(fresh);
    await saveProfile(fresh);
    setScreen({ name: "assessment" });
  };

  const onAssessmentComplete = async (assessment: Assessment, curriculum: Curriculum) => {
    if (!profileRef.current) return;
    await persist({ ...profileRef.current, assessment, curriculum });
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
    profileRef.current = null;
    setProfile(null);
    setScreen({ name: "setup" });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" />
      {screen.name === "loading" && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}
      {screen.name === "setup" && <SetupScreen onDone={onSetupDone} />}
      {screen.name === "assessment" && profile && (
        <AssessmentScreen profile={profile} onComplete={onAssessmentComplete} />
      )}
      {screen.name === "dashboard" && profile && (
        <DashboardScreen
          profile={profile}
          onOpenModule={(module) => setScreen({ name: "lesson", module })}
          onFreeChat={() => setScreen({ name: "lesson", module: null })}
          onQuiz={() => setScreen({ name: "lesson", module: null, quiz: true })}
          onOpenReview={() => setScreen({ name: "review" })}
          onOpenMistakes={() => setScreen({ name: "mistakes" })}
          onOpenPronunciation={() => setScreen({ name: "pronunciation" })}
          onReset={onReset}
        />
      )}
      {screen.name === "lesson" && profile && (
        <LessonScreen
          key={screen.quiz ? "quiz" : screen.module?.id ?? "freechat"}
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
    </View>
  );
}
