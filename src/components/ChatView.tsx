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
import { isEventMessage } from "../prompts";
import { extractArabic, speakArabic } from "../speech";
import { colors } from "../theme";
import { ChatMessage, NavigationSuggestion } from "../types";

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  onSend: (text: string) => void;
  placeholder?: string;
  /** Üstaz'ın ekrana_git önerisi — zorlamaz, tıklanabilir bir şerit olarak çıkar. */
  suggestion?: NavigationSuggestion | null;
  onSuggestionPress?: () => void;
}

export default function ChatView({
  messages,
  sending,
  onSend,
  placeholder,
  suggestion,
  onSuggestionPress,
}: Props) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const send = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    onSend(text);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <FlatList
        ref={listRef}
        data={messages.filter((m) => !(m.role === "user" && isEventMessage(m.content)))}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View>
            <View
              style={[
                styles.bubble,
                item.role === "user" ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <Text style={item.role === "user" ? styles.userText : styles.assistantText}>
                {item.content}
              </Text>
              {item.role === "assistant" && extractArabic(item.content).length > 0 && (
                <TouchableOpacity
                  style={styles.speakButton}
                  onPress={() => speakArabic(item.content)}
                >
                  <Text style={styles.speakText}>🔊 Arapçayı dinle</Text>
                </TouchableOpacity>
              )}
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
      {sending && (
        <View style={styles.typing}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.typingText}>Üstaz yazıyor…</Text>
        </View>
      )}
      {suggestion && !sending && (
        <TouchableOpacity style={styles.suggestion} onPress={onSuggestionPress}>
          <Text style={styles.suggestionText}>{suggestion.label}</Text>
          <Text style={styles.suggestionArrow}>›</Text>
        </TouchableOpacity>
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder ?? "Mesajını yaz…"}
          placeholderTextColor={colors.inkSoft}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]}
          onPress={send}
          disabled={!draft.trim() || sending}
        >
          <Text style={styles.sendText}>Gönder</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 14, paddingBottom: 8 },
  bubble: {
    maxWidth: "86%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.assistantBubble,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionsWrap: {
    alignSelf: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
    marginTop: -4,
  },
  actionChip: {
    backgroundColor: colors.goldSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionText: { color: colors.gold, fontSize: 12, fontWeight: "600" },
  speakButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  speakText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  userText: { color: "#FFFFFF", fontSize: 16, lineHeight: 23 },
  assistantText: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
  },
  typingText: { color: colors.inkSoft, fontSize: 13 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    gap: 8,
  },
  suggestionText: { flex: 1, color: colors.accent, fontSize: 14, fontWeight: "700" },
  suggestionArrow: { color: colors.accent, fontSize: 20, fontWeight: "700" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  sendButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: "#FFFFFF", fontWeight: "600", fontSize: 15 },
});
