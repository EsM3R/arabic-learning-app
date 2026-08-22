import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AgentContext, TEACHER_TOOLS, ASSESSMENT_TOOLS } from "../agent";
import ChatView from "../components/ChatView";
import Header from "../components/Header";
import { agenticChat, analyzeAssessment, generateCurriculum } from "../claude";
import {
  assessmentSystem,
  curriculumBuilderSystem,
  KICKOFF_ASSESSMENT,
  KICKOFF_CURRICULUM,
} from "../prompts";
import { colors } from "../theme";
import { Assessment, ChatMessage, Curriculum, Profile } from "../types";

interface Props {
  profile: Profile;
  onComplete: (assessment: Assessment, curriculum: Curriculum) => void;
}

export default function AssessmentScreen({ profile, onComplete }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [finishStage, setFinishStage] = useState<"idle" | "analyzing" | "planning">("idle");
  const started = useRef(false);
  const profileRef = useRef(profile);

  const system = assessmentSystem(profile.name);

  /**
   * Seviye raporu hazır → müfredatı ÜSTAZ kendisi inşa eder: modul_ekle
   * aracını çağıra çağıra, değerlendirmede kaydettiği hataları okuyarak.
   * Yeterli modül kuramazsa tek atımlık üretime düşülür (yedek yol).
   */
  const buildCurriculum = async (assessment: Assessment) => {
    setFinishStage("planning");
    const ctx: AgentContext = {
      profile: {
        ...profileRef.current,
        assessment,
        curriculum: { modules: [], generatedAt: new Date().toISOString() },
      },
      profileChanged: false,
    };
    try {
      await agenticChat(
        curriculumBuilderSystem(profile.name, assessment),
        [{ role: "user", content: KICKOFF_CURRICULUM }],
        ctx,
        TEACHER_TOOLS,
        16
      );
    } catch {
      // agentic kurulum başarısız olursa aşağıdaki yedek yol devreye girer
    }
    const built = ctx.profile.curriculum;
    if (built && built.modules.length >= 6) {
      onComplete(assessment, built);
      return;
    }
    const curriculum = await generateCurriculum(profile.apiKey, profile.name, assessment);
    onComplete(assessment, curriculum);
  };

  const runTurn = async (history: ChatMessage[]) => {
    setSending(true);
    const ctx: AgentContext = { profile: profileRef.current, profileChanged: false };
    try {
      const reply = await agenticChat(system, history, ctx, ASSESSMENT_TOOLS);
      const updated: ChatMessage[] = [
        ...history,
        { role: "assistant", content: reply.text, actions: reply.actions },
      ];
      setMessages(updated);
      if (ctx.profileChanged) profileRef.current = ctx.profile;

      // Üstaz değerlendirmeyi kendisi bitirdiyse müfredata geç.
      if (ctx.assessmentResult) {
        await buildCurriculum(ctx.assessmentResult);
      }
    } catch (e) {
      setFinishStage("idle");
      Alert.alert("Bağlantı hatası", e instanceof Error ? e.message : String(e));
      setMessages(history);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const kickoff: ChatMessage[] = [{ role: "user", content: KICKOFF_ASSESSMENT }];
    setMessages(kickoff);
    void runTurn(kickoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSend = (text: string) => {
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    void runTurn(history);
  };

  /** Kullanıcı yedek yolu: Üstaz beklerken öğrenci bitirmek isterse. */
  const finishManually = async () => {
    if (messages.filter((m) => m.role === "user").length < 3) {
      Alert.alert(
        "Biraz erken",
        "Sağlıklı bir değerlendirme için Üstaz ile birkaç mesaj daha yazışmalısın."
      );
      return;
    }
    try {
      setFinishStage("analyzing");
      const assessment = await analyzeAssessment(profile.apiKey, messages);
      await buildCurriculum(assessment);
    } catch (e) {
      setFinishStage("idle");
      Alert.alert("Hata", e instanceof Error ? e.message : String(e));
    }
  };

  if (finishStage !== "idle") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>
          {finishStage === "analyzing"
            ? "Seviyen değerlendiriliyor…"
            : "Sana özel müfredat hazırlanıyor…"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Seviye Tespiti"
        subtitle="Üstaz ile tanışma sohbeti"
        right={
          <TouchableOpacity
            style={styles.finishButton}
            onPress={() => void finishManually()}
            disabled={sending}
          >
            <Text style={styles.finishText}>Değerlendirmeyi Bitir</Text>
          </TouchableOpacity>
        }
      />
      <ChatView messages={messages} sending={sending} onSend={onSend} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  finishButton: {
    backgroundColor: colors.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  finishText: { color: colors.gold, fontWeight: "800", fontSize: 12.5 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: 16,
  },
  loadingText: { fontSize: 16, color: colors.inkSoft },
});
