import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { getActivePack } from "../languages";
import { isEventMessage } from "../prompts";
import RichText from "./RichText";
import { speakTarget } from "../speech";
import { isSpoken, stripSpokenMark } from "../speechinput";
import { useDictation } from "../useDictation";
import { useRecorderDictation } from "../useRecorderDictation";
import type { VoiceBackend } from "../neuralVoice";
import { radius, shadow } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
import { ChatMessage, NavigationSuggestion } from "../types";
import { containsTargetScript, isRtl } from "../scripts";
import Icon from "./Icon";
import { IconButton, PressableScale, StarPattern, TeacherAvatar, Txt, useInsets, Wave } from "./kit";

/** Sesli derste öğrenci sustuktan sonra sıranın geçmesi için beklenen süre. */
const SILENCE_MS = 2200;

/**
 * SESLİ DERS — sohbeti mesajlaşmadan konuşmaya çeviren kısım.
 * Açıkken hoca cevabı cümle cümle seslenir (ekranı LessonScreen sürer),
 * hoca susunca mikrofon kendi açılır, öğrenci susunca söylenen kendiliğinden
 * gider. Kapalıyken yazılı düzen: yazı kutusu, basılı tut-konuş, gönder.
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
  /** Dinle: mesajı hocanın sesiyle oku. */
  speakMessage: (text: string) => void;
}

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  /** Akış halindeki hoca cevabı — kaydedilmeden canlı kartta çizilir. */
  live?: string | null;
  /** "düşünüyor… / defterine bakıyor…" durum satırı. */
  status?: string | null;
  /** spoken=true → metin mikrofondan geldi (hoca bunu bilmeli). */
  onSend: (text: string, spoken?: boolean) => void;
  placeholder?: string;
  /** Üstaz'ın ekrana_git önerisi — zorlamaz, tıklanabilir bir kart olarak çıkar. */
  suggestion?: NavigationSuggestion | null;
  onSuggestionPress?: () => void;
  voice?: ChatVoice;
  /** Yazı boyutu çarpanı (TEXT_SCALES içinden). */
  textScale?: number;
}

