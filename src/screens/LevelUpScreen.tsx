import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AgentContext, TEACHER_TOOLS } from "../agent";
import Header from "../components/Header";
import { Button, IconTile, Screen, StarPattern, Surface, TeacherAvatar, Txt } from "../components/kit";
import RichText from "../components/RichText";
import { agenticChat, generateCurriculum } from "../claude";
import { getActivePack } from "../languages";
import {
  KICKOFF_LEVELUP,
  levelUpSystem,
  memoryContext,
  negotiationContext,
  retentionDigest,
} from "../prompts";
import { fluencyTrend } from "../fluency";
import { progressDigest, readingPerformance } from "../progress";
import { COMPLIANCE_WARN } from "../reading";
import { loadStatsSummary } from "../statsStore";
import {
  loadFluency,
  loadMistakes,
  loadNotes,
  loadReadings,
  loadRepairSeen,
  loadVocab,
} from "../storage";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
import { Assessment, Curriculum, Profile } from "../types";
import { isRtl } from "../scripts";

interface Props {
  profile: Profile;
  onComplete: (assessment: Assessment, curriculum: Curriculum) => void;
  onBack: () => void;
}

type Stage = "judging" | "verdict" | "building" | "error";

/**
 * Seviye atlama.
 *
 * Müfredat tek seviye içindi: tüm modüller bitince akış duruyordu ve öğrenci
 * bir üst seviyeye geçemiyordu. Burada hoca önce objektif veriye (kelime
 * hatırlama, açık hatalar, tamamlanan modüller) bakıp karar veriyor, kararını
 * öğrenci görüyor, sonra yeni seviyenin müfredatı kuruluyor.
 */
