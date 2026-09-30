/**
 * TEK SEFERDE kartı — "Önce kendin dene: cümlenin tamamını söyle."
 * Sentez cümlesinde (her seviyede), B2+ her cümlede ve tekrarda. Yalnız
 * Türkçe görünür: soru yok, "şu ana kadar" yok. Olursa hocanın kuruşu
 * izlenir; olmazsa adımlar açılır (ikinci bir ceza yok).
 */
import React from "react";
import { View } from "react-native";
import { Surface, Txt } from "../../components/kit";
import type { LanguageId } from "../../languages";
import type { BuildSentence } from "../../sentencebuilding";
import AnswerDiff from "./AnswerDiff";
import type { Attempt, ViewOpts } from "./types";
import { CueChip, useBuildStyles } from "./ui";
import VerdictPanel from "./VerdictPanel";

export default function OneShotCard({
  sentence,
  lang,
  view,
  attempt,
  expectedShown,
  translit,
  review,
  onListen,
  onVoid,
  extra,
}: {
  sentence: BuildSentence;
  lang: LanguageId;
  view: ViewOpts;
  attempt: Attempt | null;
  expectedShown: string;
  translit?: string;
  review?: boolean;
  onListen: () => void;
  onVoid?: () => void;
  extra?: React.ReactNode;
}) {
  const { c } = useBuildStyles();
  const ok = !!attempt && attempt.verdict !== "yanlis" && !attempt.revealed;
  return (
    <View>
      <Surface raised style={{ gap: 12 }}>
        <CueChip text={review ? "Tekrar: tek seferde" : "Önce kendin dene"} icon="target" />
        <Txt variant="title3" style={{ fontWeight: "500" }}>
          {sentence.tr}
        </Txt>
        {!attempt && (
          <Txt variant="callout" color={c.inkSoft}>
            Cümlenin tamamını tek seferde söyle. Olmazsa adım adım kurarız.
          </Txt>
        )}
        {extra}
      </Surface>
      {attempt &&
        (ok ? (
          <VerdictPanel
            verdict={attempt.verdict}
            heard={attempt.spoken ? attempt.heard : undefined}
            feedback={attempt.feedback}
            answer={<AnswerDiff expected={expectedShown} lang={lang} rtl={view.rtl} harakat={view.harakat} />}
            translit={translit}
            onListen={onListen}
            onVoid={onVoid}
          >
            <Txt variant="callout" color={c.accentDark}>
              Şimdi hocanın bu cümleyi nasıl kurduğunu birlikte izleyelim.
            </Txt>
          </VerdictPanel>
        ) : (
          // Yanlışta doğru cümle de denetimin ipucu da GÖSTERİLMEZ (ipucu hedef
          // parçayı söyler): adımlar cümleyi birlikte kuracak.
          <VerdictPanel
            verdict="yanlis"
            title="Olmadı — adım adım kuralım"
            heard={attempt.spoken ? attempt.heard : undefined}
            onVoid={onVoid}
          />
        ))}
    </View>
  );
}
