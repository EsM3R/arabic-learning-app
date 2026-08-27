import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AgentContext, TEACHER_TOOLS } from "../agent";
import Header from "../components/Header";
import RichText from "../components/RichText";
import { agenticChat, generateCurriculum } from "../claude";
import { getActivePack } from "../languages";
import {
  KICKOFF_LEVELUP,
  levelUpSystem,
  memoryContext,
  retentionDigest,
} from "../prompts";
import { loadMistakes, loadNotes, loadVocab } from "../storage";
import { colors, radius, shadow, shadowLift } from "../theme";
import { Assessment, Curriculum, Profile } from "../types";

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
        const [mistakes, notes, vocab] = await Promise.all([
          loadMistakes(),
          loadNotes(),
          loadVocab(),
        ]);
        const ctx: AgentContext = { profile, profileChanged: false };
        const reply = await agenticChat(
          {
            stable: levelUpSystem(profile),
            dynamic: memoryContext(mistakes, notes) + retentionDigest(vocab),
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

  return (
    <View style={styles.container}>
      <Header
        title="Seviye Değerlendirmesi"
        subtitle={`${pack.teacherName} ilerlemene bakıyor`}
        onBack={stage === "judging" || stage === "building" ? undefined : onBack}
      />

      {stage === "judging" || stage === "building" ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.busyTitle}>
            {stage === "judging"
              ? `${pack.teacherName} verilerine bakıyor…`
              : "Yeni müfredatın hazırlanıyor…"}
          </Text>
          <Text style={styles.busySub}>
            {stage === "judging"
              ? "Kelime hatırlama performansın, açık hataların ve bitirdiğin modüller inceleniyor."
              : "Bir üst seviye için 12-16 modül tasarlanıyor."}
          </Text>
        </View>
      ) : stage === "error" ? (
        <View style={styles.center}>
          <Text style={styles.errEmoji}>😕</Text>
          <Text style={styles.busyTitle}>İşlem tamamlanamadı</Text>
          <Text style={styles.errText} selectable>
            {error}
          </Text>
          <TouchableOpacity style={styles.primary} onPress={() => void buildNext()}>
            <Text style={styles.primaryText}>Tekrar dene</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onBack}>
            <Text style={styles.secondaryText}>Panele dön</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {a && before && (
            <View style={styles.levelRow}>
              <View style={styles.levelCard}>
                <Text style={styles.levelLabel}>{pack.tracks.konusma.short}</Text>
                <Text style={styles.levelValue}>
                  {before.speakingLevel}
                  {a.speakingLevel !== before.speakingLevel ? ` → ${a.speakingLevel}` : ""}
                </Text>
              </View>
              <View style={styles.levelCard}>
                <Text style={styles.levelLabel}>{pack.tracks.okuma.short}</Text>
                <Text style={styles.levelValue}>
                  {before.readingLevel}
                  {a.readingLevel !== before.readingLevel ? ` → ${a.readingLevel}` : ""}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.verdictCard}>
            <RichText content={verdict} style={styles.verdictText} scaleScript={pack.scriptExtract} />
          </View>

          <Text style={styles.note}>
            {rose
              ? "Yeni seviyene göre müfredatın baştan kurulacak; kelime defterin, hata defterin ve hoca hafızan aynen kalır."
              : "Seviyen aynı kalsa da yeni müfredat, eksik kalan yerlere odaklanacak şekilde kurulacak."}
          </Text>

          <TouchableOpacity style={styles.primary} onPress={() => void buildNext()} activeOpacity={0.85}>
            <Text style={styles.primaryText}>Yeni müfredatı hazırla</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onBack}>
            <Text style={styles.secondaryText}>Şimdi değil</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  busyTitle: { fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 4 },
  busySub: { fontSize: 13, color: colors.inkSoft, textAlign: "center", lineHeight: 19 },
  errEmoji: { fontSize: 40 },
  errText: { fontSize: 13, color: colors.inkSoft, textAlign: "center", lineHeight: 19 },
  body: { padding: 18, paddingBottom: 40 },
  levelRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  levelCard: {
    flex: 1,
    backgroundColor: colors.deep,
    borderRadius: radius.lg,
    padding: 14,
    alignItems: "center",
    ...shadow,
  },
  levelLabel: { fontSize: 12, color: colors.onDeepSoft, fontWeight: "700" },
  levelValue: { fontSize: 21, fontWeight: "800", color: colors.goldDeep, marginTop: 3 },
  verdictCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
    ...shadow,
  },
  verdictText: { fontSize: 15, color: colors.ink, lineHeight: 23 },
  note: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 19, marginBottom: 18 },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    ...shadowLift,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
});
