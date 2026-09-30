/**
 * Cümle Kurma kartlarının ortak parçaları: Türkçe cümle başlığı (o anki
 * parça vurgulu), cümle şeridi, hocanın sözlü işareti (etiket çipi), not,
 * karşıtlık kutusu ve tam zamanında lamba.
 *
 * Renk ve yazı yalnız kit ve tema jetonlarıyla; stiller palet fonksiyonu.
 */
import React, { createContext, useContext, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Icon from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { Txt } from "../../components/kit";
import { ltrLine } from "../../richtext";
import type { Palette } from "../../theme";
import { useTheme } from "../../useTheme";

export function makeBuildStyles(colors: Palette) {
  return StyleSheet.create({
    segments: { flexDirection: "row", gap: 4, marginBottom: 18 },
    segment: { flex: 1, height: 4, borderRadius: 2 },
    labelChip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.goldSoft,
      borderRadius: 14,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    questionChip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accentSoft,
      borderRadius: 14,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    contrastBox: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: colors.goldSoft,
      borderRadius: 12,
      padding: 10,
    },
    lamp: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.goldDeep,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    input: {
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: 14,
      backgroundColor: colors.bg,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontFamily: "Manrope",
      fontWeight: "600",
      fontSize: 17,
      color: colors.ink,
    },
    verdict: { borderRadius: 22, padding: 16, gap: 10, marginTop: 14 },
    deepCard: { backgroundColor: colors.deep, borderRadius: 26, padding: 20, overflow: "hidden" },
    divider: { height: 1, backgroundColor: colors.line, marginVertical: 2 },
    rtl: { writingDirection: "rtl", textAlign: "right" },
    tapWord: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
  });
}

export type BuildStyles = ReturnType<typeof makeBuildStyles>;

export function useBuildStyles(): { s: BuildStyles; c: Palette } {
  const c = useTheme();
  const s = useMemo(() => makeBuildStyles(c), [c]);
  return { s, c };
}

/**
 * Hareke anahtarı (§7.5) karta gelen `view` ile hedef metne uygulanır; ama
 * Arapça notların, karşıtlıkların, geri bildirimin ve sistem derslerinin
 * İÇİNDE de geçer. Bu karışık metinleri çizen ortak parçalara tek tek prop
 * taşımamak için anahtar bağlamla iner. Varsayılan: metne dokunmaz.
 */
const ShowTargetContext = createContext<(t: string) => string>((t) => t);
export const ShowTargetProvider = ShowTargetContext.Provider;
export function useShowTarget(): (t: string) => string {
  return useContext(ShowTargetContext);
}

/** Setteki cümleler için ince bölütlü ilerleme şeridi. */
export function SentenceBar({ total, current }: { total: number; current: number }) {
  const { s, c } = useBuildStyles();
  return (
    <View style={s.segments}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[s.segment, { backgroundColor: i < current ? c.accent : i === current ? c.goldDeep : c.line }]}
        />
      ))}
    </View>
  );
}

/**
 * Türkçe cümle — sonraki her kartın başlığı; bu adımda eklenen parça
 * vurgulu (yer cihazda bulunur: aynı kelime iki kez geçse de doğru olanı).
 */
export function TrHeader({ tr, span, label = "TÜRKÇE CÜMLE" }: { tr: string; span?: [number, number] | null; label?: string }) {
  const { c } = useBuildStyles();
  const ok = !!span && span[0] >= 0 && span[1] <= tr.length && span[1] > span[0];
  return (
    <View style={{ marginBottom: 16 }}>
      <Txt variant="overline" color={c.inkSoft} style={{ marginBottom: 6 }}>
        {label}
      </Txt>
      <Txt variant="title2" style={{ fontWeight: "500" }}>
        {ok ? (
          <>
            {tr.slice(0, span![0])}
            <Txt variant="title2" color={c.gold} style={{ backgroundColor: c.highlight, fontWeight: "600" }}>
              {tr.slice(span![0], span![1])}
            </Txt>
            {tr.slice(span![1])}
          </>
        ) : (
          tr
        )}
      </Txt>
    </View>
  );
}

/** Hocanın sözlü işareti: "Bağlaçla başlıyorum", "Hemen vurgu: bazen". */
export function CueChip({ text, icon = "sparkles" }: { text: string; icon?: IconName }) {
  const { s, c } = useBuildStyles();
  return (
    <View style={s.labelChip}>
      <Icon name={icon} size={14} color={c.gold} />
      <Txt variant="caption" color={c.gold} style={{ fontWeight: "800" }}>
        {text}
      </Txt>
    </View>
  );
}

/** Hocanın sorusu ("Nasıl uyanmayı seviyorum?"). */
export function QuestionChip({ text, icon }: { text: string; icon?: IconName }) {
  const { s, c } = useBuildStyles();
  return (
    <View style={s.questionChip}>
      {icon ? <Icon name={icon} size={14} color={c.accentDark} /> : null}
      <Txt variant="caption" color={c.accentDark} style={{ fontWeight: "800" }}>
        {text}
      </Txt>
    </View>
  );
}

/** Kısa not satırı (ampul). */
export function NoteRow({ text, icon = "bulb" }: { text: string; icon?: IconName }) {
  const { s, c } = useBuildStyles();
  const show = useShowTarget();
  return (
    <View style={[s.row, { alignItems: "flex-start" }]}>
      <Icon name={icon} size={16} color={c.gold} />
      <Txt variant="callout" color={c.ink} style={{ flex: 1 }}>
        {ltrLine(show(text))}
      </Txt>
    </View>
  );
}

/** Karşıtlık (tuzak) kutusu — yalnız ilk seferde gösterilir. */
export function ContrastBox({ text, mini }: { text: string; mini?: [string, string] }) {
  const { s, c } = useBuildStyles();
  const show = useShowTarget();
  return (
    <View style={s.contrastBox}>
      <Icon name="alert" size={16} color={c.gold} />
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="callout" color={c.gold} style={{ fontWeight: "700" }}>
          {ltrLine(show(text))}
        </Txt>
        {mini ? (
          <Txt variant="caption" color={c.gold}>
            {ltrLine(`${show(mini[0])}  ↔  ${show(mini[1])}`)}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

/** Tam zamanında lamba: yalnız Türkçe tetik, hedef asla. */
export function Lamp({ text }: { text: string }) {
  const { s, c } = useBuildStyles();
  return (
    <View style={s.lamp} accessibilityLabel={`İpucu: ${text}`}>
      <Icon name="bulb" size={16} color={c.gold} />
      <Txt variant="caption" color={c.ink} style={{ flex: 1, fontWeight: "700" }}>
        {text}
      </Txt>
    </View>
  );
}
