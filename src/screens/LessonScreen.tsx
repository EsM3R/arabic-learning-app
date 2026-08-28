import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AgentContext } from "../agent";
import ChatView from "../components/ChatView";
import Header from "../components/Header";
import { agenticChat } from "../claude";
import { getActivePack } from "../languages";
import { extractArabic } from "../speech";
import { recordStat } from "../statsStore";
import {
  freeChatSystem,
  idleNudgeEvent,
  KICKOFF_FREECHAT,
  KICKOFF_LESSON,
  KICKOFF_QUIZ,
  lessonSystem,
  memoryContext,
  quizSystem,
  retentionDigest,
} from "../prompts";
import {
  loadChat,
  loadMistakes,
  loadNotes,
  loadVocab,
  saveChat,
  touchLastActivity,
} from "../storage";
import { colors } from "../theme";
import { ChatMessage, CurriculumModule, NavigationSuggestion, Profile } from "../types";

interface Props {
  profile: Profile;
  /** null → serbest sohbet (veya quiz=true ise kelime sınavı) modu */
  module: CurriculumModule | null;
  /** true → Üstaz'la Tekrar: sözlü kelime sınavı, her açılışta taze başlar. */
  quiz?: boolean;
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
  quiz = false,
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
  /** Sessizlik dürtmesi: oturum başına bir kez, öğrenci yazınca iptal. */
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeUsed = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const clearIdleTimer = () => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  };

  useEffect(() => clearIdleTimer, []);

  /** Üstaz cevap verdikten sonra kurulur: 4 dk sessizlik → kendiliğinden yoklar. */
  const armIdleTimer = () => {
    clearIdleTimer();
    if (nudgeUsed.current) return;
    idleTimer.current = setTimeout(() => {
      if (nudgeUsed.current) return;
      nudgeUsed.current = true;
      const history: ChatMessage[] = [
        ...messagesRef.current,
        { role: "user", content: idleNudgeEvent(4) },
      ];
      setMessages(history);
      void saveChat(chatId, history);
      void runTurn(history);
    }, 4 * 60 * 1000);
  };

  const chatId = quiz ? "quiz" : module ? `module.${module.id}` : "freechat";
  const kickoff = quiz ? KICKOFF_QUIZ : module ? KICKOFF_LESSON : KICKOFF_FREECHAT;
  const isDone = module ? profile.completedModuleIds.includes(module.id) : false;

  /**
   * Sistem promptunu HER TURDA taze hafıza ve tekrar verisiyle kurar.
   * Sabit kısım (ders promptu) önbelleklenir; değişken kısım (hafıza) sona gider.
   */
  const buildSystem = async (current: Profile) => {
    const [mistakes, notes, vocab] = await Promise.all([
      loadMistakes(),
      loadNotes(),
      loadVocab(),
    ]);
    const stable = quiz
      ? quizSystem(current)
      : module
        ? lessonSystem(current, module)
        : freeChatSystem(current);
    return {
      stable,
      dynamic: memoryContext(mistakes, notes, module?.track) + retentionDigest(vocab),
    };
  };

  const runTurn = async (history: ChatMessage[]) => {
    clearIdleTimer();
    setSending(true);
    setSuggestion(null);
    void touchLastActivity();
    const ctx: AgentContext = {
      profile: profileRef.current,
      profileChanged: false,
      currentModuleId: module?.id,
      currentTrack: module?.track,
    };
    try {
      const system = await buildSystem(ctx.profile);
      // Ders anlatımı tam güçte düşünür; sınav ve serbest sohbet daha mekanik.
      const reply = await agenticChat(system, history, ctx, {
        effort: module ? "high" : "medium",
      });
      const updated: ChatMessage[] = [
        ...history,
        { role: "assistant", content: reply.text, actions: reply.actions },
      ];
      setMessages(updated);
      await saveChat(chatId, updated);
      if (ctx.pendingNavigation) setSuggestion(ctx.pendingNavigation);
      armIdleTimer();
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
      // Sınav her açılışta taze başlar; ders ve sohbet kaldığı yerden sürer.
      const saved = quiz ? [] : await loadChat(chatId);
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
    clearIdleTimer();
    nudgeUsed.current = false; // öğrenci yazdı → dürtme hakkı yenilenir
    // Hedef dilde yazılmış mesaj üretimdir. Yalnız ayrı alfabeli dillerde
    // güvenle tespit edilebiliyor (Latin dillerde Türkçe/hedef ayrımı yok —
    // dürüst metrik için sayılmaz; oradaki üretim sınav/okuma/gölgelemeden gelir).
    if (getActivePack().scriptExtract && extractArabic(text).length > 0) {
      void recordStat("produced");
    }
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

  const pack = getActivePack();

  return (
    <View style={styles.container}>
      <Header
        title={quiz ? `${pack.teacherName} ile Tekrar` : module ? module.title : "Serbest Sohbet"}
        subtitle={
          quiz
            ? "Sözlü kelime sınavı — takvimi hocan kurar"
            : module
              ? `${pack.tracks[module.track].short} · ${module.level}`
              : `${pack.teacherName} ile ${pack.tracks.konusma.short.toLowerCase()} pratiği`
        }
        onBack={onBack}
        right={
          module && !isDone ? (
            <TouchableOpacity style={styles.completeButton} onPress={complete}>
              <Text style={styles.completeText}>Dersi Tamamla</Text>
            </TouchableOpacity>
          ) : isDone ? (
            <View style={styles.doneBadgeWrap}>
              <Text style={styles.doneBadge}>✓ Bitti</Text>
            </View>
          ) : null
        }
      />
      <ChatView
        messages={messages}
        sending={sending}
        onSend={onSend}
        placeholder={module || quiz ? "Cevabını yaz…" : pack.chatPlaceholderFree}
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
  completeButton: {
    backgroundColor: colors.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  completeText: { color: colors.gold, fontWeight: "800", fontSize: 12 },
  doneBadgeWrap: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  doneBadge: { color: colors.accentDark, fontWeight: "800", fontSize: 12 },
});
