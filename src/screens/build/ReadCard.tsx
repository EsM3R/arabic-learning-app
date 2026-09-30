/**
 * OKU kartı — "Bu cümleyi çevirelim". Yalnız Türkçe cümle; hedef dilde tek
 * kelime yok. Hoca da önce cümleyi bütün okur, sonra parçalara ayırır.
 */
import React from "react";
import { View } from "react-native";
import { Surface, TeacherAvatar, Txt } from "../../components/kit";
import type { BuildSentence } from "../../sentencebuilding";
import { readHeading, roleLabel } from "./helpers";
import { useBuildStyles } from "./ui";

export default function ReadCard({ sentence, index }: { sentence: BuildSentence; index: number }) {
  const { s, c } = useBuildStyles();
  return (
    <View style={{ gap: 14 }}>
      <View style={s.row}>
        <TeacherAvatar size={40} />
        <View style={{ flex: 1 }}>
          <Txt variant="headline">{readHeading(sentence.role, index)}</Txt>
          <Txt variant="caption" color={c.inkSoft}>
            {`${index + 1}. cümle · ${roleLabel(sentence.role)}`}
          </Txt>
        </View>
      </View>
      <Surface raised style={{ gap: 12 }}>
        <Txt variant="overline" color={c.inkSoft}>
          TÜRKÇE CÜMLE
        </Txt>
        <Txt variant="title1" style={{ fontWeight: "500" }}>
          {sentence.tr}
        </Txt>
      </Surface>
      <Txt variant="callout" color={c.inkSoft}>
        {sentence.role === "synthesis"
          ? "Bu cümledeki parçaların çoğunu öğrendik. Önce bütün cümleyi oku."
          : "Önce bütün cümleyi oku. Sonra birlikte, parça parça kuracağız; her adımda o ana kadarki cümlenin tamamını sen söyleyeceksin."}
      </Txt>
    </View>
  );
}
