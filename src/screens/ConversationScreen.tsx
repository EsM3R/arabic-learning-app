import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AgentContext } from "../agent";
import Header from "../components/Header";
import { agenticChat, generateDebrief } from "../claude";
import { isBudgetError } from "../budget";
import {
  scenariosFor,
  takeSentences,
} from "../conversation";
import type { Debrief, Scenario } from "../conversation";
import { getActivePack } from "../languages";
import { findOpenSameTopic } from "../mistakes";
import { conversationSystem, KICKOFF_CONVERSATION, kickoffScene } from "../prompts";
import { isRtl, containsTargetScript } from "../scripts";
import { createSpeechQueue } from "../speech";
import type { SpeechQueue } from "../speech";
import { createNeuralSpeechQueue } from "../openaiVoice";
import { keyFor } from "../providers";
import { useRecorderDictation } from "../useRecorderDictation";
import { neuralTranscribeActive, neuralVoiceActive, normalizeVoice } from "../voice";
import { markSpoken } from "../speechinput";
import { newCard } from "../srs";
import { recordStats } from "../statsStore";
import {
  loadMistakes,
  loadVocab,
  saveMistakes,
  saveVocab,
  touchLastActivity,
} from "../storage";
import { radius, shadow, shadowLift } from "../theme";
import type { Palette } from "../theme";
import { useDictation } from "../useDictation";
import { useTheme } from "../useTheme";
import { ChatMessage, Profile } from "../types";
import { normalizeTarget } from "../textnorm";

interface Props {
  profile: Profile;
  onBack: () => void;
}

/**
 * Konuşma odasının durumları. Ekranda balon yok; ortadaki "varlık" bu
 * durumu nefes alarak gösterir. Metin, isteyen için altta ve kapalı başlar.
 */
type Phase =
  | "pick" // sahne seçimi
  | "think" // model cevap üretiyor, henüz ses yok
  | "teacher" // hoca konuşuyor (akış hâlinde cümle cümle)
  | "listen" // mikrofon açık, sıra öğrencide
  | "wait" // eller serbest kapalı: öğrenci mikrofona basacak
  | "debrief"; // konuşma bitti, değerlendirme

/** Öğrenci sustuktan sonra bu kadar ms yeni parça gelmezse sıra geçer. */
const SILENCE_MS = 2200;

/**
 * KONUŞMA ODASI — ses-önce.
 *
 * Ders ekranı bir mesajlaşma bileşeniydi: kutu, gönder oku, balonlar.
 * Mikrofon o kutunun yanına eklenmiş bir düğmeydi. Bu ekranın kuralı ters:
 * varsayılan yol SES, metin yalnız isteyene. Hoca cevabı akış hâlinde cümle
 * cümle seslenir (ilk cümle gelir gelmez), susunca mikrofon kendi açılır,
 * öğrenci susunca kendi kapanır ve sıra geçer. Elle düğme yok.
 *
 * Sahnede hoca karakterdedir ve DÜZELTMEZ; düzeltme sahne bitince tek parça
 * gelir. Konuşma sırasında düzeltilen öğrenci konuşmayı bırakıp dinlemeye
 * geçer — o yüzden düzeltme sona bırakılmış bir tasarım kararıdır, eksik
 * değil.
 */
