/**
 * SET GİRİŞİ — "Şimdi birinci cümlemizle başlayalım". Hikâyenin adı, zaman
 * çerçevesi ve cümlelerin yük eğrisi: kolay açılış, en yüklü zirve, sonda
 * her şeyi birleştiren son cümle. Öğrenci nereye gittiğini bilsin.
 */
import React from "react";
import { View } from "react-native";
import Icon from "../../components/Icon";
import { Badge, StarPattern, Txt } from "../../components/kit";
import type { BuildSet, Role, Theme } from "../../sentencebuilding";
import { roleLabel, stageIndex, tenseLabel } from "./helpers";
import { useBuildStyles } from "./ui";

/** Bir cümlenin rol noktası: zirve dağ, son cümle yıldız, ötekiler küçük nokta. */
function RoleDot({ role, index }: { role: Role; index: number }) {
  const { c } = useBuildStyles();
  const big = role === "peak" || role === "synthesis";
  return (
    <View
      accessibilityLabel={`${index + 1}. cümle: ${roleLabel(role)}`}
      style={{
        width: big ? 26 : 14,
        height: big ? 26 : 14,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: big ? c.goldSoft : c.accentSoft,
        borderWidth: 1.5,
        borderColor: big ? c.goldDeep : c.accent,
      }}
    >
      {role === "peak" ? <Icon name="mountain" size={14} color={c.gold} /> : null}
      {role === "synthesis" ? <Icon name="star" size={14} color={c.gold} /> : null}
    </View>
  );
}

export default function SetIntro({
  set,
  theme,
  patternTitle,
  mode,
}: {
  set: BuildSet;
  theme?: Theme;
  patternTitle: string;
  mode: "learn" | "review" | "practice";
}) {
  const { s, c } = useBuildStyles();
  const roles = set.plan.sentences.map((p) => p.role);
  const stages = theme?.stages ?? [];
  return (
    <View style={{ gap: 18 }}>
      <View style={s.deepCard}>
        <StarPattern width="100%" height="100%" color={c.goldDeep} opacity={0.09} />
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Txt variant="overline" color={c.goldDeep}>
            {`BÖLÜM ${set.episode} · ${set.level}`}
          </Txt>
          {mode !== "learn" && <Badge text={mode === "review" ? "tek seferde" : "pratik · sayılmaz"} tone="gold" />}
        </View>
        <Txt variant="title1" color={c.onDeep} style={{ marginTop: 8 }}>
          {theme?.title ?? set.themeId}
        </Txt>
        <Txt variant="callout" color={c.onDeepSoft} style={{ marginTop: 6 }}>
          {set.intro || patternTitle}
        </Txt>
        <Txt variant="caption" color={c.goldDeep} style={{ marginTop: 12 }}>
          {`Kalıp: ${patternTitle}`}
        </Txt>
      </View>

      <View style={{ gap: 10 }}>
        <Txt variant="overline" color={c.inkSoft}>
          HİKÂYENİN AKIŞI
        </Txt>
        {stages.length ? (
          // Sahneler zaman çizgisi; her sahnenin yanında ona düşen cümleler (zirve ve son cümle işaretli).
          <View>
            {stages.map((st, k) => {
              const mine = roles.map((r, i) => ({ r, i })).filter((x) => stageIndex(x.i, roles.length, stages.length) === k);
              const lastRow = k === stages.length - 1;
              return (
                <View key={`${st}-${k}`} style={{ flexDirection: "row", gap: 12, minHeight: 40 }}>
                  <View style={{ width: 14, alignItems: "center" }}>
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        marginTop: 4,
                        backgroundColor: mine.length ? c.accentSoft : c.bgAlt,
                        borderWidth: 1.5,
                        borderColor: mine.length ? c.accent : c.line,
                      }}
                    />
                    {!lastRow && <View style={{ flex: 1, width: 2, backgroundColor: c.line, marginTop: 2 }} />}
                  </View>
                  <View style={[s.row, { flex: 1, alignItems: "flex-start", justifyContent: "space-between", paddingBottom: 10 }]}>
                    <Txt variant="callout" color={mine.length ? c.ink : c.inkFaint} style={{ flex: 1, fontWeight: "600" }}>
                      {st}
                    </Txt>
                    <View style={[s.row, { gap: 4 }]}>
                      {mine.map(({ r, i }) => (
                        <RoleDot key={i} role={r} index={i} />
                      ))}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[s.row, { gap: 0 }]}>
            {roles.map((r, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={{ flex: 1, height: 2, backgroundColor: c.line }} />}
                <RoleDot role={r} index={i} />
              </React.Fragment>
            ))}
          </View>
        )}
        <View style={[s.wrap, { gap: 14 }]}>
          <Txt variant="caption" color={c.inkSoft}>
            {`${roles.length} cümle · kolay açılıştan başlar`}
          </Txt>
          {roles.includes("peak") && (
            <View style={[s.row, { gap: 4 }]}>
              <Icon name="mountain" size={13} color={c.gold} />
              <Txt variant="caption" color={c.inkSoft}>
                zirve: en yüklü cümle
              </Txt>
            </View>
          )}
          {roles.includes("synthesis") && (
            <View style={[s.row, { gap: 4 }]}>
              <Icon name="star" size={13} color={c.gold} />
              <Txt variant="caption" color={c.inkSoft}>
                son cümle: hepsini birleştirir
              </Txt>
            </View>
          )}
        </View>
      </View>

      <View style={s.row}>
        <Icon name="clock" size={16} color={c.inkSoft} />
        <Txt variant="callout" color={c.inkSoft} style={{ flex: 1 }}>
          {tenseLabel(set.tense)}
        </Txt>
      </View>
      <Txt variant="title3">Şimdi birinci cümlemizle başlayalım.</Txt>
    </View>
  );
}
