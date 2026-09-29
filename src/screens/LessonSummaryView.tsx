import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import Svg, { Circle, Path, Polygon } from "react-native-svg";
import Icon from "../components/Icon";
import { Button, Surface, TargetText, Txt, useInsets } from "../components/kit";
import { getActivePack } from "../languages";
import { summarizeLesson } from "../lessonsummary";
import type { LessonSummaryData } from "../lessonsummary";
import { loadMistakes, loadVocab } from "../storage";
import { useTheme } from "../useTheme";
import type { ChatMessage, CurriculumModule } from "../types";

/** Sekiz köşeli mühür — dersin kapandığı an. */
function Seal({ color, gold }: { color: string; gold: string }) {
  return (
    <Svg width={88} height={88} viewBox="0 0 84 84">
      <Polygon points="24,24 60,24 60,60 24,60" fill={color} />
      <Polygon points="42,16.5 67.5,42 42,67.5 16.5,42" fill={color} />
      <Circle cx={42} cy={42} r={19} fill="none" stroke={gold} strokeWidth={2} />
      <Path d="M34 42.5l5.5 5.5L51 36.5" fill="none" stroke={gold} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * DERS SONU — onay kutusu yerine dersin özeti. Öğrenci ne yaptığını
 * görür, sonra modülü kapatır ya da derse döner.
 */
export default function LessonSummaryView({
  module,
  messages,
  since,
  onFinish,
  onContinue,
}: {
  module: CurriculumModule;
  messages: ChatMessage[];
  /** Oturumun başladığı an (ISO) — bu andan sonraki kayıtlar sayılır. */
  since: string;
  onFinish: () => void;
  onContinue: () => void;
}) {
  const c = useTheme();
  const insets = useInsets();
  const pack = getActivePack();
  const [data, setData] = useState<LessonSummaryData | null>(null);

  useEffect(() => {
    void (async () => {
      const [vocab, mistakes] = await Promise.all([loadVocab(), loadMistakes()]);
      setData(summarizeLesson(messages, pack.script, since, vocab, mistakes));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats: { v: string; l: string }[] = data
    ? [
        { v: String(data.spokenTurns), l: "kez sesle konuştun" },
        data.targetTurns !== null
          ? { v: String(data.targetTurns), l: `kez ${pack.label.toLocaleLowerCase("tr-TR")} cevap` }
          : { v: String(data.studentTurns), l: "cevap verdin" },
        { v: String(data.newWords.length), l: "yeni kelime" },
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 36, paddingHorizontal: 20, paddingBottom: 24, gap: 18 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <Seal color={c.accent} gold={c.goldDeep} />
          <Txt variant="display" center accessibilityRole="header">
            Ders tamam
          </Txt>
          <Txt variant="callout" color={c.inkSoft} center>
            {module.title} · {module.level}
          </Txt>
        </View>

        {data && (
          <View style={{ flexDirection: "row", gap: 10 }}>
            {stats.map((s) => (
              <Surface key={s.l} style={{ flex: 1, padding: 14, gap: 2 }}>
                <Txt variant="stat">{s.v}</Txt>
                <Txt variant="caption" color={c.inkSoft}>
                  {s.l}
                </Txt>
              </Surface>
            ))}
          </View>
        )}

        {data && data.spokenTurns === 0 && (
          <Surface tone="gold" style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Icon name="mic" size={22} color={c.gold} />
            <Txt variant="callout" style={{ flex: 1 }}>
              Bu derste hiç sesle cevap vermedin. Bir dahakinde sesli dersi dene — konuşmak ancak konuşarak gelişir.
            </Txt>
          </Surface>
        )}

        {data && data.corrections.length > 0 && (
          <Surface style={{ gap: 12 }}>
            <Txt variant="headline" style={{ fontSize: 15 }}>
              Bir dahaki sefere
            </Txt>
            {data.corrections.map((x, i) => (
              <View key={i} style={{ gap: 3, paddingTop: i > 0 ? 12 : 0, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.line }}>
                <Txt variant="callout" color={c.danger} style={{ textDecorationLine: "line-through" }}>
                  {x.mistake}
                </Txt>
                <Txt variant="bodyStrong" color={c.accentDark}>
                  {x.correction}
                </Txt>
                <Txt variant="caption" color={c.inkSoft}>
                  {x.explanation}
                </Txt>
              </View>
            ))}
          </Surface>
        )}

        {data && data.newWords.length > 0 && (
          <Surface style={{ gap: 10 }}>
            <Txt variant="headline" style={{ fontSize: 15 }}>
              Deftere girenler
            </Txt>
            {data.newWords.slice(0, 8).map((w, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Txt variant="callout" style={{ flex: 1 }}>
                  {w.tr}
                </Txt>
                <TargetText size={19}>{w.target}</TargetText>
              </View>
            ))}
            <Txt variant="caption" color={c.inkSoft}>
              Hepsi kelime defterinde — tekrarları hocan planlıyor.
            </Txt>
          </Surface>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 + insets.bottom, gap: 10 }}>
        <Button icon="check" label="Dersi tamamla" onPress={onFinish} />
        <Button variant="secondary" size="md" label="Derse devam et" onPress={onContinue} />
      </View>
    </View>
  );
}
