import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Header from "../components/Header";
import Icon from "../components/Icon";
import { Bar, Empty, Ring, StarPattern, Surface, TeacherAvatar, Txt } from "../components/kit";
import { averageQuality, lessonFindings } from "../lessonquality";
import type { LessonQuality, QualityFinding } from "../lessonquality";
import { loadLessonQuality } from "../storage";
import { getActivePack } from "../languages";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
import { Profile } from "../types";

interface Props {
  profile: Profile;
  onBack: () => void;
}

/**
 * Seviye raporu.
 *
 * Hoca değerlendirme sırasında güçlü/zayıf yönleri ve bir özet yazıyor; bunlar
 * her derse hafıza olarak besleniyordu ama öğrenciye hiç gösterilmiyordu —
 * panelde yalnızca iki harf vardı. Öğrencinin nerede olduğunu görebileceği
 * yer burası.
 */
export default function LevelScreen({ profile, onBack }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const pack = getActivePack();
  const a = profile.assessment;
  const curriculum = profile.curriculum;
  const done = curriculum
    ? curriculum.modules.filter((m) => profile.completedModuleIds.includes(m.id)).length
    : 0;
  const total = curriculum?.modules.length ?? 0;

  const trackStat = (track: "konusma" | "okuma") => {
    const mods = curriculum?.modules.filter((m) => m.track === track) ?? [];
    const d = mods.filter((m) => profile.completedModuleIds.includes(m.id)).length;
    return { d, t: mods.length };
  };
  const konusma = trackStat("konusma");
  const okuma = trackStat("okuma");

  /**
   * HOCANIN KARNESİ.
   *
   * Uygulamadaki her ölçüm öğrenciye bakıyordu; hocaya hiç bakılmıyordu.
   * Oysa uygulamanın tamamı "model iyi ders anlatıyor" varsayımına dayanıyor.
   * Burası o varsayımı öğrencinin de görebildiği tek yer — hoca kendi
   * karnesini düzeltemesin diye ölçüm cihazda yapılıyor, modele sorulmuyor.
   */
  const [quality, setQuality] = useState<LessonQuality | null>(null);
  useEffect(() => {
    void loadLessonQuality().then((list) => setQuality(averageQuality(list)));
  }, []);
  const findings: QualityFinding[] = quality
    ? lessonFindings(quality, a?.speakingLevel ?? "A0")
    : [];

  const levelCard = (track: "konusma" | "okuma", value: string, st: { d: number; t: number }) => (
    <Surface raised style={{ flex: 1, alignItems: "center", gap: 6, paddingVertical: 20 }}>
      <Ring progress={st.t ? st.d / st.t : 0} size={74} stroke={6} label={value} />
      <Txt variant="headline" style={{ fontSize: 15 }}>
        {pack.tracks[track].short}
      </Txt>
      <Txt variant="caption" color={colors.inkSoft}>
        {st.d}/{st.t} modül
      </Txt>
    </Surface>
  );

  const markFor = (lvl: QualityFinding["level"]) =>
    lvl === "iyi"
      ? { icon: "check" as const, color: colors.accentDark }
      : lvl === "dikkat"
        ? { icon: "alert" as const, color: colors.gold }
        : { icon: "close" as const, color: colors.danger };

  return (
    <View style={styles.container}>
      <Header
        title="Seviye Raporu"
        subtitle={`${pack.label} · ${pack.teacherName}'ın değerlendirmesi`}
        onBack={onBack}
      />
      {!a ? (
        <Empty
          icon="chart"
          title="Henüz değerlendirme yok"
          text={`Sıfırdan başlıyorsun. ${pack.teacherName} seni derslerde tanıdıkça seviyeni kendisi günceller; raporun burada oluşacak.`}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {levelCard("konusma", a.speakingLevel, konusma)}
            {levelCard("okuma", a.readingLevel, okuma)}
          </View>

          {a.summary ? (
            <View style={styles.summaryCard}>
              <StarPattern width="100%" height="100%" color={colors.goldDeep} opacity={0.08} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <TeacherAvatar size={36} />
                <Txt variant="overline" color={colors.goldDeep}>
                  {`${pack.teacherName.toLocaleUpperCase("tr-TR")} NE DİYOR`}
                </Txt>
              </View>
              <Txt variant="title3" color={colors.onDeep} style={{ marginTop: 12, fontWeight: "500" }}>
                {a.summary}
              </Txt>
            </View>
          ) : null}

          {a.strengths?.length > 0 && (
            <Surface style={{ gap: 10 }}>
              <Txt variant="headline" color={colors.accentDark} style={{ fontSize: 15 }}>
                Güçlü yönlerin
              </Txt>
              {a.strengths.map((x, i) => (
                <View key={i} style={styles.listRow}>
                  <Icon name="check" size={17} color={colors.accentDark} strokeWidth={2.6} />
                  <Txt variant="callout" style={{ flex: 1 }}>
                    {x}
                  </Txt>
                </View>
              ))}
            </Surface>
          )}

          {a.weaknesses?.length > 0 && (
            <Surface style={{ gap: 10 }}>
              <Txt variant="headline" color={colors.gold} style={{ fontSize: 15 }}>
                Üzerinde çalışılacaklar
              </Txt>
              {a.weaknesses.map((w, i) => (
                <View key={i} style={styles.listRow}>
                  <Icon name="arrowRight" size={17} color={colors.gold} strokeWidth={2.4} />
                  <Txt variant="callout" style={{ flex: 1 }}>
                    {w}
                  </Txt>
                </View>
              ))}
              <Txt variant="caption" color={colors.inkFaint}>
                {pack.teacherName} bunları derslere doğal biçimde serpiştiriyor; düzeldikçe
                listeden düşüyorlar.
              </Txt>
            </Surface>
          )}

          {findings.length > 0 && (
            <Surface style={{ gap: 10 }}>
              <Txt variant="headline" style={{ fontSize: 15 }}>
                {pack.teacherName} nasıl ders veriyor
              </Txt>
              {findings.map((f) => {
                const mk = markFor(f.level);
                return (
                  <View key={f.key} style={styles.listRow}>
                    <Icon name={mk.icon} size={17} color={mk.color} strokeWidth={2.4} />
                    <Txt variant="callout" style={{ flex: 1 }}>
                      {f.text}
                    </Txt>
                  </View>
                );
              })}
              <Txt variant="caption" color={colors.inkFaint}>
                Son {"\u00A0"}derslerin ortalaması; cihazda hesaplanır, hiçbir yere
                gönderilmez. Latin alfabeli dillerde Türkçe/hedef dil ayrımı tahminîdir,
                sayılar YAKLAŞIKTIR. {pack.teacherName} bu ölçümü her derste görüp
                kendini düzeltir.
              </Txt>
            </Surface>
          )}

          {total > 0 && (
            <Surface style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Txt variant="callout" color={colors.inkSoft}>
                  Müfredat ilerlemesi
                </Txt>
                <Txt variant="headline" style={{ fontSize: 15 }}>
                  {done}/{total} modül
                </Txt>
              </View>
              <Bar progress={done / total} height={8} />
            </Surface>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 40, gap: 14 },
    summaryCard: { backgroundColor: colors.deep, borderRadius: 26, padding: 20, overflow: "hidden" },
    listRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  });
}
