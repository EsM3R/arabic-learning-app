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
import Header from "../components/Header";
import { agenticChat, analyzeAssessment, generateCurriculum } from "../claude";
import { getActivePack } from "../languages";
import { assessmentSystem, KICKOFF_ASSESSMENT } from "../prompts";
import { loadMistakes, loadNotes } from "../storage";
import { colors, radius, shadowLift } from "../theme";
import { Assessment, ChatMessage, Curriculum, Profile } from "../types";

interface Props {
  profile: Profile;
  onComplete: (assessment: Assessment, curriculum: Curriculum) => void;
}

/** Müfredatın gerçek gözlemlere dayanması için değerlendirme sırasındaki kayıtlar. */
function summarizeObservations(
  mistakes: { topic: string; mistake: string; correction: string }[],
  notes: { note: string }[]
): string {
  const parts: string[] = [];
  if (mistakes.length > 0) {
    parts.push(
      mistakes
        .slice(-10)
        .map((m) => `- [${m.topic}] "${m.mistake}" → "${m.correction}"`)
        .join("\n")
    );
  }
  if (notes.length > 0) {
    parts.push(notes.slice(-5).map((n) => `- ${n.note}`).join("\n"));
  }
  return parts.join("\n");
}

export default function AssessmentScreen({ profile, onComplete }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [finishStage, setFinishStage] = useState<"idle" | "analyzing" | "planning">("idle");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(false);
  const profileRef = useRef(profile);

  const system = assessmentSystem(profile.name);
  const teacher = getActivePack().teacherName;

  // Uzun süren adımda ekranın donmadığı görünsün diye geçen süre sayılır.
  useEffect(() => {
    if (finishStage === "idle" || buildError) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [finishStage, buildError]);

  /**
   * Seviye raporu hazır → müfredat TEK yapılandırılmış çağrıyla üretilir.
   *
   * Önceden modüller agentic döngüde modul_ekle ile tek tek ekleniyordu:
   * 12-16 modül için 10+ tur, her tur ayrı bir API çağrısı — dakikalarca
   * hiç değişmeyen bir bekleme ekranı demekti. Aynı promptun tek atımlık
   * hâli aynı müfredatı bir çağrıda veriyor. Agentic yolun tek üstünlüğü
   * olan "değerlendirmedeki gözlemleri okuma" özelliği, gözlemler prompta
   * verilerek korundu.
   */
  const buildCurriculum = async (assessment: Assessment) => {
    setBuildError(null);
    setFinishStage("planning");
    try {
      const [mistakes, notes] = await Promise.all([loadMistakes(), loadNotes()]);
      const curriculum = await generateCurriculum(
        profileRef.current,
        assessment,
        summarizeObservations(mistakes, notes)
      );
      const count = curriculum.modules?.length ?? 0;
      if (count < 4) {
        throw new Error(
          `Müfredat beklenenden kısa geldi (${count} modül). Tekrar denemek genelde çözer.`
        );
      }
      onComplete(assessment, curriculum);
    } catch (e) {
      // Çıkmaz sokak bırakma: hatayı göster, tekrar deneme yolu sun.
      setBuildError(e instanceof Error ? e.message : String(e));
    }
  };

  const runTurn = async (history: ChatMessage[]) => {
    setSending(true);
    const ctx: AgentContext = { profile: profileRef.current, profileChanged: false };
    try {
      const reply = await agenticChat(system, history, ctx, {
        tools: ASSESSMENT_TOOLS,
        effort: "high",
      });
      const updated: ChatMessage[] = [
        ...history,
        { role: "assistant", content: reply.text, actions: reply.actions },
      ];
      setMessages(updated);
      if (ctx.profileChanged) profileRef.current = ctx.profile;

      // Hoca değerlendirmeyi kendisi bitirdiyse müfredata geç.
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

  const userTurns = messages.filter((m) => m.role === "user").length;
  const canFinish = userTurns >= 3;

  /** Öğrenci beklemek istemezse kendi bitirebilir. */
  const finishManually = async () => {
    if (!canFinish) {
      Alert.alert(
        "Biraz erken",
        `Sağlıklı bir değerlendirme için ${teacher} ile birkaç mesaj daha yazışmalısın.`
      );
      return;
    }
    setBuildError(null);
    setFinishStage("analyzing");
    try {
      const assessment = await analyzeAssessment(profileRef.current, messages);
      await buildCurriculum(assessment);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
    }
  };

  const retry = () => {
    setBuildError(null);
    void finishManually();
  };

  const backToChat = () => {
    setBuildError(null);
    setFinishStage("idle");
  };

  if (finishStage !== "idle") {
    if (buildError) {
      return (
        <View style={styles.center}>
          <Text style={styles.errEmoji}>😕</Text>
          <Text style={styles.errTitle}>Müfredat hazırlanamadı</Text>
          <Text style={styles.errText} selectable>
            {buildError}
          </Text>
          <TouchableOpacity style={styles.primary} onPress={retry} activeOpacity={0.85}>
            <Text style={styles.primaryText}>Tekrar dene</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={backToChat}>
            <Text style={styles.secondaryText}>Sohbete dön</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>
          {finishStage === "analyzing"
            ? "Seviyen değerlendiriliyor…"
            : "Sana özel müfredat hazırlanıyor…"}
        </Text>
        <Text style={styles.loadingSub}>
          {elapsed}s · {teacher} iki parkur için 12-16 modül tasarlıyor
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Seviye Tespiti"
        subtitle={
          canFinish
            ? "Yeterli geldiyse sağ üstten bitirebilirsin"
            : `${teacher} ile tanışma sohbeti`
        }
        right={
          <TouchableOpacity
            style={[styles.finishButton, canFinish && styles.finishButtonReady]}
            onPress={() => void finishManually()}
            disabled={sending}
          >
            <Text style={[styles.finishText, canFinish && styles.finishTextReady]}>
              Bitir
            </Text>
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
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  finishButtonReady: { backgroundColor: colors.accent },
  finishText: { color: colors.gold, fontWeight: "800", fontSize: 12.5 },
  finishTextReady: { color: "#FFFFFF" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: 32,
    gap: 12,
  },
  loadingText: { fontSize: 16, color: colors.ink, fontWeight: "700", marginTop: 4 },
  loadingSub: { fontSize: 13, color: colors.inkSoft, textAlign: "center" },
  errEmoji: { fontSize: 40 },
  errTitle: { fontSize: 19, fontWeight: "800", color: colors.ink },
  errText: {
    fontSize: 13.5,
    color: colors.inkSoft,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 10,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 15,
    paddingHorizontal: 40,
    ...shadowLift,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  secondary: { paddingVertical: 10, paddingHorizontal: 20 },
  secondaryText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
});