export default function ConversationScreen({ profile, onBack }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pack = getActivePack();
  const level = profile.assessment?.speakingLevel ?? "A1";
  /**
   * Ses modeli: tercih "openai" VE anahtar varsa hoca ChatGPT'nin sesiyle
   * konuşur, öğrencinin sesi de (istenirse) aynı modelle çözülür. Yoksa
   * telefonun TTS'i ve tanıması — robot ama çalışır.
   */
  const voice = normalizeVoice(profile.voice);
  const openaiKey = keyFor(profile, "openai");
  const neural = neuralVoiceActive(voice, openaiKey);
  const neuralStt = neuralTranscribeActive(voice, openaiKey);
  /**
   * Odanın beyni: tercih DeepSeek ve anahtarı varsa oda o sağlayıcıyla
   * konuşur, ders ekranları aktif sağlayıcıda kalır. Konuşmada araç yok ve
   * cevaplar kısa; ucuz modelin en iyi olduğu iş tam da bu.
   */
  const deepseekKey = keyFor(profile, "deepseek");
  const useDeepseek = voice.brain === "deepseek" && !!deepseekKey.trim();
  const brainProfile: Profile = useDeepseek ? { ...profile, provider: "deepseek" } : profile;
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("pick");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [turns, setTurns] = useState<ChatMessage[]>([]);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [handsFree, setHandsFree] = useState(true);
  /** Hocanın şu an söylediği cümle (varlığın altında akar). */
  const [nowSaying, setNowSaying] = useState("");
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [debriefError, setDebriefError] = useState<string | null>(null);
  const [savedPhrases, setSavedPhrases] = useState(false);
  const [studentTurns, setStudentTurns] = useState(0);

  const turnsRef = useRef<ChatMessage[]>([]);
  const queue = useRef<SpeechQueue | null>(null);
  const buffer = useRef("");
  const startedAt = useRef(0);
  const handsFreeRef = useRef(true);
  const alive = useRef(true);
  const profileRef = useRef(brainProfile);
  /** Sahne, state'ten önce ref'te: ilk tur state oturmadan koşar. */
  const scenarioRef = useRef<Scenario | null>(null);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    profileRef.current = brainProfile;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, useDeepseek]);

  // Varlığın nefesi: dinlerken hızlı, konuşurken orta, düşünürken yavaş.
  const breath = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const ms = phase === "listen" ? 700 : phase === "teacher" ? 1100 : 1800;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1.12,
          duration: ms,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 1,
          duration: ms,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, breath]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      queue.current?.cancel();
    };
  }, []);

  // ------------------------------------------------------------------ mikrofon
  // İki kanca da her çizimde çağrılır (hooks kuralı); yalnız biri kullanılır.
  const phoneDictation = useDictation({
    autoStopMs: handsFree ? SILENCE_MS : undefined,
    onResult: (said) => {
      void onStudentSaid(said);
    },
  });
  const recorderDictation = useRecorderDictation({
    apiKey: openaiKey,
    enabled: neuralStt,
    silenceMs: SILENCE_MS,
    onResult: (said) => {
      void onStudentSaid(said);
    },
  });
  const dictation = neuralStt ? recorderDictation : phoneDictation;

  const startListening = () => {
    if (!alive.current) return;
    setPhase("listen");
    dictation.start();
  };

  /** Hoca sustu: eller serbestse mikrofon kendi açılır, değilse öğrenci basar. */
  const onTeacherDone = () => {
    if (!alive.current) return;
    if (handsFreeRef.current) startListening();
    else setPhase("wait");
  };

  // ------------------------------------------------------------------ tur
  const runTurn = async (history: ChatMessage[]) => {
    setPhase("think");
    setNowSaying("");
    buffer.current = "";
    queue.current?.cancel();
    const q = neural
      ? createNeuralSpeechQueue({
          apiKey: openaiKey,
          voiceId: voice.voiceId,
          onSentence: (s) => setNowSaying(s),
          onIdle: onTeacherDone,
          // Sentez düşerse cümle telefon sesiyle okunur; kullanıcı bunu
          // "robot ses" olarak duyar — neden olduğunu da görsün.
          onFallback: (reason) => setVoiceNote(`Ses modeli cevap vermedi, telefon sesi kullanıldı: ${reason}`),
        })
      : createSpeechQueue({
          onSentence: (s) => setNowSaying(s),
          onIdle: onTeacherDone,
        });
    queue.current = q;

    const ctx: AgentContext = { profile: profileRef.current, profileChanged: false };
    // Akıştan en az bir cümle çıktı mı — state değil yerel bayrak: closure'daki
    // phase eski kalır ve kısa cevaplarda hoca aynı şeyi iki kez okurdu.
    let streamedAny = false;
    try {
      const reply = await agenticChat(
        conversationSystem(profileRef.current, scenarioRef.current),
        history,
        ctx,
        {
          // Konuşma odasında araçlar kapalı: hoca defter karıştırmasın, konuşsun.
          // Araç turu, sesin ortasında birkaç saniyelik bir boşluk demek.
          tools: [],
          maxRounds: 1,
          effort: "low",
          hooks: {
            onText: (delta) => {
              buffer.current += delta;
              const { sentences, rest } = takeSentences(buffer.current);
              buffer.current = rest;
              if (sentences.length > 0) {
                streamedAny = true;
                setPhase("teacher");
                for (const s of sentences) q.push(s);
              }
            },
          },
        }
      );
      // Akış hiç gelmediyse (sağlayıcı akış desteklemiyor) tamamı bir kerede:
      // tampon boş ve kuyruk boşsa cevabın kendisini cümlelere böl.
      const tail = buffer.current.trim();
      if (tail) {
        streamedAny = true;
        setPhase("teacher");
        q.push(tail);
      }
      if (!streamedAny && reply.text.trim()) {
        setPhase("teacher");
        const { sentences, rest } = takeSentences(reply.text);
        for (const s of sentences) q.push(s);
        if (rest.trim()) q.push(rest);
      }
      buffer.current = "";
      q.finish();
      const next: ChatMessage[] = [...history, { role: "assistant", content: reply.text }];
      setTurns(next);
      turnsRef.current = next;
    } catch (e) {
      q.cancel();
      Alert.alert(
        isBudgetError(e) ? "Harcama tavanı doldu" : "Bağlantı hatası",
        e instanceof Error ? e.message : String(e)
      );
      setPhase("wait");
    }
  };

  const onStudentSaid = async (said: string) => {
    if (!alive.current) return;
    const text = said.trim();
    if (!text) {
      // Hiçbir şey duyulmadı: sıra yine öğrencide, ama boş odada mikrofon
      // açılıp kapanıp durmasın — elle devam etsin.
      setPhase("wait");
      return;
    }
    setStudentTurns((n) => n + 1);
    const inTarget = pack.script === "latin" ? true : containsTargetScript(text, pack.script);
    void recordStats(inTarget ? ["spoken", "conversationTurn", "produced"] : ["spoken", "conversationTurn"]);
    void touchLastActivity();
    const history: ChatMessage[] = [
      ...turnsRef.current,
      { role: "user", content: markSpoken(text) },
    ];
    setTurns(history);
    turnsRef.current = history;
    await runTurn(history);
  };

  // ------------------------------------------------------------------ başlat / bitir
  const start = (s: Scenario | null) => {
    setScenario(s);
    setDebrief(null);
    setDebriefError(null);
    setSavedPhrases(false);
    setStudentTurns(0);
    startedAt.current = Date.now();
    const kickoff: ChatMessage[] = [
      { role: "user", content: s ? kickoffScene(s) : KICKOFF_CONVERSATION },
    ];
    setTurns(kickoff);
    turnsRef.current = kickoff;
    // scenario state'i bu turda henüz güncel değil: runTurn'e sahneyi kapatma
    // yerine promptu doğrudan kuruyoruz.
    void runTurnWith(kickoff, s);
  };

  /** start() için: state henüz oturmadan sahneyle tur koşar. */
  const runTurnWith = async (history: ChatMessage[], s: Scenario | null) => {
    scenarioRef.current = s;
    await runTurn(history);
  };

  const finish = async () => {
    dictation.stop();
    queue.current?.cancel();
    const spoken = turnsRef.current.filter((t) => t.role === "user" && !t.content.startsWith("[Uygulama")).length;
    if (spoken === 0) {
      // Hiç konuşulmadıysa değerlendirecek bir şey yok; para da harcanmasın.
      setPhase("pick");
      return;
    }
    setPhase("debrief");
    setDebriefError(null);
    try {
      const d = await generateDebrief(profileRef.current, scenarioRef.current, turnsRef.current);
      if (!alive.current) return;
      setDebrief(d);
      await writeCorrections(d);
    } catch (e) {
      if (!alive.current) return;
      setDebriefError(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * Düzeltmeler hata defterine yazılır — hoca derste hata_kaydet ile ne
   * yapıyorsa aynısı. Aynı konuda açık kayıt varsa tekrar sayacı artar
   * (fosilleşme takibi burada da işlesin).
   */
  const writeCorrections = async (d: Debrief) => {
    if (d.corrections.length === 0) return;
    const list = await loadMistakes();
    const now = new Date().toISOString();
    const topic = scenarioRef.current ? `konuşma: ${scenarioRef.current.title}` : "sesli sohbet";
    for (const c of d.corrections) {
      const open = findOpenSameTopic(list, `${topic} — ${c.why.slice(0, 40)}`);
      if (open) {
        open.timesSeen = (open.timesSeen ?? 1) + 1;
        continue;
      }
      list.push({
        id: `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        topic: `${topic} — ${c.why.slice(0, 40)}`,
        mistake: c.said,
        correction: c.better,
        explanation: c.why,
        createdAt: now,
        timesSeen: 1,
        track: "konusma",
      });
    }
    await saveMistakes(list);
  };

  const savePhrases = async () => {
    if (!debrief) return;
    const cards = await loadVocab();
    const known = new Set(cards.map((c) => normalizeTarget(c.arabic, pack.script)));
    let added = 0;
    for (const p of debrief.phrases) {
      if (known.has(normalizeTarget(p.target, pack.script))) continue;
      cards.push(newCard(p.target, p.translit, p.tr, "konusma", scenario?.title, "orta"));
      added += 1;
    }
    await saveVocab(cards);
    setSavedPhrases(true);
    Alert.alert("Deftere eklendi", added > 0 ? `${added} kalıp kelime defterine yazıldı.` : "Hepsi zaten defterdeydi.");
  };

  const confirmLeave = () => {
    if (phase === "pick" || phase === "debrief") {
      onBack();
      return;
    }
    Alert.alert("Konuşmayı bırak", "Değerlendirme yapılmadan çıkılsın mı?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Değerlendir", onPress: () => void finish() },
      {
        text: "Çık",
        style: "destructive",
        onPress: () => {
          dictation.stop();
          queue.current?.cancel();
          onBack();
        },
      },
    ]);
  };

  // ------------------------------------------------------------------ görünüm
  const scenarios = scenariosFor(level);

  if (phase === "pick") {
    return (
      <View style={styles.container}>
        <Header title="Konuşma Odası" subtitle="yazmak yok, konuşmak var" onBack={onBack} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.lead}>
            Burada hoca konuşur, sen konuşursun. Metin kutusu yok. Sahnede hoca
            karakterden çıkmaz ve seni düzeltmez — düzeltmeler sahne bitince gelir.
          </Text>

          <TouchableOpacity style={styles.freeCard} onPress={() => start(null)} activeOpacity={0.85}>
            <Text style={styles.freeEmoji}>🗣️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.freeTitle}>{pack.teacherName} ile sesli sohbet</Text>
              <Text style={styles.freeSub}>Konu yok, sahne yok — sadece konuş</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Rol sahneleri · {level}</Text>
          {scenarios.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.sceneCard}
              onPress={() => start(s)}
              activeOpacity={0.85}
            >
              <Text style={styles.sceneEmoji}>{s.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sceneTitle}>{s.title}</Text>
                <Text style={styles.sceneSub}>{s.situation}</Text>
              </View>
              <Text style={styles.sceneLevel}>{s.minLevel}+</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (phase === "debrief") {
    return (
      <View style={styles.container}>
        <Header
          title={scenario ? scenario.title : "Sesli sohbet"}
          subtitle="değerlendirme"
          onBack={onBack}
        />
        <ScrollView contentContainerStyle={styles.body}>
          {!debrief && !debriefError && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.busy}>{pack.teacherName} konuşmayı değerlendiriyor…</Text>
            </View>
          )}
          {debriefError && (
            <View style={styles.center}>
              <Text style={styles.errText}>{debriefError}</Text>
              <TouchableOpacity style={styles.primary} onPress={() => void finish()}>
                <Text style={styles.primaryText}>Tekrar dene</Text>
              </TouchableOpacity>
            </View>
          )}
          {debrief && (
            <>
              <View style={styles.summaryCard}>
                {debrief.goalReached !== null && (
                  <Text style={styles.goal}>
                    {debrief.goalReached ? "🎯 Hedefe ulaştın" : "🎯 Hedefe bu kez ulaşılmadı"}
                  </Text>
                )}
                <Text style={styles.summaryText}>{debrief.summary}</Text>
                <Text style={styles.meta}>
                  {studentTurns} sıra konuştun · {Math.max(1, Math.round((Date.now() - startedAt.current) / 60000))} dk
                </Text>
              </View>

              {debrief.keep.length > 0 && (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>✓ İyi yaptıkların</Text>
                  {debrief.keep.map((k, i) => (
                    <Text key={i} style={styles.keepText}>• {k}</Text>
                  ))}
                </View>
              )}

              {debrief.corrections.length > 0 && (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Düzeltmeler</Text>
                  {debrief.corrections.map((c, i) => (
                    <View key={i} style={styles.corr}>
                      <Text style={[styles.said, isRtl(pack.script) && styles.rtl]}>✗ {c.said}</Text>
                      <Text style={[styles.better, isRtl(pack.script) && styles.rtl]}>✓ {c.better}</Text>
                      <Text style={styles.why}>{c.why}</Text>
                    </View>
                  ))}
                  <Text style={styles.note}>Hata defterine yazıldı; hocan sonraki derslerde döndürecek.</Text>
                </View>
              )}

              {debrief.phrases.length > 0 && (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Bir dahaki sefere</Text>
                  {debrief.phrases.map((p, i) => (
                    <View key={i} style={styles.phrase}>
                      <Text style={[styles.phraseTarget, isRtl(pack.script) && styles.rtl]}>{p.target}</Text>
                      <Text style={styles.phraseMeta}>
                        {p.translit ? `${p.translit} — ` : ""}
                        {p.tr}
                      </Text>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[styles.secondary, savedPhrases && styles.secondaryDone]}
                    disabled={savedPhrases}
                    onPress={() => void savePhrases()}
                  >
                    <Text style={styles.secondaryText}>
                      {savedPhrases ? "✓ Defterde" : "📇 Kalıpları deftere ekle"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.primary} onPress={() => setPhase("pick")}>
                <Text style={styles.primaryText}>Yeni konuşma</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // Konuşma sürüyor: varlık + durum + isteğe bağlı transkript.
  const status =
    phase === "think"
      ? "düşünüyor…"
      : phase === "teacher"
        ? "konuşuyor"
        : phase === "listen"
          ? "seni dinliyor"
          : "sıra sende";

  return (
    <View style={styles.container}>
      <Header
        title={scenario ? `${scenario.emoji} ${scenario.title}` : `${pack.teacherName} ile sohbet`}
        subtitle={status}
        onBack={confirmLeave}
        right={
          <TouchableOpacity
            style={[styles.chip, handsFree && styles.chipOn]}
            onPress={() => {
              const next = !handsFree;
              setHandsFree(next);
              if (!next && phase === "listen") dictation.stop();
            }}
            hitSlop={8}
          >
            <Text style={[styles.chipText, handsFree && styles.chipTextOn]}>
              {handsFree ? "🙌 eller serbest" : "👆 basılı tut"}
            </Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.stage}>
        <Animated.View
          style={[
            styles.presence,
            phase === "listen" && styles.presenceListen,
            phase === "teacher" && styles.presenceTalk,
            { transform: [{ scale: breath }] },
          ]}
        >
          <Text style={styles.presenceEmoji}>
            {phase === "listen" ? "🎙️" : phase === "think" ? "…" : "🗣️"}
          </Text>
        </Animated.View>
        <Text style={styles.status}>{status}</Text>
        {phase === "teacher" && !!nowSaying && (
          <Text style={[styles.saying, isRtl(pack.script) && styles.rtl]} numberOfLines={3}>
            {nowSaying}
          </Text>
        )}
        {phase === "listen" && (
          <Text style={styles.partial} numberOfLines={3}>
            {dictation.partial || (handsFree ? "konuş — susunca sıra geçer" : "bırakınca sıra geçer")}
          </Text>
        )}
        {dictation.error && <Text style={styles.errText}>{dictation.error}</Text>}
        {voiceNote && <Text style={styles.voiceNote}>{voiceNote}</Text>}
        <Text style={styles.voiceTag}>
          {`beyin: ${useDeepseek ? "DeepSeek" : (profile.provider ?? "anthropic")}`}
          {neural ? ` · ses: OpenAI ${voice.voiceId}` : " · ses: telefon"}
          {neuralStt ? " · tanıma: OpenAI" : " · tanıma: telefon"}
        </Text>
      </View>

      <View style={styles.controls}>
        {phase === "wait" && (
          <TouchableOpacity
            style={styles.micButton}
            onPressIn={handsFree ? undefined : startListening}
            onPressOut={handsFree ? undefined : () => dictation.stop()}
            onPress={handsFree ? startListening : undefined}
          >
            <Text style={styles.micText}>{handsFree ? "🎙️ Konuş" : "🎙️ Basılı tut ve konuş"}</Text>
          </TouchableOpacity>
        )}
        {phase === "listen" && !handsFree && (
          <TouchableOpacity style={[styles.micButton, styles.micOn]} onPressOut={() => dictation.stop()}>
            <Text style={styles.micText}>● Dinliyorum — bırakınca biter</Text>
          </TouchableOpacity>
        )}
        {phase === "teacher" && (
          <TouchableOpacity
            style={styles.ghost}
            onPress={() => {
              // Sözünü kes: gerçek konuşmada da olur. Kuyruk iptal, sıra sende.
              queue.current?.cancel();
              startListening();
            }}
          >
            <Text style={styles.ghostText}>Sözünü kes, ben konuşayım</Text>
          </TouchableOpacity>
        )}
        <View style={styles.row}>
          <TouchableOpacity style={styles.ghost} onPress={() => setTranscriptOpen((v) => !v)}>
            <Text style={styles.ghostText}>{transcriptOpen ? "Metni gizle" : "Metni gör"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.endButton} onPress={() => void finish()}>
            <Text style={styles.endText}>Bitir ve değerlendir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {transcriptOpen && (
        <ScrollView style={styles.transcript} contentContainerStyle={{ padding: 14 }}>
          {turns
            .filter((t) => !t.content.startsWith("[Uygulama"))
            .map((t, i) => (
              <Text
                key={i}
                style={[
                  styles.line,
                  t.role === "user" ? styles.lineUser : styles.lineTeacher,
                  isRtl(pack.script) && styles.rtl,
                ]}
              >
                {t.content.replace(/^\[sesli\]\s*/i, "")}
              </Text>
            ))}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    body: { padding: 18, paddingBottom: 40 },
    center: { alignItems: "center", gap: 12, paddingVertical: 40 },
    lead: { fontSize: 14, color: colors.inkSoft, lineHeight: 21, marginBottom: 16 },
    freeCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.deep,
      borderRadius: radius.xl,
      padding: 18,
      marginBottom: 20,
      ...shadowLift,
    },
    freeEmoji: { fontSize: 28 },
    freeTitle: { color: "#FFFFFF", fontSize: 16.5, fontWeight: "800" },
    freeSub: { color: "rgba(255,255,255,0.75)", fontSize: 12.5, marginTop: 2 },
    arrow: { color: "rgba(255,255,255,0.8)", fontSize: 24, fontWeight: "700" },
    sectionTitle: { fontSize: 12, fontWeight: "800", color: colors.inkFaint, letterSpacing: 0.6, marginBottom: 10 },
    sceneCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 10,
      ...shadow,
    },
    sceneEmoji: { fontSize: 24 },
    sceneTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
    sceneSub: { fontSize: 12.5, color: colors.inkSoft, marginTop: 2, lineHeight: 18 },
    sceneLevel: { fontSize: 11, fontWeight: "800", color: colors.gold },
    stage: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
    presence: {
      width: 168,
      height: 168,
      borderRadius: 84,
      backgroundColor: colors.deep,
      alignItems: "center",
      justifyContent: "center",
      ...shadowLift,
    },
    presenceListen: { backgroundColor: colors.accent },
    presenceTalk: { backgroundColor: colors.deepAlt },
    presenceEmoji: { fontSize: 56 },
    status: { fontSize: 13, color: colors.inkFaint, fontWeight: "700", letterSpacing: 0.4 },
    saying: { fontSize: 18, color: colors.ink, textAlign: "center", lineHeight: 28, paddingHorizontal: 12 },
    partial: { fontSize: 15, color: colors.inkSoft, textAlign: "center", lineHeight: 22, paddingHorizontal: 12, fontStyle: "italic" },
    errText: { fontSize: 13, color: colors.danger, textAlign: "center", lineHeight: 19 },
    voiceNote: { fontSize: 11.5, color: colors.gold, textAlign: "center", lineHeight: 16, paddingHorizontal: 16 },
    voiceTag: { fontSize: 10.5, color: colors.inkFaint, letterSpacing: 0.3, marginTop: 6 },
    controls: { padding: 18, gap: 10 },
    micButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.xl,
      paddingVertical: 18,
      alignItems: "center",
      ...shadowLift,
    },
    micOn: { backgroundColor: colors.danger },
    micText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
    row: { flexDirection: "row", gap: 10 },
    ghost: {
      flex: 1,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      alignItems: "center",
    },
    ghostText: { color: colors.inkSoft, fontSize: 13.5, fontWeight: "700" },
    endButton: {
      flex: 1,
      borderRadius: radius.lg,
      backgroundColor: colors.goldSoft,
      paddingVertical: 12,
      alignItems: "center",
    },
    endText: { color: colors.gold, fontSize: 13.5, fontWeight: "800" },
    transcript: { maxHeight: 200, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
    line: { fontSize: 14, lineHeight: 22, marginBottom: 6 },
    lineUser: { color: colors.accentDark, fontWeight: "700" },
    lineTeacher: { color: colors.ink },
    rtl: { writingDirection: "rtl", textAlign: "right" },
    chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
    chipOn: { backgroundColor: colors.accentSoft, borderColor: "transparent" },
    chipText: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft },
    chipTextOn: { color: colors.accentDark },
    busy: { fontSize: 14, color: colors.inkSoft },
    summaryCard: { backgroundColor: colors.deep, borderRadius: radius.xl, padding: 18, marginBottom: 14, ...shadowLift },
    goal: { color: colors.goldDeep, fontSize: 13, fontWeight: "800", marginBottom: 8 },
    summaryText: { color: "#FFFFFF", fontSize: 15, lineHeight: 23 },
    meta: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 10 },
    block: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12, ...shadow },
    blockTitle: { fontSize: 13, fontWeight: "800", color: colors.ink, marginBottom: 8 },
    keepText: { fontSize: 14, color: colors.accentDark, lineHeight: 21 },
    corr: { marginBottom: 10 },
    said: { fontSize: 15, color: colors.danger },
    better: { fontSize: 15, color: colors.accentDark, fontWeight: "700", marginTop: 2 },
    why: { fontSize: 12.5, color: colors.inkSoft, marginTop: 3, lineHeight: 18 },
    note: { fontSize: 11.5, color: colors.inkFaint, marginTop: 4 },
    phrase: { marginBottom: 8 },
    phraseTarget: { fontSize: 17, color: colors.ink },
    phraseMeta: { fontSize: 12.5, color: colors.inkSoft, marginTop: 2 },
    primary: { backgroundColor: colors.accent, borderRadius: radius.xl, paddingVertical: 15, alignItems: "center", marginTop: 6, ...shadowLift },
    primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
    secondary: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 11, alignItems: "center", marginTop: 6 },
    secondaryDone: { opacity: 0.6 },
    secondaryText: { color: colors.ink, fontSize: 13.5, fontWeight: "700" },
  });
}
