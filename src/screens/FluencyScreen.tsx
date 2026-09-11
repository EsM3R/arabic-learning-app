/**
 * Akıcılık Odası — 4/3/2 alıştırması.
 *
 * Uygulamanın en büyük eksiğiydi: telaffuz (doğruluk) ve gölgeleme (taklit)
 * vardı, AKICILIK antrenmanı yoktu. Öğrenci cümle kurabiliyor ama kuramıyordu
 * — arada duraksama, düzeltme, yeniden başlama vardı.
 *
 * Düzen: aynı konu üç kez anlatılır, süre her turda kısalır. İçerik aynı
 * olduğu için ikinci ve üçüncü turda beyin "ne söyleyeceğim"le değil "nasıl
 * söyleyeceğim"le uğraşır. Cihaz ses tanıması turları yazıya çevirdiği için
 * hızlanma SAYIYLA gösterilir (bkz. src/fluency.ts).
 *
 * API çağrısı YOKTUR — konular öğrencinin kendi verisinden gelir.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Header from "../components/Header";
import { Card, ProgressBar, SectionHeader } from "../components/ui";
import { feedback } from "../feedback";
import {
  fluencyOutcome,
  makeRound,
  PREP_SECONDS,
  pruneSessions,
  roundSeconds,
  wordCount,
} from "../fluency";
import type { FluencyRound } from "../fluency";
import { getActivePack } from "../languages";
import { isRtl } from "../scripts";
import { recordStat } from "../statsStore";
import {
  loadFluency,
  loadReadings,
  loadVocab,
  saveFluency,
  touchLastActivity,
} from "../storage";
import { radius, shadow } from "../theme";
import type { Palette } from "../theme";
import { useDictation } from "../useDictation";
import { useTheme } from "../useTheme";
import type { Profile } from "../types";

type Stage = "konu" | "hazirlik" | "tur" | "arada" | "sonuc";

/** Öğrencinin kendi verisinden üretilen konu önerileri — API'siz. */
function buildTopics(
  readingTitles: string[],
  moduleTitles: string[],
  vocabSample: string[]
): string[] {
  const out: string[] = [];
  for (const t of readingTitles.slice(0, 3)) out.push(`Okuduğun metni anlat: "${t}"`);
  for (const t of moduleTitles.slice(0, 3)) out.push(t);
  if (vocabSample.length >= 3) {
    out.push(`Şu kelimeleri kullanarak bir gününü anlat: ${vocabSample.slice(0, 5).join(", ")}`);
  }
  out.push("Dün ne yaptın, baştan sona anlat");
  out.push("En sevdiğin yeri tarif et");
  out.push("Bir filmi ya da kitabı özetle");
  return out;
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function FluencyScreen({
  profile,
  onBack,
}: {
  profile: Profile;
  onBack: () => void;
}) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pack = getActivePack();
  const level = profile.assessment?.speakingLevel ?? "A0";
  const plan = useMemo(() => roundSeconds(level), [level]);

  const [stage, setStage] = useState<Stage>("konu");
  const [topics, setTopics] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [custom, setCustom] = useState("");
  const [index, setIndex] = useState(0); // hangi tur (0..2)
  const [left, setLeft] = useState(0); // kalan saniye
  const [rounds, setRounds] = useState<FluencyRound[]>([]);
  const [saved, setSaved] = useState(false);

  // Tur boyunca duyulan metin burada birikir; tur bitince kelimeye çevrilir.
  const heard = useRef("");
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const dictation = useDictation({
    onResult: (text) => {
      heard.current = text;
    },
  });

  useEffect(() => {
    void (async () => {
      const [readings, vocab] = await Promise.all([loadReadings(), loadVocab()]);
      const finished = readings.filter((r) => r.finishedAt);
      setTopics(
        buildTopics(
          finished.map((r) => r.titleTr || r.title),
          (profile.curriculum?.modules ?? [])
            .filter((m) => profile.completedModuleIds.includes(m.id))
            .map((m) => m.title),
          vocab.slice(-12).map((c) => c.turkish)
        )
      );
    })();
  }, [profile]);

  /** Zamanlayıcıyı her durumda temizle — ekran kapanınca da. */
  const clearTicker = () => {
    if (ticker.current) {
      clearInterval(ticker.current);
      ticker.current = null;
    }
  };
  useEffect(() => clearTicker, []);

  const finishRound = () => {
    clearTicker();
    dictation.stop();
    // Tanıma "end" olayını biraz gecikmeli verir; son parçayı kaçırmamak için
    // sayımı kısa bir gecikmeyle yapıyoruz.
    setTimeout(() => {
      const words = wordCount(heard.current || dictation.partial, pack.script);
      const round = makeRound(words, plan[index]);
      setRounds((prev) => [...prev, round]);
      void recordStat("fluencyRound");
      void recordStat("spoken"); // bu gerçekten bir konuşma denemesidir
      void touchLastActivity();
      void feedback(true);
      setStage(index === plan.length - 1 ? "sonuc" : "arada");
    }, 900);
  };

  const startRound = (i: number) => {
    heard.current = "";
    setIndex(i);
    setLeft(plan[i]);
    setStage("tur");
    dictation.start();
    clearTicker();
    ticker.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearTicker();
          finishRound();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const startPrep = (chosen: string) => {
    setTopic(chosen);
    setRounds([]);
    setSaved(false);
    setLeft(PREP_SECONDS);
    setStage("hazirlik");
    clearTicker();
    ticker.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearTicker();
          startRound(0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const outcome = useMemo(() => fluencyOutcome(rounds), [rounds]);

  const save = async () => {
    const sessions = await loadFluency();
    const next = pruneSessions([
      {
        id: `f${Date.now()}`,
        at: new Date().toISOString(),
        topic,
        level,
        rounds,
      },
      ...sessions,
    ]);
    await saveFluency(next);
    setSaved(true);
  };

  // -------------------------------------------------------------------------

  const liveWords = wordCount(dictation.partial, pack.script);
  const maxWpm = Math.max(1, ...rounds.map((r) => r.wpm));

  return (
    <View style={styles.flex}>
      <Header title="Akıcılık Odası" subtitle="4 · 3 · 2" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {stage === "konu" && (
          <>
            <Card>
              <Text style={styles.explain}>
                Aynı şeyi <Text style={styles.bold}>üç kez</Text> anlatacaksın:
                önce {mmss(plan[0])}, sonra {mmss(plan[1])}, sonra {mmss(plan[2])}.
                İçerik aynı kalınca beyin "ne söyleyeceğim"le uğraşmayı bırakır,
                süre baskısı da duraksamaları eritir.
              </Text>
              <Text style={styles.rule}>
                Tek kural: <Text style={styles.bold}>durma</Text>. Hata yapmak
                serbest, düzeltmeye çalışmak yasak.
              </Text>
            </Card>

            <SectionHeader title="Ne anlatacaksın?" hint="Bildiğin bir şey olsun" />
            {topics.map((t) => (
              <TouchableOpacity
                key={t}
                style={styles.topic}
                onPress={() => startPrep(t)}
                activeOpacity={0.85}
              >
                <Text style={styles.topicText}>{t}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.customRow}>
              <TextInput
                style={styles.input}
                value={custom}
                onChangeText={setCustom}
                placeholder="Ya da kendi konunu yaz…"
                placeholderTextColor={colors.inkFaint}
              />
              <TouchableOpacity
                style={[styles.go, !custom.trim() && styles.goOff]}
                disabled={!custom.trim()}
                onPress={() => startPrep(custom.trim())}
              >
                <Text style={styles.goText}>Başla</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {stage === "hazirlik" && (
          <Card>
            <Text style={styles.stageLabel}>HAZIRLIK</Text>
            <Text style={styles.timer}>{mmss(left)}</Text>
            <Text style={styles.topicBig}>{topic}</Text>
            <Text style={styles.explain}>
              Not alma, sadece düşün: nereden başlayacaksın, hangi üç şeyi
              söyleyeceksin? Cümle kurmaya çalışma — sıralamayı kur.
            </Text>
            <TouchableOpacity style={styles.primary} onPress={() => startRound(0)}>
              <Text style={styles.primaryText}>Hazırım, başlayalım</Text>
            </TouchableOpacity>
          </Card>
        )}

        {stage === "tur" && (
          <Card>
            <Text style={styles.stageLabel}>
              {index + 1}. TUR · {mmss(plan[index])}
            </Text>
            <Text style={[styles.timer, left <= 10 && styles.timerWarn]}>{mmss(left)}</Text>
            <ProgressBar progress={1 - left / Math.max(1, plan[index])} />
            <Text style={styles.topicBig}>{topic}</Text>
            <View style={styles.liveBox}>
              <Text style={styles.liveCount}>{liveWords}</Text>
              <Text style={styles.liveLabel}>kelime duyuldu</Text>
            </View>
            {!!dictation.error && <Text style={styles.error}>{dictation.error}</Text>}
            <Text style={styles.hint}>
              {dictation.listening ? "● Dinliyorum — konuşmaya devam et" : "Mikrofon kapalı"}
            </Text>
            <TouchableOpacity style={styles.secondary} onPress={finishRound}>
              <Text style={styles.secondaryText}>Turu erken bitir</Text>
            </TouchableOpacity>
          </Card>
        )}

        {stage === "arada" && (
          <Card>
            <Text style={styles.stageLabel}>TUR BİTTİ</Text>
            <Text style={styles.bigNumber}>{rounds[rounds.length - 1]?.wpm ?? 0}</Text>
            <Text style={styles.liveLabel}>kelime / dakika</Text>
            <Text style={styles.explain}>
              Şimdi <Text style={styles.bold}>aynı şeyi</Text> tekrar anlat — ama
              bu sefer {mmss(plan[index + 1])} içinde. Yeni şey ekleme, aynı
              hikâyeyi daha hızlı akıt.
            </Text>
            <TouchableOpacity style={styles.primary} onPress={() => startRound(index + 1)}>
              <Text style={styles.primaryText}>
                {index + 2}. tura başla ({mmss(plan[index + 1])})
              </Text>
            </TouchableOpacity>
          </Card>
        )}

        {stage === "sonuc" && (
          <>
            <Card>
              <SectionHeader title="Sonuç" />
              {rounds.map((r, i) => (
                <View key={i} style={styles.barRow}>
                  <Text style={styles.barLabel}>{mmss(r.seconds)}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.round((r.wpm / maxWpm) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barValue}>{r.wpm}</Text>
                </View>
              ))}
              <Text style={styles.unitNote}>kelime / dakika</Text>
              <Text style={[styles.verdict, !outcome.measured && styles.verdictMuted]}>
                {outcome.message}
              </Text>
              <Text style={styles.caveat}>
                Sayılar telefonun ses tanımasının DUYDUĞU kelimelerdir; kelime
                yutabilir. Üç turda da aynı yönde yanıldığı için turlar arası
                karşılaştırma yine de anlamlıdır — mutlak hız değil, kendi
                kendine göre hızlanma ölçülüyor.
              </Text>
            </Card>
            <TouchableOpacity
              style={[styles.primary, saved && styles.goOff]}
              disabled={saved}
              onPress={() => void save()}
            >
              <Text style={styles.primaryText}>{saved ? "Kaydedildi ✓" : "Kaydet"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={() => setStage("konu")}>
              <Text style={styles.secondaryText}>Yeni konu</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    scroll: { padding: 16, paddingBottom: 48, gap: 12 },
    explain: { fontSize: 15, lineHeight: 22, color: c.inkSoft },
    rule: { fontSize: 15, lineHeight: 22, color: c.ink, marginTop: 8 },
    bold: { fontWeight: "800", color: c.ink },
    topic: {
      backgroundColor: c.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      ...shadow,
    },
    topicText: { fontSize: 15, color: c.ink },
    customRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    input: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: c.ink,
      fontSize: 15,
    },
    go: {
      backgroundColor: c.accent,
      borderRadius: radius.md,
      paddingHorizontal: 18,
      paddingVertical: 13,
    },
    goOff: { opacity: 0.45 },
    goText: { color: "#fff", fontWeight: "800" },
    stageLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1,
      color: c.inkFaint,
      textAlign: "center",
    },
    timer: {
      fontSize: 56,
      fontWeight: "800",
      color: c.ink,
      textAlign: "center",
      marginVertical: 4,
      fontVariant: ["tabular-nums"],
    },
    timerWarn: { color: c.danger },
    topicBig: {
      fontSize: 17,
      fontWeight: "700",
      color: c.ink,
      textAlign: "center",
      marginVertical: 10,
      writingDirection: isRtl(getActivePack().script) ? "rtl" : "ltr",
    },
    liveBox: { alignItems: "center", marginTop: 12 },
    liveCount: { fontSize: 40, fontWeight: "800", color: c.accent },
    liveLabel: { fontSize: 13, color: c.inkSoft, textAlign: "center" },
    bigNumber: { fontSize: 52, fontWeight: "800", color: c.accent, textAlign: "center" },
    hint: { fontSize: 13, color: c.inkSoft, textAlign: "center", marginTop: 10 },
    error: { fontSize: 13, color: c.danger, textAlign: "center", marginTop: 10 },
    primary: {
      backgroundColor: c.accent,
      borderRadius: radius.md,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 14,
    },
    primaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
    secondary: {
      borderRadius: radius.md,
      paddingVertical: 13,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.border,
      marginTop: 8,
    },
    secondaryText: { color: c.inkSoft, fontWeight: "700" },
    barRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
    barLabel: {
      width: 44,
      fontSize: 13,
      color: c.inkSoft,
      fontVariant: ["tabular-nums"],
    },
    barTrack: {
      flex: 1,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.bgAlt,
      overflow: "hidden",
    },
    barFill: { height: "100%", backgroundColor: c.accent, borderRadius: 11 },
    barValue: {
      width: 38,
      textAlign: "right",
      fontWeight: "800",
      color: c.ink,
      fontVariant: ["tabular-nums"],
    },
    unitNote: { fontSize: 12, color: c.inkFaint, textAlign: "right", marginTop: 4 },
    verdict: { fontSize: 15, lineHeight: 22, color: c.ink, marginTop: 14 },
    verdictMuted: { color: c.inkSoft },
    caveat: { fontSize: 12, lineHeight: 18, color: c.inkFaint, marginTop: 12 },
  });
}
