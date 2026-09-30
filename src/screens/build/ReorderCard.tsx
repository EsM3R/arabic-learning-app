/**
 * SIRALAMA kartı — "cümle ortasında da kullanabiliriz": yan cümle bağlacı
 * (before/after/when) ortaya alınır, virgül düşer. Yalnız yan cümle
 * bağlacında; "ama" ve "çünkü" yer değiştirmez. Almancada fiil yer
 * değiştirir, Farsçada mümkün ama daha az doğal.
 */
import React from "react";
import { View } from "react-native";
import { Surface, Txt } from "../../components/kit";
import { methodFor } from "../../buildmethod";
import type { LanguageId } from "../../languages";
import type { BuildSentence } from "../../sentencebuilding";
import AnswerDiff from "./AnswerDiff";
import type { Attempt, ViewOpts } from "./types";
import { CueChip, NoteRow, useBuildStyles } from "./ui";
import VerdictPanel from "./VerdictPanel";

export default function ReorderCard({
  sentence,
  first,
  lang,
  view,
  attempt,
  expectedShown,
  onListen,
  onVoid,
}: {
  sentence: BuildSentence;
  first: boolean;
  lang: LanguageId;
  view: ViewOpts;
  attempt: Attempt | null;
  expectedShown: string;
  onListen: () => void;
  onVoid?: () => void;
}) {
  const { c } = useBuildStyles();
  const mode = methodFor(lang).reorder;
  const conn = sentence.connector?.target ?? "";
  return (
    <View>
      <Surface raised style={{ gap: 12 }}>
        <CueChip text="Bağlacın yeri değişir" icon="refresh" />
        <Txt variant="title3" style={{ fontWeight: "500" }}>
          {first
            ? "Bağlacı ortaya al: ana cümleyle başla."
            : `Tıpkı önceki cümlelerde yaptığımız gibi: ${conn ? `${view.show(conn)} kısmını` : "bağlacı"} ortaya al.`}
        </Txt>
        {mode === "inversion" && <NoteRow text="Dikkat: bağlaç ortaya geçince fiil yer değiştirir — öğrendiğimiz nokta bu." icon="info" />}
        {mode === "lessNatural" && <NoteRow text="Bu dilde mümkün ama daha az doğal; bir kez söyleyip geçelim." icon="info" />}
        {!attempt && (
          <Txt variant="caption" color={c.inkFaint}>
            Aynı kelimeler, yalnız sıra değişiyor.
          </Txt>
        )}
      </Surface>
      {attempt && (
        <VerdictPanel
          verdict={attempt.verdict}
          revealed={attempt.revealed}
          heard={attempt.spoken ? attempt.heard : undefined}
          feedback={attempt.feedback}
          answer={<AnswerDiff expected={expectedShown} lang={lang} rtl={view.rtl} harakat={view.harakat} />}
          translit={sentence.reorderTranslit || undefined}
          onListen={onListen}
          onVoid={onVoid}
        />
      )}
    </View>
  );
}
