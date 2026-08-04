import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
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
import { Assessment, Curriculum, CurriculumModule, Profile } from "./src/types";

type Screen =
  | { name: "loading" }
  | { name: "setup" }
  | { name: "assessment" }
  | { name: "dashboard" }
  | { name: "lesson"; module: CurriculumModule | null }
  | { name: "review" }
  | { name: "mistakes" }
  | { name: "pronunciation" };

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "loading" });

  useEffect(() => {
    void (async () => {
      const saved = await loadProfile();
      if (!saved) {
        setScreen({ name: "setup" });
      } else {
        setProfile(saved);
        setScreen(saved.curriculum ? { name: "dashboard" } : { name: "assessment" });
      }
    })();
  }, []);

  const persist = async (next: Profile) => {
    setProfile(next);
    await saveProfile(next);
  };

  const onSetupDone = async (name: string, apiKey: string) => {
    await persist({ name, apiKey, completedModuleIds: [] });
    setScreen({ name: "assessment" });
  };

  const onAssessmentComplete = async (assessment: Assessment, curriculum: Curriculum) => {
    if (!profile) return;
    await persist({ ...profile, assessment, curriculum });
    setScreen({ name: "dashboard" });
  };

  const onCompleteModule = async (moduleId: string) => {
    if (!profile) return;
    if (!profile.completedModuleIds.includes(moduleId)) {
      await persist({
        ...profile,
        completedModuleIds: [...profile.completedModuleIds, moduleId],
      });
    }
    setScreen({ name: "dashboard" });
  };

  const onReset = async () => {
    await resetAll();
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
        <AssessmentScreen
          name={profile.name}
          apiKey={profile.apiKey}
          onComplete={onAssessmentComplete}
        />
      )}
      {screen.name === "dashboard" && profile && (
        <DashboardScreen
          profile={profile}
          onOpenModule={(module) => setScreen({ name: "lesson", module })}
          onFreeChat={() => setScreen({ name: "lesson", module: null })}
          onOpenReview={() => setScreen({ name: "review" })}
          onOpenMistakes={() => setScreen({ name: "mistakes" })}
          onOpenPronunciation={() => setScreen({ name: "pronunciation" })}
          onReset={onReset}
        />
      )}
      {screen.name === "lesson" && profile && (
        <LessonScreen
          profile={profile}
          module={screen.module}
          onBack={() => setScreen({ name: "dashboard" })}
          onCompleteModule={onCompleteModule}
          onProfileChange={(next) => void persist(next)}
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
