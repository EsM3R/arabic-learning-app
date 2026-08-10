import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AgentContext, ASSESSMENT_TOOLS } from "../agent";
import ChatView from "../components/ChatView";
import { agenticChat, analyzeAssessment, generateCurriculum } from "../claude";
import { assessmentSystem, KICKOFF_ASSESSMENT } from "../prompts";
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

  /** Seviye raporu hazır → müfredatı üret ve panele geç. */
  const buildCurriculum = async (assessment: Assessment) => {
    setFinishStage("planning");
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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Seviye Tespiti</Text>
          <Text style={styles.headerSub}>Üstaz ile tanışma sohbeti</Text>
        </View>
        <TouchableOpacity
          style={styles.finishButton}
          onPress={() => void finishManually()}
          disabled={sending}
        >
          <Text style={styles.finishText}>Değerlendirmeyi Bitir</Text>
        </TouchableOpacity>
      </View>
      <ChatView messages={messages} sending={sending} onSend={onSend} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  headerSub: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  finishButton: {
    backgroundColor: colors.goldSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  finishText: { color: colors.gold, fontWeight: "700", fontSize: 13 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: 16,
  },
  loadingText: { fontSize: 16, color: colors.inkSoft },
});
