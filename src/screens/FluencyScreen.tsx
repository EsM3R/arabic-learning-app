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
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import Header from "../components/Header";
import { Button, ListGroup, ListRow, Ring, SectionLabel, StarPattern, Surface, Txt, Wave } from "../components/kit";
import { feedback } from "../feedback";
import {
  afterRound,
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
import { recordStats } from "../statsStore";
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
  /**
   * Akan ara metnin son hâli. Gerekli çünkü teslim (`onResult`) bazı
   * cihazlarda hiç gelmiyor; o zaman elde kalan tek şey ara metin oluyor ve
   * `dictation.partial`'ı zamanlayıcının içinden okumak BAYAT değer verirdi.
   */
  const lastPartial = useRef("");
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Tur sonu sayımının gecikmesi — ekran kapanırsa iptal edilmeli. */
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dictation = useDictation({
    onResult: (text) => {
      heard.current = text;
    },
  });

  useEffect(() => {
    if (dictation.partial) lastPartial.current = dictation.partial;
  }, [dictation.partial]);

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
  useEffect(
    () => () => {
      clearTicker();
      if (settle.current) clearTimeout(settle.current);
    },
    []
  );

  /**
   * Geri sayım kurar. Kalan süre YEREL bir sayaçta tutulur, state güncelleme
   * fonksiyonunun içinde değil.
   *
   * Buradaki tuzak gerçek bir hataya mal oldu: sayaç `setLeft(s => ...)`
   * içinden finishRound çağırıyordu ve o finishRound, turun BAŞLATILDIĞI
   * render'ın `index`'ini görüyordu — yani bir önceki turunkini. Sonuç: 2. tur
   * 60 sn, 3. tur 45 sn sanılarak kaydediliyor (hız olduğundan düşük çıkıyor),
   * sonuç ekranı hiç açılmıyor ve 4. tur diye olmayan bir tura geçilip
   * NaN'a kilitleniyordu. Tur numarası artık AÇIKÇA taşınıyor.
   */
  const countdown = (seconds: number, onDone: () => void) => {
    clearTicker();
    let remaining = seconds;
    setLeft(remaining);
    ticker.current = setInterval(() => {
      remaining -= 1;
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        clearTicker();
        onDone();
      }
    }, 1000);
  };

  const finishRound = (i: number) => {
    clearTicker();
    dictation.stop();
    // Tanıma "end" olayını biraz gecikmeli verir; son parçayı kaçırmamak için
    // sayımı kısa bir gecikmeyle yapıyoruz.
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      const said = heard.current || lastPartial.current;
      const round = makeRound(wordCount(said, pack.script), plan[i]);
      setRounds((prev) => [...prev, round]);
      // Tur hem akıcılık turu hem konuşma denemesidir; ikisi TOPLU yazılır.
      void recordStats(["fluencyRound", "spoken"]);
      void touchLastActivity();
      void feedback(true);
      // Sıralama saf modülde ve test altında (bkz. src/fluency.ts afterRound).
      setStage(afterRound(i, plan.length).stage);
    }, 900);
  };

  const startRound = (i: number) => {
    if (i < 0 || i >= plan.length) return; // olmayan tura geçilmesin
    heard.current = "";
    lastPartial.current = "";
    setIndex(i);
    setStage("tur");
    dictation.start();
    countdown(plan[i], () => finishRound(i));
  };

  const startPrep = (chosen: string) => {
    setTopic(chosen);
    setRounds([]);
    setSaved(false);
    setStage("hazirlik");
    countdown(PREP_SECONDS, () => startRound(0));
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {stage === "konu" && (
          <>
            <Surface tone="deep" style={{ overflow: "hidden", gap: 10 }}>
              <StarPattern width="100%" height="100%" color={colors.goldDeep} opacity={0.08} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                {plan.map((p, i) => (
                  <View key={i} style={styles.planChip}>
                    <Txt variant="headline" color={colors.goldDeep} style={{ fontSize: 15 }}>
                      {mmss(p)}
                    </Txt>
                  </View>
                ))}
              </View>
              <Txt variant="callout" color={colors.onDeep}>
                Aynı şeyi <Txt variant="callout" color={colors.goldDeep} style={{ fontWeight: "800" }}>üç kez</Txt>{" "}
                anlatacaksın: önce {mmss(plan[0])}, sonra {mmss(plan[1])}, sonra {mmss(plan[2])}. İçerik aynı
                kalınca beyin "ne söyleyeceğim"le uğraşmayı bırakır, süre baskısı da duraksamaları eritir.
              </Txt>
              <Txt variant="callout" color={colors.onDeepSoft}>
                Tek kural: <Txt variant="callout" color={colors.onDeep} style={{ fontWeight: "800" }}>durma</Txt>. Hata
                yapmak serbest, düzeltmeye çalışmak yasak.
              </Txt>
            </Surface>

            <View>
              <SectionLabel title="Ne anlatacaksın?" />
              <ListGroup>
                {topics.map((t) => (
                  <ListRow key={t} icon="message" title={t} onPress={() => startPrep(t)} />
                ))}
              </ListGroup>
            </View>
            <View style={styles.customRow}>
              <TextInput
                style={styles.input}
                value={custom}
                onChangeText={setCustom}
                placeholder="Ya da kendi konunu yaz…"
                placeholderTextColor={colors.inkFaint}
              />
              <Button size="md" label="Başla" disabled={!custom.trim()} onPress={() => startPrep(custom.trim())} />
            </View>
          </>
        )}

        {stage === "hazirlik" && (
          <Surface raised style={styles.stageCard}>
            <Txt variant="overline" color={colors.inkSoft}>
              HAZIRLIK
            </Txt>
            <Txt style={styles.timer}>{mmss(left)}</Txt>
            <Txt variant="title3" center style={styles.topicBig}>
              {topic}
            </Txt>
            <Txt variant="callout" color={colors.inkSoft} center>
              Not alma, sadece düşün: nereden başlayacaksın, hangi üç şeyi söyleyeceksin? Cümle kurmaya
              çalışma — sıralamayı kur.
            </Txt>
            <Button icon="mic" label="Hazırım, başlayalım" onPress={() => startRound(0)} style={{ alignSelf: "stretch", marginTop: 8 }} />
          </Surface>
        )}

        {stage === "tur" && (
          <Surface raised style={styles.stageCard}>
            <Txt variant="overline" color={colors.inkSoft}>
              {index + 1}. TUR · {mmss(plan[index])}
            </Txt>
            <View style={{ alignItems: "center", justifyContent: "center", marginVertical: 6 }}>
              <Ring
                progress={1 - left / Math.max(1, plan[index])}
                size={190}
                stroke={10}
                color={left <= 10 ? colors.danger : colors.accent}
              />
              <View style={StyleSheet.absoluteFill as object}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Txt style={[styles.timer, left <= 10 && { color: colors.danger }]}>{mmss(left)}</Txt>
                </View>
              </View>
            </View>
            <Txt variant="title3" center style={styles.topicBig}>
              {topic}
            </Txt>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Wave active={dictation.listening} color={colors.accent} />
              <Txt variant="stat" color={colors.accentDark}>
                {liveWords}
              </Txt>
              <Txt variant="caption" color={colors.inkSoft}>
                kelime duyuldu
              </Txt>
            </View>
            {!!dictation.error && (
              <Txt variant="caption" color={colors.danger} center>
                {dictation.error}
              </Txt>
            )}
            <Txt variant="caption" color={colors.inkSoft} center>
              {dictation.listening ? "Dinliyorum — konuşmaya devam et" : "Mikrofon kapalı"}
            </Txt>
            <Button variant="secondary" size="md" label="Turu erken bitir" onPress={() => finishRound(index)} style={{ alignSelf: "stretch" }} />
          </Surface>
        )}

        {stage === "arada" && index + 1 < plan.length && (
          <Surface raised style={styles.stageCard}>
            <Txt variant="overline" color={colors.inkSoft}>
              TUR BİTTİ
            </Txt>
            <Txt style={styles.bigNumber}>{rounds[rounds.length - 1]?.wpm ?? 0}</Txt>
            <Txt variant="caption" color={colors.inkSoft}>
              kelime / dakika
            </Txt>
            <Txt variant="callout" color={colors.inkSoft} center>
              Şimdi <Txt variant="callout" style={{ fontWeight: "800" }}>aynı şeyi</Txt> tekrar anlat — ama bu sefer{" "}
              {mmss(plan[index + 1])} içinde. Yeni şey ekleme, aynı hikâyeyi daha hızlı akıt.
            </Txt>
            <Button
              icon="arrowRight"
              label={`${index + 2}. tura başla (${mmss(plan[index + 1])})`}
              onPress={() => startRound(afterRound(index, plan.length).next ?? index)}
              style={{ alignSelf: "stretch", marginTop: 8 }}
            />
          </Surface>
        )}

        {stage === "sonuc" && (
          <>
            <Surface raised style={{ gap: 12 }}>
              <SectionLabel title="Sonuç" style={{ marginBottom: 0 }} />
              {rounds.map((r, i) => (
                <View key={i} style={styles.barRow}>
                  <Txt variant="caption" color={colors.inkSoft} style={styles.barLabel}>
                    {mmss(r.seconds)}
                  </Txt>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.round((r.wpm / maxWpm) * 100)}%` }]} />
                  </View>
                  <Txt variant="headline" style={styles.barValue}>
                    {r.wpm}
                  </Txt>
                </View>
              ))}
              <Txt variant="caption" color={colors.inkFaint} style={{ textAlign: "right" }}>
                kelime / dakika
              </Txt>
              <Txt variant="body" color={outcome.measured ? colors.ink : colors.inkSoft}>
                {outcome.message}
              </Txt>
              <Txt variant="caption" color={colors.inkFaint}>
                Sayılar telefonun ses tanımasının DUYDUĞU kelimelerdir; kelime yutabilir. Üç turda da aynı
                yönde yanıldığı için turlar arası karşılaştırma yine de anlamlıdır — mutlak hız değil, kendi
                kendine göre hızlanma ölçülüyor.
              </Txt>
            </Surface>
            <Button icon={saved ? "check" : undefined} label={saved ? "Kaydedildi" : "Kaydet"} disabled={saved} onPress={() => void save()} />
            <Button variant="secondary" size="md" label="Yeni konu" onPress={() => setStage("konu")} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    scroll: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 48, gap: 16 },
    planChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    customRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    input: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
      color: c.ink,
      fontFamily: "Manrope",
      fontSize: 15,
    },
    stageCard: { alignItems: "center", gap: 10, paddingVertical: 24 },
    timer: {
      fontFamily: "Fraunces",
      fontWeight: "600",
      fontSize: 52,
      lineHeight: 60,
      color: c.ink,
      textAlign: "center",
      fontVariant: ["tabular-nums"],
    },
    topicBig: { writingDirection: isRtl(getActivePack().script) ? "rtl" : "ltr" },
    bigNumber: { fontFamily: "Fraunces", fontWeight: "600", fontSize: 56, lineHeight: 64, color: c.accent, textAlign: "center" },
    barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    barLabel: { width: 44, fontVariant: ["tabular-nums"] },
    barTrack: { flex: 1, height: 22, borderRadius: 11, backgroundColor: c.bgAlt, overflow: "hidden" },
    barFill: { height: "100%", backgroundColor: c.accent, borderRadius: 11 },
    barValue: { width: 40, textAlign: "right", fontVariant: ["tabular-nums"] },
  });
}
