/**
 * Cevaptan sonraki panel: karar, "Duyduğum: …", doğrusu (dinlenebilir),
 * ve kartın kendi açıklamaları (children). Açıklamalar YALNIZ burada, yani
 * öğrenci denedikten sonra görünür — hoca da önce sordurur, sonra anlatır.
 */
import React from "react";
import { View } from "react-native";
import Icon from "../../components/Icon";
import { PressableScale, Txt } from "../../components/kit";
import type { StepVerdict } from "../../sentencebuilding";
import { ltrLine } from "../../richtext";
import { useBuildStyles, useShowTarget } from "./ui";

export default function VerdictPanel({
  verdict,
  revealed,
  heard,
  feedback,
  title,
  answer,
  translit,
  onListen,
  onVoid,
  children,
}: {
  verdict: StepVerdict;
  revealed?: boolean;
  /** Ses tanımanın duyduğu (n-best'te seçilen); yazıyla cevapta verilmez. */
  heard?: string;
  feedback?: string;
  /** Başlığı kart belirlerse (ör. tek seferde yanlış: "Adım adım kuralım"). */
  title?: string;
  /** Doğru cevabın gösterimi (AnswerDiff); yoksa gösterilmez. */
  answer?: React.ReactNode;
  translit?: string;
  onListen?: () => void;
  /** "Ses tanıma yanlış duydu, sayma" — adım başına bir kez. */
  onVoid?: () => void;
  children?: React.ReactNode;
}) {
  const { s, c } = useBuildStyles();
  const show = useShowTarget();
  const tone = revealed ? c.goldSoft : verdict === "dogru" ? c.accentSoft : verdict === "yakin" ? c.goldSoft : c.dangerSoft;
  const ink = revealed ? c.gold : verdict === "dogru" ? c.accentDark : verdict === "yakin" ? c.gold : c.danger;
  const head =
    title ??
    (revealed ? "Doğrusu:" : verdict === "dogru" ? "Doğru" : verdict === "yakin" ? "Çok yakın" : "Olmadı — doğrusu:");
  return (
    <View style={[s.verdict, { backgroundColor: tone }]}>
      <View style={s.row}>
        <Icon
          name={revealed ? "bulb" : verdict === "dogru" ? "check" : verdict === "yakin" ? "target" : "close"}
          size={18}
          color={ink}
          strokeWidth={2.6}
        />
        <Txt variant="headline" color={ink} style={{ fontSize: 15, flex: 1 }}>
          {head}
        </Txt>
      </View>
      {heard ? (
        <Txt variant="caption" color={c.inkSoft}>
          {ltrLine(`Duyduğum: ${show(heard)}`)}
        </Txt>
      ) : null}
      {answer ? (
        <PressableScale
          onPress={onListen}
          accessibilityLabel="Doğrusunu dinle"
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
        >
          <View style={{ paddingTop: 4 }}>
            <Icon name="volume" size={20} color={c.ink} />
          </View>
          <View style={{ flex: 1 }}>{answer}</View>
        </PressableScale>
      ) : null}
      {translit ? (
        <Txt variant="caption" color={c.inkSoft}>
          {translit}
        </Txt>
      ) : null}
      {feedback ? (
        <Txt variant="callout" color={verdict === "yanlis" && !revealed ? c.danger : c.ink} style={{ fontWeight: "700" }}>
          {ltrLine(show(feedback))}
        </Txt>
      ) : null}
      {children}
      {onVoid ? (
        <PressableScale onPress={onVoid} accessibilityLabel="Ses tanıma yanlış duydu, sayma" haptic={false} style={{ alignSelf: "flex-start" }}>
          <View style={[s.row, { paddingVertical: 4 }]}>
            <Icon name="ear" size={15} color={c.inkSoft} />
            <Txt variant="caption" color={c.inkSoft} style={{ textDecorationLine: "underline" }}>
              Ses tanıma yanlış duydu, sayma
            </Txt>
          </View>
        </PressableScale>
      ) : null}
    </View>
  );
}
