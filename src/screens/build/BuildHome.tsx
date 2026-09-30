/**
 * Cümle Kurma ANA EKRANI (tasarım §3 Home): "Tekrar zamanı (n)",
 * yerleştirme teklifi, sıradaki kalıp (öğren / doğrula / karma) ve oturma
 * kontrol listesi, kalıp merdiveni, ayarlar (hızlı akış, hareke, video
 * sırası, günlük dil), uygunluğa göre sıralı hikâyeler ve kayıtlı setler
 * (devam / tek seferde / pratik).
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
  Surface,
  Txt,
} from "../../components/kit";
import type { Focus, PatternProgress } from "../../buildmastery";
import type { Band, BuildSet, Theme } from "../../sentencebuilding";
import { patternById, themeById } from "../../sentencebuilding";
import type { CheckItem } from "./helpers";
import { useBuildStyles } from "./ui";

export type SetAction = "open" | "next" | "oneshot" | "practice";

/** Odak türüne göre kartın üst satırı. */
function focusOverline(f: Focus): string {
  const band = f.patterns[0]?.band ?? "";
  switch (f.kind) {
    case "verify":
      return `TEKRAR DOĞRULA · ${band}`;
    case "slipping":
      return `SOLUYOR · ${band}`;
    case "override":
      return `SEÇTİĞİN KALIP · ${band}`;
    case "karma":
      return "MERDİVEN BİTTİ · KARMA";
    default:
      return `SIRADAKİ KALIP · ${band}`;
  }
}

export default function BuildHome({
  focus,
  progress,
  checklist,
  ladder,
  themes,
  sets,
  nextEpisode,
  settings,
  reviewDue,
  onReview,
  onTheme,
  onSet,
  placement,
  newSteps,
  otherTheme,
  onLadder,
  onClearOverride,
  onVerify,
}: {
  focus: Focus;
  progress?: PatternProgress;
  checklist: CheckItem[];
  ladder: { band: Band; done: number; total: number }[];
  /** Uygunluğa göre sıralı; fit=false olanlar soluk ve sonda. */
  themes: { theme: Theme; fit: boolean; saved: boolean }[];
  sets: BuildSet[];
  nextEpisode: (s: BuildSet) => number;
  /** Katlanır ayarlar bölümü (BuildSettings); merdivenle hikâyeler arasında. */
  settings?: React.ReactNode;
  /** Vadesi gelen tekrar sayısı; onReview yoksa bölüm hiç görünmez. */
  reviewDue: number;
  onReview?: () => void;
  onTheme: (t: Theme) => void;
  onSet: (s: BuildSet, a: SetAction) => void;
  /** Konuşma seviyesi A2+ ve ilerleme yok: yerleştirme teklifi. */
  placement?: { band: Band; onStart: () => void; onSkip: () => void } | null;
  /** Geçilmiş kalıpların altına eklenen yeni basamaklar: kısa yoklama. */
  newSteps?: { count: number; onStart: () => void } | null;
  /** Ölçüt (b): kalıbı başka bir temada dene (tek dokunuş). */
  otherTheme?: { title: string; onPress: () => void } | null;
  onLadder: () => void;
  onClearOverride?: () => void;
  /** Doğrulanacak kalıp: kayıtlı cümlelerinden tek seferde tekrar. */
  onVerify?: () => void;
}) {
  const { s, c } = useBuildStyles();
  const main = focus.patterns[0];
  const karma = focus.kind === "karma";
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

      {placement && (
        <Surface raised style={{ marginBottom: 14, gap: 8 }}>
          <Txt variant="overline" color={c.gold}>
            {`YERLEŞTİRME · ${placement.band}`}
          </Txt>
          <Txt variant="headline">Bildiğin kalıpları baştan çalışma</Txt>
          <Txt variant="callout" color={c.inkSoft}>
            Konuşma seviyen {placement.band}. Merdivenin kalıplarından ikişer kısa cümle, her biri tek seferde: geçtiklerin
            atlanır ve birkaç gün sonra bir tekrarla doğrulanır; ilk takıldığın kalıptan başlarsın.
          </Txt>
          <View style={[s.row, { marginTop: 6, flexWrap: "wrap" }]}>
            <Button size="sm" icon="target" label="Yerleştirmeyi başlat" onPress={placement.onStart} />
            <Button size="sm" variant="ghost" label="Baştan başlayacağım" onPress={placement.onSkip} />
          </View>
        </Surface>
      )}

      <View style={[s.deepCard, { marginBottom: 14 }]}>
        <StarPattern width="100%" height="100%" color={c.goldDeep} opacity={0.09} />
        <Txt variant="overline" color={c.goldDeep}>
          {focusOverline(focus)}
        </Txt>
        <Txt variant="title2" color={c.onDeep} style={{ marginTop: 6 }}>
          {karma ? focus.patterns.map((p) => p.title).join(" + ") : main.title}
        </Txt>
        <Txt variant="callout" color={c.onDeepSoft} style={{ marginTop: 6 }}>
          {karma
            ? "Oturmuş kalıpların tek hikâyede buluşuyor: her cümle en az ikisini bir bağlaçla birleştirir."
            : focus.kind === "verify"
              ? "Bu kalıbı geçtin; kalıcı olduğunu bir tekrarla doğrulayalım (tek seferde)."
              : focus.kind === "slipping"
                ? "Son tekrarda takıldın: bu kalıbı tek seferde yeniden kanıtla."
                : main.trigger
                  ? `"${main.trigger}"${main.question ? ` · hocanın sorusu: ${main.question}` : ""}`
                  : main.concept}
        </Txt>
        {!karma && <Bar progress={Math.min(1, keys / 12)} color={c.goldDeep} track={c.onDeepTrack} style={{ marginTop: 16 }} />}
        <View style={[s.wrap, { marginTop: 12, gap: 6 }]} accessibilityLabel={`Oturma: ${checklist.map((it) => `${it.label} ${it.ok ? "tamam" : "eksik"}`).join(", ")}`}>
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
        {(onVerify || otherTheme || onClearOverride) && (
          <View style={[s.row, { marginTop: 14, flexWrap: "wrap" }]}>
            {onVerify ? <Button size="sm" variant="gold" icon="target" label="Doğrula (tek seferde)" onPress={onVerify} /> : null}
            {otherTheme ? (
              <Button size="sm" variant="secondary" icon="bookOpen" label={`Başka bir temada dene: ${otherTheme.title}`} onPress={otherTheme.onPress} />
            ) : null}
            {onClearOverride ? <Button size="sm" variant="ghost" label="Merdivene dön" onPress={onClearOverride} /> : null}
          </View>
        )}
      </View>

      {newSteps && newSteps.count > 0 && (
        <View style={{ marginBottom: 14 }}>
          <ListGroup>
            <ListRow
              icon="sparkles"
              tone="info"
              title={`Yeni basamaklar (${newSteps.count})`}
              subtitle="Geçtiğin kalıpların arasına eklendi: ikişer cümleyle yokla, bildiklerini geç"
              onPress={newSteps.onStart}
            />
          </ListGroup>
        </View>
      )}

      <PressableScale onPress={onLadder} accessibilityLabel="Kalıp merdiveni" style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
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
      </PressableScale>
      <Button size="sm" variant="ghost" icon="chart" label="Kalıp merdiveni: istediğini seç ya da sına ve geç" onPress={onLadder} style={{ marginBottom: 14, alignSelf: "flex-start" }} />

      {settings ?? <View style={{ height: 8 }} />}

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
