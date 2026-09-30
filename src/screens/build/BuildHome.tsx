/**
 * Cümle Kurma ANA EKRANI: sıradaki kalıp (kısa kontrol listesiyle),
 * uygunluğa göre sıralı hikâyeler, kayıtlı setler (devam / tek seferde /
 * pratik) ve — tekrar sistemi hazır olduğunda — "Tekrar zamanı".
 */
import React from "react";
import { ScrollView, View } from "react-native";
import Icon from "../../components/Icon";
import {
  Badge,
  Bar,
  Button,
  Chip,
  ListGroup,
  ListRow,
  PressableScale,
  SectionLabel,
  StarPattern,
  Txt,
} from "../../components/kit";
import type { PatternProgress } from "../../buildmastery";
import type { Band, BuildSet, Pattern, Theme } from "../../sentencebuilding";
import { patternById, themeById } from "../../sentencebuilding";
import type { CheckItem } from "./helpers";
import { useBuildStyles } from "./ui";

export type SetAction = "open" | "next" | "oneshot" | "practice";

export default function BuildHome({
  focus,
  progress,
  checklist,
  ladder,
  themes,
  sets,
  nextEpisode,
  fastFlow,
  reviewDue,
  onReview,
  onToggleFast,
  onTheme,
  onSet,
}: {
  focus: Pattern;
  progress?: PatternProgress;
  checklist: CheckItem[];
  ladder: { band: Band; done: number; total: number }[];
  /** Uygunluğa göre sıralı; fit=false olanlar soluk ve sonda. */
  themes: { theme: Theme; fit: boolean; saved: boolean }[];
  sets: BuildSet[];
  nextEpisode: (s: BuildSet) => number;
  fastFlow: boolean;
  /** Vadesi gelen tekrar sayısı; onReview yoksa bölüm hiç görünmez. */
  reviewDue: number;
  onReview?: () => void;
  onToggleFast: () => void;
  onTheme: (t: Theme) => void;
  onSet: (s: BuildSet, a: SetAction) => void;
}) {
  const { s, c } = useBuildStyles();
  const keys = progress?.proofKeys.length ?? 0;
  const learn = progress?.learn;
  const acc = learn && learn.attempts >= 5 ? Math.round((learn.firstTryOk / learn.attempts) * 100) : null;
  const good = themes.filter((t) => t.fit);
  const rest = themes.filter((t) => !t.fit);
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Txt variant="callout" color={c.inkSoft} style={{ marginBottom: 16 }}>
        Türkçe bir cümle gelir; bağlacı bulur, yüklemden başlar, fiile sorular sorarak parça parça kurarsın. Her adımda
        cümlenin tamamını SESLİ söyle.
      </Txt>

      {onReview && reviewDue > 0 && (
        <View style={{ marginBottom: 14 }}>
          <ListGroup>
            <ListRow icon="repeat" tone="gold" title={`Tekrar zamanı (${reviewDue})`} subtitle="Kurduğun cümleler, tek seferde" onPress={onReview} />
          </ListGroup>
        </View>
      )}

      <View style={[s.deepCard, { marginBottom: 14 }]}>
        <StarPattern width="100%" height="100%" color={c.goldDeep} opacity={0.09} />
        <Txt variant="overline" color={c.goldDeep}>
          {`SIRADAKİ KALIP · ${focus.band}`}
        </Txt>
        <Txt variant="title2" color={c.onDeep} style={{ marginTop: 6 }}>
          {focus.title}
        </Txt>
        <Txt variant="callout" color={c.onDeepSoft} style={{ marginTop: 6 }}>
          {focus.trigger ? `"${focus.trigger}"${focus.question ? ` · hocanın sorusu: ${focus.question}` : ""}` : focus.concept}
        </Txt>
        <Bar progress={keys / 12} color={c.goldDeep} track={c.onDeepTrack} style={{ marginTop: 16 }} />
        <View style={[s.wrap, { marginTop: 12, gap: 6 }]}>
          {checklist.map((it) => (
            <View key={it.label} style={[s.row, { gap: 4, marginRight: 8 }]}>
              <Icon name={it.ok ? "check" : "close"} size={13} color={it.ok ? c.goldDeep : c.onDeepSoft} strokeWidth={2.6} />
              <Txt variant="caption" color={it.ok ? c.goldDeep : c.onDeepSoft}>
                {it.label}
              </Txt>
            </View>
          ))}
        </View>
        <Txt variant="caption" color={c.onDeepSoft} style={{ marginTop: 8 }}>
          {`Yardımsız söylediğin farklı cümleler sayılır${acc !== null ? ` · öğrenme isabeti %${acc}` : ""} · oturması için %85`}
        </Txt>
      </View>

      <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
        {ladder.map((b) => (
          <View
            key={b.band}
            style={{ flex: 1, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingVertical: 9, alignItems: "center", gap: 2 }}
          >
            <Txt variant="overline" color={c.inkSoft} style={{ fontSize: 10 }}>
              {b.band}
            </Txt>
            <Txt variant="headline" style={{ fontSize: 13.5 }}>
              {`${b.done}/${b.total}`}
            </Txt>
          </View>
        ))}
      </View>

      <PressableScale onPress={onToggleFast} accessibilityLabel="Hızlı akış" haptic={false} style={{ marginBottom: 22 }}>
        <View style={[s.row, { paddingVertical: 4 }]}>
          <Icon name="zap" size={16} color={fastFlow ? c.accentDark : c.inkFaint} />
          <Txt variant="caption" color={c.inkSoft} style={{ flex: 1 }}>
            {`Hızlı akış: ${fastFlow ? "açık" : "kapalı"} — doğru cevaptan sonra okunacak yeni bir şey yoksa kendiliğinden geçer.`}
          </Txt>
        </View>
      </PressableScale>

      <SectionLabel title="Hikâye seç" />
      <ListGroup>
        {good.map(({ theme, saved }) => (
          <ListRow
            key={theme.id}
            icon="bookOpen"
            tone="gold"
            title={theme.title}
            subtitle={theme.arc}
            onPress={() => onTheme(theme)}
            right={saved ? <Badge text="hazır" tone="accent" /> : undefined}
          />
        ))}
      </ListGroup>
      {rest.length > 0 && (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Txt variant="caption" color={c.inkFaint}>
            Bu kalıba daha az uyan hikâyeler (yine seçilebilir):
          </Txt>
          <View style={[s.wrap, { opacity: 0.6 }]}>
            {rest.map(({ theme }) => (
              <Chip key={theme.id} icon="bookOpen" label={theme.title} onPress={() => onTheme(theme)} />
            ))}
          </View>
        </View>
      )}

      {sets.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <SectionLabel title="Kayıtlı setler · bedava tekrar" />
          <View style={{ gap: 10 }}>
            {sets.slice(0, 6).map((x) => {
              const th = themeById(x.themeId);
              const pt = patternById(x.patternId.replace(/^karma:/, "").split("+")[0]);
              const ready = x.sentences.filter((z) => z.status === "ready").length;
              return (
                <View key={x.id} style={{ backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
                  <ListRow
                    icon="repeat"
                    tone="neutral"
                    title={`${th?.title ?? x.themeId} · ${pt?.title ?? x.patternId}`}
                    subtitle={`Bölüm ${x.episode} · ${ready} cümle`}
                    onPress={() => onSet(x, "open")}
                  />
                  <View style={[s.row, { paddingHorizontal: 14, paddingBottom: 12, flexWrap: "wrap" }]}>
                    <Button size="sm" variant="secondary" icon="plus" label={`Devam (Bölüm ${nextEpisode(x)})`} onPress={() => onSet(x, "next")} />
                    <Button size="sm" variant="secondary" icon="target" label="Tek seferde tekrar" onPress={() => onSet(x, "oneshot")} />
                    <Button size="sm" variant="ghost" label="Pratik (sayılmaz)" onPress={() => onSet(x, "practice")} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
