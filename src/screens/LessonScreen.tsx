import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { AgentContext } from "../agent";
import ChatView from "../components/ChatView";
import { Badge, IconButton, PressableScale, TeacherAvatar, Txt } from "../components/kit";
import LessonSummaryView from "./LessonSummaryView";
import type { ChatVoice } from "../components/ChatView";
import Header from "../components/Header";
import { agenticChat } from "../claude";
import { isBudgetError } from "../budget";
import {
  analyzeLesson,
  averageQuality,
  lessonQualityDigest,
  pruneQuality,
} from "../lessonquality";
import { getActivePack } from "../languages";
import { createSpeechQueue, speakTarget } from "../speech";
import type { SpeechQueue } from "../speech";
import { takeSentences } from "../conversation";
import { backendFor, createNeuralSpeechQueue } from "../neuralVoice";
import { keyFor } from "../providers";
import { cleanForSpeech, normalizeVoice } from "../voice";
import { markSpoken } from "../speechinput";
import { fluencyTrend } from "../fluency";
import { progressDigest, readingPerformance } from "../progress";
import { COMPLIANCE_WARN } from "../reading";
import { loadStatsSummary, recordStat, recordStats } from "../statsStore";
import {
  freeChatSystem,
  idleNudgeEvent,
  KICKOFF_FREECHAT,
  KICKOFF_LESSON,
  KICKOFF_QUIZ,
  lessonSystem,
  memoryContext,
  negotiationContext,
  quizSystem,
  retentionDigest,
} from "../prompts";
import { detectRepair } from "../negotiation";
import {
  addRepairSeen,
  loadChat,
  loadFluency,
  loadMistakes,
  loadRepairSeen,
  loadLessonQuality,
  loadNotes,
  loadReadings,
  loadVocab,
  DEFAULT_CHAT_PREFS,
  loadChatPrefs,
  saveChat,
  saveChatPrefs,
  TEXT_SCALES,
  saveLessonQuality,
  touchLastActivity,
} from "../storage";
import { colors } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
import { ChatMessage, CurriculumModule, NavigationSuggestion, Profile } from "../types";
import { containsTargetScript, extractScript } from "../scripts";

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
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  /** Akış halindeki hoca cevabı (henüz kaydedilmedi) — ChatView canlı balon çizer. */
  const [live, setLive] = useState<string | null>(null);
  /** "düşünüyor… / defterine bakıyor…" durum satırı. */
  const [status, setStatus] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<NavigationSuggestion | null>(null);
  const started = useRef(false);
  /** Turlar arası en güncel profil — React state'inin gecikmesine takılmamak için. */
  const profileRef = useRef(profile);
  /** Sessizlik dürtmesi: oturum başına bir kez, öğrenci yazınca iptal. */
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeUsed = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  /** Akış tamponu: her delta'da setState yapmamak için ~80ms'de bir boşaltılır. */
  const liveBuf = useRef("");
  const liveFlush = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ------------------------------------------------------------ sesli ders
  const [prefs, setPrefs] = useState(DEFAULT_CHAT_PREFS);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  useEffect(() => {
    void loadChatPrefs().then(setPrefs);
  }, []);
  const updatePrefs = (next: Partial<typeof prefs>) => {
    const merged = { ...prefsRef.current, ...next };
    setPrefs(merged);
    void saveChatPrefs(merged);
  };
  const voiceSettings = normalizeVoice(profile.voice);
  const backend = useMemo(
    () => backendFor(voiceSettings, { openai: keyFor(profile, "openai"), gemini: keyFor(profile, "gemini") }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voiceSettings.provider, voiceSettings.voiceId, profile.apiKeys]
  );
  /**
   * Telefon sesi yalnız ayrı alfabeli dillerde işe yarar: orada Türkçe
   * açıklama atlanıp yalnız hedef dil okunur. Latin dillerde telefon sesi
   * Türkçe açıklamayı İngilizce aksanla okur — sesli ders ancak ses
   * modeliyle (iki dili de doğal okuyan) açılır.
   */
  const voiceAvailable = backend !== null || getActivePack().script !== "latin";
  const voiceOn = prefs.voice && voiceAvailable;
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const [speaking, setSpeaking] = useState(false);
  const [nowSaying, setNowSaying] = useState("");
  const [listenSignal, setListenSignal] = useState(0);
  const queue = useRef<SpeechQueue | null>(null);
  const speechBuf = useRef("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      queue.current?.cancel();
    };
  }, []);

  const stopSpeaking = () => {
    queue.current?.cancel();
    queue.current = null;
    speechBuf.current = "";
    setSpeaking(false);
    setNowSaying("");
  };

  /** Yeni konuşma kuyruğu; autoListen → hoca susunca mikrofon açılır. */
  const newQueue = (autoListen: boolean): SpeechQueue => {
    stopSpeaking();
    const onSentence = (s: string) => {
      if (!alive.current) return;
      setSpeaking(true);
      setNowSaying(s);
    };
    const onIdle = () => {
      if (!alive.current) return;
      setSpeaking(false);
      setNowSaying("");
      if (autoListen && voiceOnRef.current) setListenSignal((n) => n + 1);
    };
    const q = backend
      ? createNeuralSpeechQueue({ backend, onSentence, onIdle })
      : createSpeechQueue({ onSentence, onIdle });
    queue.current = q;
    return q;
  };

  const pushSpeech = (q: SpeechQueue, text: string) => {
    const clean = cleanForSpeech(text);
    // Telefon sesi yalnız hedef dili okur: Türkçe cümle Arapça sesle
    // okunursa anlaşılmaz bir gürültü olur, o cümle atlanır.
    const spoken = backend ? clean : extractScript(clean, getActivePack().script);
    if (spoken.trim()) q.push(spoken);
  };

  /** Akıştan tamamlanan cümleleri kuyruğa at. */
  const feedSpeech = (q: SpeechQueue, delta: string) => {
    speechBuf.current += delta;
    const { sentences, rest } = takeSentences(speechBuf.current);
    speechBuf.current = rest;
    for (const s of sentences) pushSpeech(q, s);
  };

  /** 🔊 Dinle: tek mesajı baştan oku (mikrofon açılmaz). */
  const speakMessage = (text: string) => {
    if (!voiceAvailable) {
      speakTarget(text);
      return;
    }
    const q = newQueue(false);
    const { sentences, rest } = takeSentences(text);
    for (const s of sentences) pushSpeech(q, s);
    if (rest.trim()) pushSpeech(q, rest);
    q.finish();
  };

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
    // ÖLÇÜLEN veri de buraya girer. Eskiden yalnız bir ARAÇ olarak vardı
    // (ilerleme_durumu) ve model onu çağırmadıkça hoca öğrencinin konuşup
    // konuşmadığını GÖREMİYORDU — uygulamanın asıl hedefine kör kalıyordu.
    const [mistakes, notes, vocab, stats, readings, fluency, seen, quality] =
      await Promise.all([
        loadMistakes(),
        loadNotes(),
        loadVocab(),
        loadStatsSummary(),
        loadReadings(),
        loadFluency(),
        loadRepairSeen(),
        loadLessonQuality(),
      ]);
    const stable = quiz
      ? quizSystem(current)
      : module
        ? lessonSystem(current, module)
        : freeChatSystem(current);
    return {
      stable,
      dynamic:
        memoryContext(mistakes, notes, module?.track) +
        retentionDigest(vocab) +
        progressDigest(stats, readingPerformance(readings, COMPLIANCE_WARN), fluencyTrend(fluency)) +
        negotiationContext(current.assessment?.speakingLevel ?? "A0", seen) +
        // Hocanın KENDİ dersinin ölçümü. Öğrencinin durumu zaten besleniyordu;
        // hoca kendi öğretme biçimini göremiyordu — ölçülen ama söylenmeyen
        // her şey gibi, hiç ölçülmemiş sayılırdı.
        lessonQualityDigest(averageQuality(quality), current.assessment?.speakingLevel ?? "A0"),
    };
  };

  /**
   * Bu sohbetin kalite ölçümünü kaydeder.
   *
   * Ders başına TEK kayıt tutulur: her turda bir satır eklense on beş turluk
   * bir ders, on beş kısa dersmiş gibi ortalamaya girer ve eğilim anlamını
   * yitirirdi. Bu yüzden aynı sohbetin kaydı yerinde güncellenir.
   *
   * Sınav ve serbest sohbet DIŞARIDA: ölçülmek istenen şey ders anlatımı.
   * Sınavda hocanın tek kelimelik sorular sorması ve öğrencinin kısa cevaplar
   * vermesi doğru davranıştır; onu "hoca soru sormuyor / öğrenci üretmiyor"
   * diye kusur saymak ölçümü çöpe çevirirdi.
   */
  const recordLessonQuality = async (history: ChatMessage[]) => {
    if (quiz || !module) return;
    try {
      const vocab = await loadVocab();
      const q = analyzeLesson(
        history,
        pack.script,
        vocab.map((c) => c.arabic)
      );
      const list = await loadLessonQuality();
      const mine = list.filter((x) => x.chatId !== chatId);
      await saveLessonQuality(pruneQuality([...mine, { ...q, chatId }]));
    } catch {
      // Ölçüm dersin kritik yolunda değil: hata yutulur, ders akmaya devam eder.
    }
  };

  /** Tampondaki akışı ekrana bas (en geç 80 ms'de bir). */
  const scheduleFlush = () => {
    if (liveFlush.current) return;
    liveFlush.current = setTimeout(() => {
      liveFlush.current = null;
      setLive(liveBuf.current);
    }, 80);
  };

  /** Araç adları öğrenciye "hoca ne yapıyor" diliyle gösterilir. */
  const toolLabel = (name: string): string =>
    ({
      kelime_ara: "defterine bakıyor…",
      tekrar_durumu: "tekrar defterine bakıyor…",
      hafiza_oku: "hafızasını yokluyor…",
      mufredat_oku: "müfredata bakıyor…",
      kelime_kaydet: "kelimeyi deftere yazıyor…",
      kelime_puanla: "cevabını puanlıyor…",
      kelime_duzelt: "defteri düzeltiyor…",
      kelime_sil: "defteri düzeltiyor…",
      hata_kaydet: "hatayı not ediyor…",
      hata_cozuldu: "hatanı kapatıyor…",
      not_yaz: "kendine not alıyor…",
      not_sil: "notlarını düzenliyor…",
      seviye_guncelle: "seviyeni güncelliyor…",
      modul_ekle: "müfredata ekliyor…",
      modul_tamamla: "modülü kapatıyor…",
      ekrana_git: "sana öneri hazırlıyor…",
      hatirlatici_kur: "hatırlatıcı kuruyor…",
    })[name] ?? "bir araç kullanıyor…";

  const runTurn = async (history: ChatMessage[]) => {
    clearIdleTimer();
    setSending(true);
    setSuggestion(null);
    setStatus(null);
    liveBuf.current = "";
    setLive(null);
    void touchLastActivity();
    // Sesli ders: yeni tur eski konuşmayı keser, cevap geldikçe seslenir.
    const q = voiceOnRef.current ? newQueue(true) : null;
    if (!q) stopSpeaking();
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
        hooks: {
          onThinking: () => {
            if (!liveBuf.current) setStatus("düşünüyor…");
          },
          onText: (delta) => {
            setStatus(null);
            liveBuf.current += delta;
            scheduleFlush();
            if (q) feedSpeech(q, delta);
          },
          onTool: (name) => setStatus(toolLabel(name)),
          onRound: (round) => {
            // Araç turundan dönen yeni metin, öncekinin dibine yapışmasın.
            if (round > 0 && liveBuf.current && !liveBuf.current.endsWith("\n\n")) {
              liveBuf.current += "\n\n";
            }
            // Araç turundan önceki yarım cümle beklemesin.
            if (q && round > 0 && speechBuf.current.trim()) {
              pushSpeech(q, speechBuf.current);
              speechBuf.current = "";
            }
          },
        },
      });
      if (q) {
        // Akış hiç gelmediyse (sağlayıcı akış desteklemiyor) cevabın tamamı.
        const streamed = liveBuf.current.trim().length > 0;
        if (streamed) {
          if (speechBuf.current.trim()) pushSpeech(q, speechBuf.current);
        } else {
          const { sentences, rest } = takeSentences(reply.text);
          for (const s of sentences) pushSpeech(q, s);
          if (rest.trim()) pushSpeech(q, rest);
        }
        speechBuf.current = "";
        q.finish();
      }
      const updated: ChatMessage[] = [
        ...history,
        { role: "assistant", content: reply.text, actions: reply.actions },
      ];
      setMessages(updated);
      await saveChat(chatId, updated);
      void recordLessonQuality(updated);
      if (ctx.pendingNavigation) setSuggestion(ctx.pendingNavigation);
      armIdleTimer();
    } catch (e) {
      // Harcama tavanı bir ARIZA değil, uygulamanın bilerek verdiği karar.
      // "Bağlantı hatası" demek kullanıcıyı olmayan bir sorunu aramaya iter.
      Alert.alert(
        isBudgetError(e) ? "Harcama tavanı doldu" : "Bağlantı hatası",
        e instanceof Error ? e.message : String(e)
      );
      if (q) stopSpeaking();
      setMessages(history);
    } finally {
      // Araçlar profili zaten diske yazdı; burada UI durumunu senkronlıyoruz.
      // finally içinde olması, tur hata alsa bile seviye/modül değişikliğinin
      // ekrana yansımasını garanti eder.
      if (ctx.profileChanged) {
        profileRef.current = ctx.profile;
        onProfileChange(ctx.profile);
      }
      if (liveFlush.current) {
        clearTimeout(liveFlush.current);
        liveFlush.current = null;
      }
      liveBuf.current = "";
      setLive(null);
      setStatus(null);
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

  const onSend = (text: string, spoken?: boolean) => {
    clearIdleTimer();
    nudgeUsed.current = false; // öğrenci yazdı → dürtme hakkı yenilenir
    // Hedef dilde yazılmış mesaj üretimdir. Yalnız ayrı alfabeli dillerde
    // güvenle tespit edilebiliyor (Latin dillerde Türkçe/hedef ayrımı yok —
    // dürüst metrik için sayılmaz; oradaki üretim sınav/okuma/gölgelemeden gelir).
    const pack = getActivePack();
    const inTarget = containsTargetScript(text, pack.script);
    if (inTarget) void recordStat("produced");

    // ONARIM HAMLESİ: "anlamadım", "tekrar eder misin" gibi kalıplar sayılır.
    // Ölçülmeyen davranış öğretilemez — hoca öğrencinin bu refleksi hiç
    // kullanmadığını ancak böyle görebiliyor (bkz. src/negotiation.ts).
    const moves = detectRepair(text, pack.negotiation, pack.script);
    if (moves.length > 0) {
      void recordStat("repairUsed");
      void addRepairSeen(moves); // bir sonraki turun promptu güncel listeyi okur
    }
    if (spoken) {
      // Mikrofonla söylendi: ses tanıma öğrenciyi hedef dilde duyduysa bu
      // gerçek bir konuşma denemesidir — konuşma ölçümü buradan doğar.
      void recordStats(inTarget ? ["spoken", "spokenCorrect"] : ["spoken"]);
    }
    // Hoca yazıyla söyleneni ayırt edebilmeli: ses tanıma gürültülüdür,
    // kelime kelime yazım düzeltmesi yapılmamalı.
    const content = spoken ? markSpoken(text) : text;
    const history: ChatMessage[] = [...messagesRef.current, { role: "user", content }];
    messagesRef.current = history;
    setMessages(history);
    void saveChat(chatId, history);
    void runTurn(history);
  };

  /** Ders sonu özeti açık mı (modül dersleri). */
  const [summary, setSummary] = useState(false);
  /** Oturum başlangıcı — özet bu andan sonraki kayıtları sayar. */
  const sessionStart = useRef(new Date().toISOString()).current;

  const complete = () => {
    if (!module) return;
    stopSpeaking();
    setSummary(true);
  };

  const cycleTextScale = () => {
    const i = TEXT_SCALES.indexOf(prefs.textScale);
    updatePrefs({ textScale: TEXT_SCALES[(i + 1) % TEXT_SCALES.length] });
  };

  const pack = getActivePack();

  const chatVoice: ChatVoice = {
    on: voiceOn,
    available: voiceAvailable,
    onToggle: () => {
      if (voiceOn) stopSpeaking();
      updatePrefs({ voice: !prefs.voice });
    },
    speaking,
    nowSaying,
    onStop: stopSpeaking,
    listenSignal,
    stt: voiceSettings.transcribe ? backend : null,
    speakMessage,
  };

  if (summary && module) {
    return (
      <LessonSummaryView
        module={module}
        messages={messages}
        since={sessionStart}
        onFinish={() => onCompleteModule(module.id)}
        onContinue={() => setSummary(false)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Header
        leading={<TeacherAvatar size={40} speaking={speaking} />}
        title={quiz ? `${pack.teacherName} ile Tekrar` : module ? module.title : "Serbest Sohbet"}
        subtitle={
          speaking
            ? `${pack.teacherName} konuşuyor`
            : quiz
              ? "Sözlü kelime sınavı — takvimi hocan kurar"
              : module
                ? `${pack.tracks[module.track].short} · ${module.level}`
                : `${pack.teacherName} ile ${pack.tracks.konusma.short.toLowerCase()} pratiği`
        }
        onBack={onBack}
        right={
          <>
            <PressableScale onPress={cycleTextScale} accessibilityLabel="Yazı boyutu" style={styles.sizeBtn}>
              <Txt variant="headline" style={{ fontSize: 14 }}>
                Aa
              </Txt>
            </PressableScale>
            {module && !isDone ? (
              <IconButton icon="check" label="Dersi Tamamla" variant="gold" size={40} onPress={complete} />
            ) : isDone ? (
              <Badge text="Bitti" tone="accent" />
            ) : null}
          </>
        }
      />
      <ChatView
        messages={messages}
        sending={sending}
        live={live}
        status={status}
        onSend={onSend}
        placeholder={module || quiz ? "Cevabını yaz…" : pack.chatPlaceholderFree}
        suggestion={suggestion}
        onSuggestionPress={() => {
          if (suggestion) onNavigate(suggestion);
        }}
        voice={chatVoice}
        textScale={prefs.textScale}
      />
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    sizeBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
