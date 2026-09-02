import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getActivePack } from "../languages";
import { isEventMessage } from "../prompts";
import RichText from "./RichText";
import { extractArabic, speakTarget } from "../speech";
import { isSpoken, stripSpokenMark } from "../speechinput";
import { useDictation } from "../useDictation";
import { colors, shadow } from "../theme";
import { ChatMessage, NavigationSuggestion } from "../types";

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  /** Akış halindeki hoca cevabı — kaydedilmeden canlı balonda çizilir. */
  live?: string | null;
  /** "düşünüyor… / defterine bakıyor…" durum satırı (yazıyor… yerine). */
  status?: string | null;
  /** spoken=true → metin mikrofondan geldi (hoca bunu bilmeli). */
  onSend: (text: string, spoken?: boolean) => void;
  placeholder?: string;
  /** Üstaz'ın ekrana_git önerisi — zorlamaz, tıklanabilir bir şerit olarak çıkar. */
  suggestion?: NavigationSuggestion | null;
  onSuggestionPress?: () => void;
}

export default function ChatView({
  messages,
  sending,
  live,
  status,
  onSend,
  placeholder,
  suggestion,
  onSuggestionPress,
}: Props) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const pack = getActivePack();
  /** Mikrofondan gelen ve öğrencinin elle değiştirmediği metin. */
  const spokenDraft = useRef<string | null>(null);

  // Mikrofon: söylenen doğrudan yazı kutusuna düşer — öğrenci göndermeden
  // önce görebilir ve düzeltebilir (ses tanıma gürültülüdür).
  const dictation = useDictation({
    onResult: (text) => {
      spokenDraft.current = text;
      setDraft(text);
    },
  });

  const send = () => {
    const text = draft.trim();
    if (!text || sending) return;
    const spoken = spokenDraft.current !== null && spokenDraft.current.trim() === text;
    spokenDraft.current = null;
    setDraft("");
    onSend(text, spoken);
  };

  return (
    // behavior Android'de de "padding" olmalı: uygulama edge-to-edge modunda
    // çalışıyor ve o modda Android pencereyi klavye için küçültmüyor. undefined
    // bırakılırsa yazı kutusu klavyenin altında kalıyor.
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <FlatList
        ref={listRef}
        data={[
          ...messages.filter((m) => !(m.role === "user" && isEventMessage(m.content))),
          ...(live ? [{ role: "assistant" as const, content: live }] : []),
        ]}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View>
            <View style={item.role === "user" ? styles.userRow : styles.assistantRow}>
              {item.role === "assistant" && (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{pack.avatarLetter}</Text>
                </View>
              )}
              <View
                style={[
                  styles.bubble,
                  item.role === "user" ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                {item.role === "user" ? (
                  // Sesli işareti hocaya gider ama öğrenciye küçük bir rozet
                  // olarak görünür — kendi cümlesini temiz okusun.
                  <Text style={styles.userText}>
                    {isSpoken(item.content) ? "🎙️ " : ""}
                    {stripSpokenMark(item.content)}
                  </Text>
                ) : (
                  <RichText
                    content={item.content}
                    style={styles.assistantText}
                    scaleScript={pack.scriptExtract}
                  />
                )}
                {item.role === "assistant" &&
                  pack.scriptExtract &&
                  extractArabic(item.content).length > 0 && (
                  <TouchableOpacity
                    style={styles.speakButton}
                    onPress={() => speakTarget(item.content)}
                  >
                    <Text style={styles.speakText}>🔊 Dinle</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {item.actions && item.actions.length > 0 && (
              <View style={styles.actionsWrap}>
                {item.actions.map((action, i) => (
                  <View key={i} style={styles.actionChip}>
                    <Text style={styles.actionText}>{action}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      />
      {sending && (status || !live) && (
        <View style={styles.typing}>
          <View style={styles.avatarSmall}>
            <Text style={styles.avatarSmallText}>{pack.avatarLetter}</Text>
          </View>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.typingText}>
            {pack.teacherName} {status ?? "yazıyor…"}
          </Text>
        </View>
      )}
      {suggestion && !sending && (
        <TouchableOpacity style={styles.suggestion} onPress={onSuggestionPress}>
          <Text style={styles.suggestionText}>{suggestion.label}</Text>
          <View style={styles.suggestionGo}>
            <Text style={styles.suggestionGoText}>›</Text>
          </View>
        </TouchableOpacity>
      )}
      {dictation.error && (
        <View style={styles.micError}>
          <Text style={styles.micErrorText}>{dictation.error}</Text>
        </View>
      )}
      {dictation.listening && (
        <View style={styles.micBanner}>
          <ActivityIndicator size="small" color={colors.gold} />
          <Text style={styles.micBannerText} numberOfLines={2}>
            {dictation.partial || `Dinliyorum… ${pack.label} konuş`}
          </Text>
        </View>
      )}
      <View style={styles.inputRow}>
        <TouchableOpacity
          style={[styles.micButton, dictation.listening && styles.micButtonOn]}
          onPress={() => (dictation.listening ? dictation.stop() : dictation.start())}
          disabled={sending}
          accessibilityLabel={dictation.listening ? "Dinlemeyi durdur" : "Konuşarak yaz"}
        >
          <Text style={styles.micText}>{dictation.listening ? "⏹" : "🎙️"}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            // Elle düzeltilen metin artık "söylenmiş" sayılmaz; ancak
            // dokunulmadan gönderilirse konuşma olarak işaretlenir.
            if (spokenDraft.current && t !== spokenDraft.current) spokenDraft.current = null;
          }}
          placeholder={placeholder ?? "Mesajını yaz…"}
          placeholderTextColor={colors.inkFaint}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]}
          onPress={send}
          disabled={!draft.trim() || sending}
        >
          <Text style={styles.sendText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  micButtonOn: { backgroundColor: colors.danger },
  micText: { fontSize: 19 },
  micBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.goldSoft,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  micBannerText: { flex: 1, fontSize: 13, color: colors.gold, fontWeight: "700" },
  micError: {
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  micErrorText: { fontSize: 12.5, color: colors.danger, lineHeight: 18 },
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, paddingBottom: 10 },
  userRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 12 },
  assistantRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 12,
    gap: 8,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.deep,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  avatarText: { color: colors.goldDeep, fontSize: 15, fontWeight: "700" },
  avatarSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.deep,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSmallText: { color: colors.goldDeep, fontSize: 11, fontWeight: "700" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  userBubble: {
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    backgroundColor: colors.assistantBubble,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  userText: { color: "#FFFFFF", fontSize: 15.5, lineHeight: 23 },
  assistantText: { color: colors.ink, fontSize: 15.5, lineHeight: 24 },
  actionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
    marginLeft: 38,
  },
  actionChip: {
    backgroundColor: colors.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#EAD9B0",
  },
  actionText: { color: colors.gold, fontSize: 12, fontWeight: "700" },
  speakButton: {
    marginTop: 9,
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  speakText: { color: colors.accentDark, fontSize: 12, fontWeight: "700" },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 8,
  },
  typingText: { color: colors.inkSoft, fontSize: 13 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: colors.deep,
    gap: 10,
    ...shadow,
  },
  suggestionText: { flex: 1, color: colors.onDeep, fontSize: 14, fontWeight: "700" },
  suggestionGo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.goldDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionGoText: { color: colors.deep, fontSize: 17, fontWeight: "800", marginTop: -2 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 23,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15.5,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.35 },
  sendText: { color: "#FFFFFF", fontWeight: "800", fontSize: 20, marginTop: -1 },
});