export default function LevelUpScreen({ profile, onComplete, onBack }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const pack = getActivePack();
  const [stage, setStage] = useState<Stage>("judging");
  const [verdict, setVerdict] = useState("");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  /** Hocanın seviye_guncelle ile yazdığı yeni değerlendirme. */
  const updated = useRef<Profile>(profile);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        // Seviye kararının girdisi yalnız kelime tekrarı olmasın: cihazda
        // ölçülen anlama ve kulak verisi de hocanın önüne konur.
        const [mistakes, notes, vocab, stats, readings, fluency, repairSeen] =
          await Promise.all([
            loadMistakes(),
            loadNotes(),
            loadVocab(),
            loadStatsSummary(),
            loadReadings(),
            loadFluency(),
            loadRepairSeen(),
          ]);
        const ctx: AgentContext = { profile, profileChanged: false };
        const reply = await agenticChat(
          {
            stable: levelUpSystem(profile),
            dynamic:
              memoryContext(mistakes, notes) +
              retentionDigest(vocab) +
              progressDigest(
                stats,
                readingPerformance(readings, COMPLIANCE_WARN),
                fluencyTrend(fluency)
              ) +
              // Etkileşimsel yeterlilik CEFR konuşma tanımlayıcılarının
              // içindedir: onarım yapamayan öğrenci "akıcı" sayılmaz.
              // Seviye kararı bunu görmeden verilirse eksik verilir.
              negotiationContext(profile.assessment?.speakingLevel ?? "A0", repairSeen),
          },
          [{ role: "user", content: KICKOFF_LEVELUP }],
          ctx,
          { tools: TEACHER_TOOLS, maxRounds: 8, effort: "high" }
        );
        if (ctx.profileChanged) updated.current = ctx.profile;
        setVerdict(reply.text);
        setStage("verdict");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStage("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildNext = async () => {
    const assessment = updated.current.assessment;
    if (!assessment) {
      setError("Seviye bilgisi okunamadı.");
      setStage("error");
      return;
    }
    setStage("building");
    setError(null);
    try {
      const [mistakes, notes] = await Promise.all([loadMistakes(), loadNotes()]);
      const observations = [
        ...mistakes
          .filter((m) => !m.resolved)
          .slice(-8)
          .map((m) => `- [${m.topic}] "${m.mistake}" → "${m.correction}"`),
        ...notes.slice(-4).map((n) => `- ${n.note}`),
      ].join("\n");
      const curriculum = await generateCurriculum(
        updated.current,
        assessment,
        observations
      );
      if ((curriculum.modules?.length ?? 0) < 4) {
        throw new Error("Yeni müfredat beklenenden kısa geldi. Tekrar denemek genelde çözer.");
      }
      onComplete(assessment, curriculum);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  };

  const a = updated.current.assessment;
  const before = profile.assessment;
  const rose =
    a && before
      ? a.speakingLevel !== before.speakingLevel || a.readingLevel !== before.readingLevel
      : false;

  const levelBox = (label: string, from: string, to: string) => (
    <View style={styles.levelCard}>
      <StarPattern width="100%" height="100%" color={colors.goldDeep} opacity={0.08} />
      <Txt variant="caption" color={colors.onDeepSoft}>
        {label}
      </Txt>
      <Txt variant="title2" color={colors.goldDeep}>
        {`${from}${to !== from ? ` → ${to}` : ""}`}
      </Txt>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header
        title="Seviye Değerlendirmesi"
        subtitle={`${pack.teacherName} ilerlemene bakıyor`}
        onBack={stage === "judging" || stage === "building" ? undefined : onBack}
      />

      {stage === "judging" || stage === "building" ? (
        <View style={styles.center}>
          <TeacherAvatar size={80} speaking />
          <Txt variant="title3" center>
            {stage === "judging" ? `${pack.teacherName} verilerine bakıyor…` : "Yeni müfredatın hazırlanıyor…"}
          </Txt>
          <Txt variant="callout" color={colors.inkSoft} center>
            {stage === "judging"
              ? "Kelime hatırlama performansın, açık hataların ve bitirdiğin modüller inceleniyor."
              : "Bir üst seviye için 12-16 modül tasarlanıyor."}
          </Txt>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : stage === "error" ? (
        <View style={styles.center}>
          <IconTile icon="alert" tone="danger" size={56} />
          <Txt variant="title3" center>
            İşlem tamamlanamadı
          </Txt>
          <Txt variant="callout" color={colors.inkSoft} center selectable>
            {error}
          </Txt>
          <View style={{ alignSelf: "stretch", gap: 10, marginTop: 8 }}>
            <Button icon="refresh" label="Tekrar dene" onPress={() => void buildNext()} />
            <Button variant="secondary" size="md" label="Panele dön" onPress={onBack} />
          </View>
        </View>
      ) : (
        <Screen
          footer={
            <View style={{ gap: 10 }}>
              <Button icon="layers" label="Yeni müfredatı hazırla" onPress={() => void buildNext()} />
              <Button variant="ghost" size="md" label="Şimdi değil" onPress={onBack} />
            </View>
          }
        >
          {a && before && (
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
              {levelBox(pack.tracks.konusma.short, before.speakingLevel, a.speakingLevel)}
              {levelBox(pack.tracks.okuma.short, before.readingLevel, a.readingLevel)}
            </View>
          )}

          <Surface style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <TeacherAvatar size={32} ring={false} />
              <Txt variant="headline" style={{ fontSize: 15 }}>
                {pack.teacherName}'ın kararı
              </Txt>
            </View>
            <RichText content={verdict} style={styles.verdictText} scaleScript={isRtl(pack.script)} />
          </Surface>

          <Txt variant="caption" color={colors.inkSoft}>
            {rose
              ? "Yeni seviyene göre müfredatın baştan kurulacak; kelime defterin, hata defterin ve hoca hafızan aynen kalır."
              : "Seviyen aynı kalsa da yeni müfredat, eksik kalan yerlere odaklanacak şekilde kurulacak."}
          </Txt>
        </Screen>
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
    levelCard: {
      flex: 1,
      backgroundColor: colors.deep,
      borderRadius: 20,
      padding: 16,
      alignItems: "center",
      gap: 4,
      overflow: "hidden",
    },
    verdictText: { fontFamily: "Manrope", fontWeight: "500", fontSize: 15.5, color: colors.ink, lineHeight: 24 },
  });
}
