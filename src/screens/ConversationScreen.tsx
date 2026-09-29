import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, ScrollView, StyleSheet, Text, View } from "react-native";
import { AgentContext } from "../agent";
import { StatusBar } from "expo-status-bar";
import Header from "../components/Header";
import Icon from "../components/Icon";
import {
  Button,
  Chip,
  ListGroup,
  ListRow,
  PressableScale,
  SectionLabel,
  StarPattern,
  Surface,
  TargetText,
  TeacherAvatar,
  Txt,
  useInsets,
  Wave,
} from "../components/kit";
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
import { backendFor, createNeuralSpeechQueue } from "../neuralVoice";
import { keyFor } from "../providers";
import { useRecorderDictation } from "../useRecorderDictation";
import { normalizeVoice } from "../voice";
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
import { arabicText, shadowLift } from "../theme";
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
  const insets = useInsets();
  const pack = getActivePack();
  const level = profile.assessment?.speakingLevel ?? "A1";
  /**
   * Ses modeli: tercih "openai" VE anahtar varsa hoca ChatGPT'nin sesiyle
   * konuşur, öğrencinin sesi de (istenirse) aynı modelle çözülür. Yoksa
   * telefonun TTS'i ve tanıması — robot ama çalışır.
   */
  const voice = normalizeVoice(profile.voice);
  const backend = useMemo(
    () => backendFor(voice, { openai: keyFor(profile, "openai"), gemini: keyFor(profile, "gemini") }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voice.provider, voice.voiceId, profile.apiKeys]
  );
  const neural = backend !== null;
  const neuralStt = neural && voice.transcribe;
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
    backend: neuralStt ? backend : null,
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
    const q = backend
      ? createNeuralSpeechQueue({
          backend,
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
      <View style={styles.light}>
        <Header title="Konuşma Odası" subtitle="yazmak yok, konuşmak var" onBack={onBack} />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Txt variant="callout" color={colors.inkSoft} style={{ marginBottom: 16 }}>
            Burada hoca konuşur, sen konuşursun. Metin kutusu yok. Sahnede hoca karakterden çıkmaz
            ve seni düzeltmez — düzeltmeler sahne bitince gelir.
          </Txt>

          <PressableScale onPress={() => start(null)} accessibilityLabel={`${pack.teacherName} ile sesli sohbet`}>
            <View style={styles.freeCard}>
              <StarPattern width="100%" height="100%" color={colors.goldDeep} opacity={0.1} />
              <TeacherAvatar size={52} />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt variant="title3" color={colors.onDeep}>
                  {pack.teacherName} ile sesli sohbet
                </Txt>
                <Txt variant="caption" color={colors.onDeepSoft}>
                  Konu yok, sahne yok — sadece konuş
                </Txt>
              </View>
              <Icon name="chevronRight" size={22} color={colors.goldDeep} />
            </View>
          </PressableScale>

          <SectionLabel title={`Rol sahneleri · ${level}`} style={{ marginTop: 24 }} />
          <ListGroup>
            {scenarios.map((s) => (
              <ListRow
                key={s.id}
                icon="scene"
                tone="gold"
                title={s.title}
                subtitle={s.situation}
                onPress={() => start(s)}
                right={
                  <Txt variant="caption" color={colors.gold} style={{ fontWeight: "800" }}>
                    {s.minLevel}+
                  </Txt>
                }
              />
            ))}
          </ListGroup>
        </ScrollView>
      </View>
    );
  }

  if (phase === "debrief") {
    return (
      <View style={styles.light}>
        <Header title={scenario ? scenario.title : "Sesli sohbet"} subtitle="değerlendirme" onBack={onBack} />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {!debrief && !debriefError && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Txt variant="callout" color={colors.inkSoft}>
                {pack.teacherName} konuşmayı değerlendiriyor…
              </Txt>
            </View>
          )}
          {debriefError && (
            <View style={styles.center}>
              <Txt variant="callout" color={colors.danger} center>
                {debriefError}
              </Txt>
              <Button label="Tekrar dene" icon="refresh" onPress={() => void finish()} />
            </View>
          )}
          {debrief && (
            <View style={{ gap: 14 }}>
              <View style={styles.summaryCard}>
                <StarPattern width="100%" height="100%" color={colors.goldDeep} opacity={0.08} />
                {debrief.goalReached !== null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon name="target" size={16} color={colors.goldDeep} />
                    <Txt variant="overline" color={colors.goldDeep}>
                      {debrief.goalReached ? "Hedefe ulaştın" : "Hedefe bu kez ulaşılmadı"}
                    </Txt>
                  </View>
                )}
                <Txt variant="title3" color={colors.onDeep} style={{ marginTop: 8 }}>
                  {debrief.summary}
                </Txt>
                <Txt variant="caption" color={colors.onDeepSoft} style={{ marginTop: 12 }}>
                  {studentTurns} sıra konuştun · {Math.max(1, Math.round((Date.now() - startedAt.current) / 60000))} dk
                </Txt>
              </View>

              {debrief.keep.length > 0 && (
                <Surface style={{ gap: 8 }}>
                  <Txt variant="headline" style={{ fontSize: 15 }}>
                    İyi yaptıkların
                  </Txt>
                  {debrief.keep.map((k, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                      <Icon name="check" size={18} color={colors.accentDark} strokeWidth={2.4} />
                      <Txt variant="callout" style={{ flex: 1 }}>
                        {k}
                      </Txt>
                    </View>
                  ))}
                </Surface>
              )}

              {debrief.corrections.length > 0 && (
                <Surface style={{ gap: 12 }}>
                  <Txt variant="headline" style={{ fontSize: 15 }}>
                    Düzeltmeler
                  </Txt>
                  {debrief.corrections.map((c, i) => (
                    <View key={i} style={{ gap: 2, paddingTop: i > 0 ? 12 : 0, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.line }}>
                      <Txt variant="body" color={colors.danger} style={[{ textDecorationLine: "line-through" }, isRtl(pack.script) && styles.rtl]}>
                        {c.said}
                      </Txt>
                      <Txt variant="bodyStrong" color={colors.accentDark} style={isRtl(pack.script) ? styles.rtl : undefined}>
                        {c.better}
                      </Txt>
                      <Txt variant="caption" color={colors.inkSoft}>
                        {c.why}
                      </Txt>
                    </View>
                  ))}
                  <Txt variant="caption" color={colors.inkFaint}>
                    Hata defterine yazıldı; hocan sonraki derslerde döndürecek.
                  </Txt>
                </Surface>
              )}

              {debrief.phrases.length > 0 && (
                <Surface style={{ gap: 10 }}>
                  <Txt variant="headline" style={{ fontSize: 15 }}>
                    Bir dahaki sefere
                  </Txt>
                  {debrief.phrases.map((p, i) => (
                    <View key={i} style={{ gap: 2 }}>
                      <TargetText size={19}>{p.target}</TargetText>
                      <Txt variant="caption" color={colors.inkSoft}>
                        {p.translit ? `${p.translit} — ` : ""}
                        {p.tr}
                      </Txt>
                    </View>
                  ))}
                  <Button
                    variant="secondary"
                    size="md"
                    icon={savedPhrases ? "check" : "bookmark"}
                    label={savedPhrases ? "Defterde" : "Kalıpları deftere ekle"}
                    disabled={savedPhrases}
                    onPress={() => void savePhrases()}
                  />
                </Surface>
              )}

              <Button icon="mic" label="Yeni konuşma" onPress={() => setPhase("pick")} />
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // Konuşma sürüyor: koyu sahne, ortada nefes alan varlık.
  const status =
    phase === "think"
      ? "düşünüyor…"
      : phase === "teacher"
        ? "konuşuyor"
        : phase === "listen"
          ? "seni dinliyor"
          : "sıra sende";

  return (
    <View style={styles.stageWrap}>
      <StatusBar style="light" />
      <StarPattern width="100%" height="100%" color={colors.goldDeep} opacity={0.05} />
      <Header
        tone="deep"
        closeIcon
        title={scenario ? scenario.title : `${pack.teacherName} ile sohbet`}
        subtitle={status}
        onBack={confirmLeave}
        right={
          <Chip
            onDeep
            selected={handsFree}
            icon={handsFree ? "hand" : "mic"}
            label={handsFree ? "Eller serbest" : "Basılı tut"}
            onPress={() => {
              const next = !handsFree;
              setHandsFree(next);
              if (!next && phase === "listen") dictation.stop();
            }}
          />
        }
      />

      <View style={styles.stage}>
        <Animated.View style={[styles.halo3, { transform: [{ scale: breath }] }, phase === "listen" && styles.haloListen]}>
          <View style={[styles.halo2, phase === "listen" && styles.haloListen2]}>
            <View
              style={[
                styles.presence,
                phase === "listen" && styles.presenceListen,
                phase === "teacher" && styles.presenceTalk,
              ]}
            >
              {phase === "think" ? (
                <ActivityIndicator color={colors.onDeep} />
              ) : phase === "teacher" ? (
                <Wave active color={colors.onDeep} bars={5} height={30} />
              ) : (
                <Icon name="mic" size={44} color={phase === "listen" ? colors.onGold : colors.onDeep} strokeWidth={1.8} />
              )}
            </View>
          </View>
        </Animated.View>
        <Txt variant="overline" color={phase === "listen" ? colors.goldDeep : "#7FC8B6"}>
          {status.toLocaleUpperCase("tr-TR")}
        </Txt>
        {phase === "teacher" && !!nowSaying && (
          <Text style={[styles.saying, isRtl(pack.script) && containsTargetScript(nowSaying, pack.script) && arabicText(24)]} numberOfLines={4}>
            {nowSaying}
          </Text>
        )}
        {phase === "listen" && (
          <Txt variant="title3" color={colors.onDeep} center numberOfLines={3} style={{ fontStyle: "italic" }}>
            {dictation.partial ? `“${dictation.partial}”` : handsFree ? "konuş — susunca sıra geçer" : "bırakınca sıra geçer"}
          </Txt>
        )}
        {dictation.error && (
          <Txt variant="caption" color="#F2A58E" center>
            {dictation.error}
          </Txt>
        )}
        {voiceNote && (
          <Txt variant="caption" color={colors.goldDeep} center>
            {voiceNote}
          </Txt>
        )}
        <Txt variant="caption" color={colors.onDeepSoft} style={{ fontSize: 11 }} center>
          {`beyin: ${useDeepseek ? "DeepSeek" : (profile.provider ?? "anthropic")}`}
          {backend ? ` · ses: ${backend.label}` : " · ses: telefon"}
          {neuralStt ? ` · tanıma: ${voice.provider === "gemini" ? "Gemini" : "OpenAI"}` : " · tanıma: telefon"}
        </Txt>
      </View>

      <View style={[styles.controls, { paddingBottom: 18 + insets.bottom }]}>
        {phase === "wait" && (
          <PressableScale
            style={styles.micButton}
            onPressIn={handsFree ? undefined : startListening}
            onPressOut={handsFree ? undefined : () => dictation.stop()}
            onPress={handsFree ? startListening : undefined}
            accessibilityLabel="Konuş"
          >
            <Icon name="mic" size={22} color={colors.onGold} />
            <Txt variant="button" color={colors.onGold}>
              {handsFree ? "Konuş" : "Basılı tut ve konuş"}
            </Txt>
          </PressableScale>
        )}
        {phase === "listen" && !handsFree && (
          <PressableScale style={[styles.micButton, styles.micOn]} onPressOut={() => dictation.stop()} accessibilityLabel="Dinliyorum">
            <Icon name="stop" size={20} color="#FFFFFF" />
            <Txt variant="button" color="#FFFFFF">
              Dinliyorum — bırakınca biter
            </Txt>
          </PressableScale>
        )}
        {phase === "teacher" && (
          <Button
            variant="onDeep"
            icon="hand"
            label="Sözünü kes, ben konuşayım"
            onPress={() => {
              // Sözünü kes: gerçek konuşmada da olur. Kuyruk iptal, sıra sende.
              queue.current?.cancel();
              startListening();
            }}
          />
        )}
        <View style={styles.row}>
          <Button
            variant="onDeep"
            size="md"
            icon={transcriptOpen ? "eyeOff" : "eye"}
            label={transcriptOpen ? "Metni gizle" : "Metni gör"}
            onPress={() => setTranscriptOpen((v) => !v)}
            style={{ flex: 1 }}
          />
          <Button variant="gold" size="md" label="Bitir ve değerlendir" onPress={() => void finish()} style={{ flex: 1 }} />
        </View>
      </View>

      {transcriptOpen && (
        <ScrollView style={styles.transcript} contentContainerStyle={{ padding: 16, gap: 8 }}>
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
    light: { flex: 1, backgroundColor: colors.bg },
    body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 40 },
    center: { alignItems: "center", gap: 14, paddingVertical: 40 },
    freeCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: colors.deep,
      borderRadius: 26,
      padding: 18,
      overflow: "hidden",
    },
    summaryCard: { backgroundColor: colors.deep, borderRadius: 26, padding: 20, overflow: "hidden" },
    stageWrap: { flex: 1, backgroundColor: colors.deep },
    stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 16 },
    halo3: {
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: "rgba(63,169,148,0.08)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    halo2: {
      width: 186,
      height: 186,
      borderRadius: 93,
      backgroundColor: "rgba(63,169,148,0.14)",
      alignItems: "center",
      justifyContent: "center",
    },
    haloListen: { backgroundColor: "rgba(217,192,143,0.08)" },
    haloListen2: { backgroundColor: "rgba(217,192,143,0.16)" },
    presence: {
      width: 134,
      height: 134,
      borderRadius: 67,
      backgroundColor: "#1F7A66",
      alignItems: "center",
      justifyContent: "center",
      ...shadowLift,
    },
    presenceListen: { backgroundColor: colors.goldDeep },
    presenceTalk: { backgroundColor: "#23866F" },
    saying: {
      fontFamily: "Fraunces",
      fontWeight: "500",
      fontSize: 22,
      lineHeight: 30,
      color: colors.onDeep,
      textAlign: "center",
    },
    controls: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
    micButton: {
      height: 60,
      borderRadius: 20,
      backgroundColor: colors.goldDeep,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    micOn: { backgroundColor: colors.danger },
    row: { flexDirection: "row", gap: 10 },
    transcript: {
      maxHeight: 220,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    line: { fontFamily: "Manrope", fontSize: 14.5, lineHeight: 22 },
    lineUser: { color: colors.goldDeep, fontWeight: "700" },
    lineTeacher: { color: colors.onDeep },
    rtl: { writingDirection: "rtl", textAlign: "right" },
  });
}