type Item = ChatMessage & { live?: boolean };

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
}: Props) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c, textScale), [c, textScale]);
  const insets = useInsets();
  const voiceOn = !!voice?.on;

  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<Item>>(null);
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

  const send = () => {
    const text = draft.trim();
    if (!text || sending) return;
    const spoken = spokenDraft.current !== null && spokenDraft.current.trim() === text;
    spokenDraft.current = null;
    setDraft("");
    onSend(text, spoken);
  };

  const data: Item[] = [
    ...messages.filter((m) => !(m.role === "user" && isEventMessage(m.content))),
    ...(live ? [{ role: "assistant" as const, content: live, live: true }] : []),
  ];
  const lastTeacher = [...messages].reverse().find((m) => m.role === "assistant");

  const speak = (text: string) => (voice ? voice.speakMessage(text) : speakTarget(text));

  const renderItem = ({ item, index }: { item: Item; index: number }) => {
    if (item.role === "user") {
      const spoken = isSpoken(item.content);
      const text = stripSpokenMark(item.content);
      const rtl = isRtl(pack.script) && containsTargetScript(text, pack.script);
      return (
        <View style={styles.userRow}>
          <View style={styles.userBubble}>
            <RichText
              content={text}
              style={rtl ? StyleSheet.flatten([styles.userText, styles.rtl]) : styles.userText}
              scaleScript={isRtl(pack.script)}
            />
            {spoken && (
              <View style={styles.spokenTag}>
                <Icon name="mic" size={11} color="rgba(255,255,255,0.75)" strokeWidth={2.4} />
                <Txt variant="caption" color="rgba(255,255,255,0.75)" style={{ fontSize: 11 }}>
                  söylendi
                </Txt>
              </View>
            )}
          </View>
        </View>
      );
    }
    const prev = data[index - 1];
    const showName = !prev || prev.role !== "assistant";
    return (
      <View style={styles.teacherBlock}>
        {showName && (
          <View style={styles.teacherName}>
            <TeacherAvatar size={26} ring={false} />
            <Txt variant="caption" color={c.inkSoft} style={{ fontWeight: "800" }}>
              {pack.teacherName}
            </Txt>
          </View>
        )}
        <View style={styles.teacherCard}>
          <RichText content={item.content} style={styles.teacherText} scaleScript={isRtl(pack.script)} />
          {item.live ? (
            <View style={{ marginTop: 6 }}>
              <Wave active color={c.accent} bars={4} height={10} />
            </View>
          ) : containsTargetScript(item.content, pack.script) || pack.script === "latin" ? (
            <View style={styles.cardActions}>
              <PressableScale onPress={() => speak(item.content)} accessibilityLabel="Dinle" style={styles.listenChip}>
                <Icon name="volume" size={14} color={c.accentDark} strokeWidth={2.2} />
                <Txt variant="caption" color={c.accentDark} style={{ fontWeight: "800" }}>
                  Dinle
                </Txt>
              </PressableScale>
            </View>
          ) : null}
        </View>
        {item.actions && item.actions.length > 0 && (
          <View style={styles.actionsWrap}>
            {item.actions.map((action, i) => (
              <View key={i} style={styles.actionChip}>
                <Icon name="sparkles" size={11} color={c.gold} />
                <Txt variant="caption" color={c.gold} style={{ fontSize: 11.5, fontWeight: "700" }}>
                  {action}
                </Txt>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  // Alt panelin durum satırı
  const listening = dictation.listening;
  const thinking = sending && !voice?.speaking;
  const dockLine = voice?.speaking
    ? voice.nowSaying || `${pack.teacherName} konuşuyor…`
    : listening
      ? dictation.partial || "Dinliyorum… konuş, susunca kendi gider"
      : thinking
        ? `${pack.teacherName} ${status ?? "düşünüyor…"}`
        : "Sıra sende — dokun ve konuş";
  const dockRtl = isRtl(pack.script) && containsTargetScript(dockLine, pack.script);

  return (
    // behavior Android'de de "padding" olmalı: uygulama edge-to-edge modunda
    // çalışıyor ve o modda Android pencereyi klavye için küçültmüyor.
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />

      {!voiceOn && sending && (status || !live) && (
        <View style={styles.typing}>
          <ActivityIndicator size="small" color={c.accent} />
          <Txt variant="caption" color={c.inkSoft}>
            {pack.teacherName} {status ?? "yazıyor…"}
          </Txt>
        </View>
      )}
      {suggestion && !sending && (
        <PressableScale style={styles.suggestion} onPress={onSuggestionPress} accessibilityLabel={suggestion.label}>
          <Icon name="sparkles" size={18} color={c.goldDeep} />
          <Txt variant="bodyStrong" color={c.onDeep} style={{ flex: 1 }}>
            {suggestion.label}
          </Txt>
          <Icon name="arrowRight" size={18} color={c.goldDeep} />
        </PressableScale>
      )}
      {dictation.error && (
        <View style={styles.micError}>
          <Txt variant="caption" color={c.danger}>
            {dictation.error}
          </Txt>
        </View>
      )}

      {voiceOn ? (
        <View style={[styles.dock, { paddingBottom: 18 + insets.bottom }]}>
          <StarPattern width="100%" height="100%" color={c.goldDeep} opacity={0.06} />
          <View style={styles.dockLine}>
            <Wave active={!!voice?.speaking || listening} color={listening ? c.goldDeep : "#7FC8B6"} />
            <Txt variant="callout" color={c.onDeep} numberOfLines={2} style={[{ flex: 1 }, dockRtl && styles.rtl]}>
              {dockLine}
            </Txt>
          </View>
          <View style={styles.dockControls}>
            <IconButton icon="keyboard" label="Yazarak cevap ver" variant="onDeep" size={50} onPress={voice?.onToggle} />
            <PressableScale
              onPress={tapMic}
              disabled={thinking && !listening}
              accessibilityLabel={listening ? "Bitir" : "Konuş"}
              style={[styles.bigMic, listening && styles.bigMicOn]}
            >
              <Icon name={listening ? "stop" : "mic"} size={32} color={listening ? "#FFFFFF" : c.onGold} />
            </PressableScale>
            {voice?.speaking ? (
              <IconButton icon="stop" label="Sustur" variant="onDeep" size={50} onPress={voice.onStop} />
            ) : (
              <IconButton
                icon="replay"
                label="Son mesajı dinle"
                variant="onDeep"
                size={50}
                disabled={!lastTeacher || sending}
                onPress={() => lastTeacher && speak(lastTeacher.content)}
              />
            )}
          </View>
        </View>
      ) : (
        <View style={[styles.inputRow, { paddingBottom: 12 + insets.bottom }]}>
          {voice?.available ? (
            <IconButton icon="mic" label="Sesli derse geç" variant="soft" size={46} onPress={voice.onToggle} />
          ) : (
            <IconButton
              icon="mic"
              label="Basılı tutarak konuş"
              variant={dictation.listening ? "deep" : "soft"}
              size={46}
              // Yazılı düzende basılı tut - konuş - bırak: bitişe öğrenci karar verir.
              onPressIn={() => dictation.start()}
              onPressOut={() => dictation.stop()}
              disabled={sending}
            />
          )}
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
            placeholderTextColor={c.inkFaint}
            multiline
          />
          <IconButton
            icon="arrowRight"
            label="Gönder"
            variant="deep"
            size={46}
            onPress={send}
            disabled={!draft.trim() || sending}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * Stiller paletin FONKSİYONU: karanlık modda renkler değişir ama yapı
 * (ölçü, yerleşim, yazı tipi) aynı kalır.
 */
function makeStyles(c: Palette, k = 1) {
  const fs = (n: number) => Math.round(n * k * 10) / 10;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
    teacherBlock: { marginBottom: 14 },
    teacherName: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7, marginLeft: 2 },
    teacherCard: {
      backgroundColor: c.card,
      borderRadius: radius.xl,
      borderTopLeftRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: c.border,
      ...shadow,
    },
    teacherText: { color: c.ink, fontFamily: "Manrope", fontWeight: "500", fontSize: fs(15.5), lineHeight: fs(24) },
    cardActions: { flexDirection: "row", marginTop: 10 },
    listenChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 30,
      paddingHorizontal: 11,
      borderRadius: 15,
      backgroundColor: c.accentSoft,
    },
    userRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 14 },
    userBubble: {
      maxWidth: "82%",
      backgroundColor: c.userBubble,
      borderRadius: 20,
      borderBottomRightRadius: 6,
      paddingHorizontal: 15,
      paddingVertical: 10,
    },
    userText: { color: "#FFFFFF", fontFamily: "Manrope", fontWeight: "600", fontSize: fs(15.5), lineHeight: fs(23) },
    spokenTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
    rtl: { writingDirection: "rtl", textAlign: "right" },
    actionsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, marginLeft: 4 },
    actionChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: c.goldSoft,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    typing: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
    suggestion: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 14,
      marginBottom: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 18,
      backgroundColor: c.deep,
      gap: 10,
    },
    micError: { backgroundColor: c.dangerSoft, paddingHorizontal: 16, paddingVertical: 9 },
    dock: {
      backgroundColor: c.deep,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 16,
      paddingHorizontal: 20,
      gap: 14,
      overflow: "hidden",
    },
    dockLine: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 40 },
    dockControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    bigMic: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: c.goldDeep,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 8,
      borderColor: "rgba(217,192,143,0.18)",
    },
    bigMicOn: { backgroundColor: c.danger, borderColor: "rgba(226,121,90,0.25)" },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 12,
      paddingTop: 10,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.card,
    },
    input: {
      flex: 1,
      minHeight: 46,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 23,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      fontFamily: "Manrope",
      fontSize: fs(15.5),
      color: c.ink,
      backgroundColor: c.bg,
    },
  });
}
