import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AgentContext } from "../agent";
import ChatView from "../components/ChatView";
import { agenticChat } from "../claude";
import {
  freeChatSystem,
  KICKOFF_FREECHAT,
  KICKOFF_LESSON,
  lessonSystem,
  memoryContext,
  retentionDigest,
} from "../prompts";
import { loadChat, loadMistakes, loadNotes, loadVocab, saveChat } from "../storage";
import { colors } from "../theme";
import { ChatMessage, CurriculumModule, NavigationSuggestion, Profile } from "../types";

interface Props {
  profile: Profile;
  /** null → serbest sohbet modu */
  module: CurriculumModule | null;
  onBack: () => void;
  onCompleteModule: (moduleId: string) => void;
  /** Üstaz araçlarıyla profili değiştirdiğinde (seviye, müfredat, modül tamamlama) çağrılır. */
  onProfileChange: (profile: Profile) => void;
  /** Üstaz'ın ekrana_git önerisini öğrenci onaylarsa çağrılır. */
  onNavigate: (suggestion: NavigationSuggestion) => void;
}

export default function LessonScreen({
  profile,
  module,
  onBack,
  onCompleteModule,
  onProfileChange,
  onNavigate,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [suggestion, setSuggestion] = useState<NavigationSuggestion | null>(null);
  const started = useRef(false);
  /** Turlar arası en güncel profil — React state'inin gecikmesine takılmamak için. */
  const profileRef = useRef(profile);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const chatId = module ? `module.${module.id}` : "freechat";
  const kickoff = module ? KICKOFF_LESSON : KICKOFF_FREECHAT;
  const isDone = module ? profile.completedModuleIds.includes(module.id) : false;

  /** Sistem promptunu HER TURDA taze hafıza ve tekrar verisiyle kurar. */
  const buildSystem = async (current: Profile): Promise<string> => {
    const [mistakes, notes, vocab] = await Promise.all([
      loadMistakes(),
      loadNotes(),
      loadVocab(),
    ]);
    const base = module ? lessonSystem(current, module) : freeChatSystem(current);
    return base + memoryContext(mistakes, notes, module?.track) + retentionDigest(vocab);
  };

  const runTurn = async (history: ChatMessage[]) => {
    setSending(true);
    setSuggestion(null);
    const ctx: AgentContext = {
      profile: profileRef.current,
      profileChanged: false,
      currentModuleId: module?.id,
      currentTrack: module?.track,
    };
    try {
      const system = await buildSystem(ctx.profile);
      const reply = await agenticChat(system, history, ctx);
      const updated: ChatMessage[] = [
        ...history,
        { role: "assistant", content: reply.text, actions: reply.actions },
      ];
      setMessages(updated);
      await saveChat(chatId, updated);
      if (ctx.pendingNavigation) setSuggestion(ctx.pendingNavigation);
    } catch (e) {
      Alert.alert("Bağlantı hatası", e instanceof Error ? e.message : String(e));
      setMessages(history);
    } finally {
      // Araçlar profili zaten diske yazdı; burada UI durumunu senkronlıyoruz.
      // finally içinde olması, tur hata alsa bile seviye/modül değişikliğinin
      // ekrana yansımasını garanti eder.
      if (ctx.profileChanged) {
        profileRef.current = ctx.profile;
        onProfileChange(ctx.profile);
      }
      setSending(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const saved = await loadChat(chatId);
      if (saved.length > 0) {
        setMessages(saved);
        return;
      }
      const initial: ChatMessage[] = [{ role: "user", content: kickoff }];
      setMessages(initial);
      await runTurn(initial);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSend = (text: string) => {
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    void saveChat(chatId, history);
    void runTurn(history);
  };

  const complete = () => {
    if (!module) return;
    Alert.alert("Modülü tamamla", `"${module.title}" tamamlandı olarak işaretlensin mi?`, [
      { text: "Henüz değil", style: "cancel" },
      { text: "Evet, tamamladım", onPress: () => onCompleteModule(module.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {module ? module.title : "Serbest Sohbet"}
          </Text>
          <Text style={styles.headerSub}>
            {module
              ? `${module.track === "konusma" ? "Ammice" : "Fusha"} · ${module.level}`
              : "Şami ammicesiyle pratik"}
          </Text>
        </View>
        {module && !isDone ? (
          <TouchableOpacity style={styles.completeButton} onPress={complete}>
            <Text style={styles.completeText}>Dersi Tamamla</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer}>
            {isDone ? <Text style={styles.doneBadge}>✓ Bitti</Text> : null}
          </View>
        )}
      </View>
      <ChatView
        messages={messages}
        sending={sending}
        onSend={onSend}
        placeholder={module ? "Cevabını yaz…" : "اكتب هون… (buraya yaz)"}
        suggestion={suggestion}
        onSuggestionPress={() => {
          if (suggestion) onNavigate(suggestion);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  backButton: { paddingVertical: 4, paddingHorizontal: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: "700" },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  headerSub: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  completeButton: {
    backgroundColor: colors.goldSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  completeText: { color: colors.gold, fontWeight: "700", fontSize: 12 },
  headerSpacer: { minWidth: 40, alignItems: "flex-end" },
  doneBadge: { color: colors.accent, fontWeight: "700", fontSize: 12 },
});
