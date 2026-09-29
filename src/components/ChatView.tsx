import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { useRecorderDictation } from "../useRecorderDictation";
import type { VoiceBackend } from "../neuralVoice";
import { TEXT_SCALES } from "../storage";
import { colors, shadow } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
import { ChatMessage, NavigationSuggestion } from "../types";
import { containsTargetScript, isRtl } from "../scripts";

/** Sesli derste öğrenci sustuktan sonra sıranın geçmesi için beklenen süre. */
const SILENCE_MS = 2200;

/**
 * SESLİ DERS — sohbeti mesajlaşmadan konuşmaya çeviren kısım.
 * Açıkken hoca cevabı cümle cümle seslenir (ekranı LessonScreen sürer),
 * hoca susunca mikrofon kendi açılır, öğrenci susunca söylenen kendiliğinden
 * gider. Kapalıyken eski düzen: basılı tut, yazı kutusuna düşsün, gönder.
 */
export interface ChatVoice {
  on: boolean;
  /** Bu cihazda sesli ders mümkün mü (ses modeli ya da ayrı alfabe). */
  available: boolean;
  onToggle: () => void;
  /** Hoca şu an konuşuyor mu + hangi cümleyi. */
  speaking: boolean;
  nowSaying: string;
  onStop: () => void;
  /** Her artışında (hoca sustu) mikrofon kendiliğinden açılır. */
  listenSignal: number;
  /** Ses modeliyle tanıma; null → telefonun tanıması. */
  stt: VoiceBackend | null;
  /** 🔊 Dinle: mesajı hocanın sesiyle oku. */
  speakMessage: (text: string) => void;
}

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
  voice?: ChatVoice;
  /** Yazı boyutu çarpanı (TEXT_SCALES içinden). */
  textScale?: number;
  onTextScale?: (scale: number) => void;
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
  voice,
  textScale = 1,
  onTextScale,
}: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors, textScale), [colors, textScale]);
  const voiceOn = !!voice?.on;

  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const pack = getActivePack();
  /** Mikrofondan gelen ve öğrencinin elle değiştirmediği metin. */
  const spokenDraft = useRef<string | null>(null);

  // Kancalar sonucu başlatıldıkları andaki kapanışla teslim edebilir:
  // güncel değerler ref'ten okunur.
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  // Mikrofon. Sesli derste söylenen doğrudan gider (konuşmada kimse
  // cümlesini göndermeden önce düzeltmez); yazılı düzende yazı kutusuna
  // düşer — öğrenci göndermeden önce görebilir ve düzeltebilir.
  const onHeard = (text: string) => {
    const t = text.trim();
    if (voiceOnRef.current) {
      if (t) onSendRef.current(t, true);
      return;
    }
    spokenDraft.current = text;
    setDraft(text);
  };
  const phoneDictation = useDictation({
    autoStopMs: voiceOn ? SILENCE_MS : undefined,
    onResult: onHeard,
  });
  const recorderDictation = useRecorderDictation({
    backend: voiceOn && voice?.stt ? voice.stt : null,
    silenceMs: SILENCE_MS,
    onResult: onHeard,
  });
  const dictation = voiceOn && voice?.stt ? recorderDictation : phoneDictation;
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;

  // Hoca sustu → sıra öğrencide: mikrofon kendi açılır.
  const listenSignal = voice?.listenSignal ?? 0;
  useEffect(() => {
    if (listenSignal > 0 && voiceOnRef.current) dictationRef.current.start();
  }, [listenSignal]);

  /** Sesli derste mikrofon dokun-konuş: hoca konuşuyorsa sözünü keser. */
  const tapMic = () => {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    if (voice?.speaking) voice.onStop();
    dictation.start();
  };

  const scaleIdx = TEXT_SCALES.indexOf(textScale);
  const bumpScale = (dir: 1 | -1) => {
    const i = Math.min(TEXT_SCALES.length - 1, Math.max(0, (scaleIdx < 0 ? 1 : scaleIdx) + dir));
    onTextScale?.(TEXT_SCALES[i]);
  };

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
      {(voice || onTextScale) && (
        <View style={styles.toolbar}>
          {voice && (
            <TouchableOpacity
              style={[styles.toolChip, voiceOn && styles.toolChipOn, !voice.available && styles.toolChipOff]}
              onPress={voice.onToggle}
              disabled={!voice.available}
              accessibilityLabel="Sesli ders"
            >
              <Text style={[styles.toolText, voiceOn && styles.toolTextOn]}>
                {!voice.available
                  ? "🔇 Sesli ders için Ayarlar'dan ses modeli seç"
                  : voiceOn
                    ? "🔊 Sesli ders açık"
                    : "🔇 Sesli ders kapalı"}
              </Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          {onTextScale && (
            <>
              <TouchableOpacity
                style={styles.sizeBtn}
                onPress={() => bumpScale(-1)}
                disabled={scaleIdx === 0}
                accessibilityLabel="Yazıyı küçült"
              >
                <Text style={[styles.sizeText, scaleIdx === 0 && styles.sizeTextOff]}>A−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sizeBtn}
                onPress={() => bumpScale(1)}
                disabled={scaleIdx === TEXT_SCALES.length - 1}
                accessibilityLabel="Yazıyı büyüt"
              >
                <Text style={[styles.sizeTextBig, scaleIdx === TEXT_SCALES.length - 1 && styles.sizeTextOff]}>A+</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
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
                    scaleScript={isRtl(pack.script)}
                  />
                )}
                {item.role === "assistant" &&
                  containsTargetScript(item.content, pack.script) && (
                  <TouchableOpacity
                    style={styles.speakButton}
                    onPress={() => (voice ? voice.speakMessage(item.content) : speakTarget(item.content))}
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
      {voice?.speaking && (
        <View style={styles.speakingBar}>
          <Text style={styles.speakingText} numberOfLines={2}>
            🔊 {voice.nowSaying || `${pack.teacherName} konuşuyor…`}
          </Text>
          <TouchableOpacity style={styles.hushBtn} onPress={voice.onStop} accessibilityLabel="Sustur">
            <Text style={styles.hushText}>Sustur</Text>
          </TouchableOpacity>
        </View>
      )}
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
            {dictation.partial ||
              (voiceOn ? "Dinliyorum… konuş, susunca kendi gider" : "Dinliyorum… bitince parmağını kaldır")}
          </Text>
        </View>
      )}
      <View style={styles.inputRow}>
        <TouchableOpacity
          style={[styles.micButton, dictation.listening && styles.micButtonOn]}
          // Yazılı düzende basılı tut - konuş - bırak: bitişe öğrenci karar verir.
          // Sesli derste dokun ve konuş: susunca sıra kendi geçer.
          onPressIn={voiceOn ? undefined : () => dictation.start()}
          onPressOut={voiceOn ? undefined : () => dictation.stop()}
          onPress={voiceOn ? tapMic : undefined}
          disabled={sending}
          accessibilityLabel={voiceOn ? "Dokun ve konuş" : "Basılı tutarak konuş"}
        >
          <Text style={styles.micText}>{dictation.listening ? "●" : "🎙️"}</Text>
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

/**
 * Stiller paletin FONKSİYONU: karanlık modda renkler değişir ama yapı
 * (ölçü, yerleşim, yazı tipi) aynı kalır. Parametre adı bilinçli olarak
 * `colors` — gövdedeki bütün jetonlar olduğu gibi çalışsın diye.
 */
function makeStyles(colors: Palette, k = 1) {
  const fs = (n: number) => Math.round(n * k * 10) / 10;
  return StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  toolChip: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 1,
  },
  toolChipOn: { backgroundColor: colors.accentSoft, borderColor: "transparent" },
  toolChipOff: { opacity: 0.7 },
  toolText: { fontSize: 12, fontWeight: "700", color: colors.inkSoft },
  toolTextOn: { color: colors.accentDark },
  sizeBtn: {
    width: 36,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeText: { fontSize: 12, fontWeight: "800", color: colors.ink },
  sizeTextBig: { fontSize: 15, fontWeight: "800", color: colors.ink },
  sizeTextOff: { opacity: 0.3 },
  speakingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.deep,
  },
  speakingText: { flex: 1, color: colors.onDeep, fontSize: fs(14), lineHeight: fs(20) },
  hushBtn: {
    backgroundColor: colors.goldDeep,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hushText: { color: colors.deep, fontSize: 12, fontWeight: "800" },
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
    maxWidth: "84%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  userBubble: {
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    // Hocanın mesajları uzun açıklamalar: dar balonda satırlar kırık kırık
    // akıyordu. Hoca balonu neredeyse tam genişlik.
    maxWidth: "90%",
    flexShrink: 1,
    backgroundColor: colors.assistantBubble,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  userText: { color: "#FFFFFF", fontSize: fs(15.5), lineHeight: fs(23) },
  assistantText: { color: colors.ink, fontSize: fs(15.5), lineHeight: fs(24) },
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
    fontSize: fs(15.5),
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
}
