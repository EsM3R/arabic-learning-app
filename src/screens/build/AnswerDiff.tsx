/**
 * Doğru cevabın gösterimi: bu adımda EKLENEN kelimeler vurgulu, araya giren
 * kelimeye "araya girdi" etiketi. Hocanın "bakın burası ne oldu" anı —
 * öğrenci neyin değiştiğini görmeden bütün cümleyi yeniden okumak zorunda
 * kalmasın. Vurgu iç içe metinle yapılır ki sağdan sola satır bölünmesin.
 */
import React from "react";
import { Text, View } from "react-native";
import { diffAdded } from "../../buildcheck";
import { TargetText, Txt } from "../../components/kit";
import type { LanguageId } from "../../languages";
import { stripHarakat } from "./helpers";
import { useBuildStyles } from "./ui";

export default function AnswerDiff({
  expected,
  prev,
  lang,
  rtl,
  harakat = true,
  size = 20,
}: {
  expected: string;
  /** Önceki adımın hedefi; verilmezse vurgu yok (tek seferde, sıralama). */
  prev?: string;
  lang: LanguageId;
  rtl: boolean;
  harakat?: boolean;
  size?: number;
}) {
  const { c } = useBuildStyles();
  const show = (t: string) => (harakat ? t : stripHarakat(t));
  if (prev === undefined) {
    return <TargetText size={size}>{show(expected)}</TargetText>;
  }
  const d = diffAdded(prev, expected, lang);
  return (
    <View style={{ gap: 6 }}>
      {/* Yazı tipi ve yön kitin hedef metninden; iç parçalar yalnız vurgu
          rengini taşır (satır içi olmaları için ham Text). */}
      <TargetText size={size}>
        {d.words.map((w, i) => (
          <Text
            key={i}
            testID={w.added ? "added-word" : undefined}
            style={w.added ? { backgroundColor: c.highlight, color: c.gold } : undefined}
          >
            {show(w.text)}
            {i < d.words.length - 1 ? " " : ""}
          </Text>
        ))}
      </TargetText>
      {d.inserted ? (
        <View style={{ alignSelf: rtl ? "flex-end" : "flex-start", backgroundColor: c.goldSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Txt variant="caption" color={c.gold} style={{ fontWeight: "800", fontSize: 11.5 }}>
            araya girdi
          </Txt>
        </View>
      ) : null}
    </View>
  );
}
