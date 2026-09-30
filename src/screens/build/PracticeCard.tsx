/**
 * PRATİK kartı (isteğe bağlı, cümle başına en fazla bir): yeni taşı başka
 * bir cümlede kullanmak. Hocanın yaptığı gibi: "Geç uyansaydın?" (eş),
 * "Hastaneden çıkarım" (aktarım). Eş ve aktarım cihazın kurduğu hedefe göre
 * denetlenir ve kanıt sayılır; "Kendi cümlen" yalnız pratiktir, sayılmaz.
 * "Başka örnek" yeni aktarım cümleleri ister — örneklerin sınırı yok.
 */
import React from "react";
import { View } from "react-native";
import { Button, Chip, Surface, TargetText, Txt } from "../../components/kit";
import type { LanguageId } from "../../languages";
import type { BuildBlock } from "../../sentencebuilding";
import AnswerDiff from "./AnswerDiff";
import type { Attempt, ViewOpts } from "./types";
import { CueChip, useBuildStyles } from "./ui";
import VerdictPanel from "./VerdictPanel";

export type PracticeKind = "pair" | "transfer" | "open";

export default function PracticeCard({
  kind,
  block,
  prompt,
  lang,
  view,
  attempt,
  onListen,
  onVoid,
  onMore,
  moreLoading,
  onOpen,
}: {
  kind: PracticeKind;
  block: BuildBlock;
  /** Eş/aktarım: cihazın kurduğu hedef ve Türkçesi. */
  prompt: { target: string; tr: string } | null;
  lang: LanguageId;
  view: ViewOpts;
  attempt: Attempt | null;
  onListen: () => void;
  onVoid?: () => void;
  onMore?: () => void;
  moreLoading?: boolean;
  onOpen?: () => void;
}) {
  const { s, c } = useBuildStyles();
  const head = kind === "pair" ? "Tersiyle söyle" : kind === "transfer" ? "Sen de söyle" : "Kendi cümlen · sayılmaz";
  return (
    <View>
      <Surface raised style={{ gap: 12 }}>
        <CueChip text={head} icon={kind === "open" ? "pen" : "repeat"} />
        {kind === "open" ? (
          <Txt variant="title3" style={{ fontWeight: "500" }}>
            {`"${block.tr}" geçen, kendi hayatından bir cümle söyle.`}
          </Txt>
        ) : (
          <>
            <Txt variant="caption" color={c.inkSoft}>
              {kind === "pair" ? `Aynı cümle, bu kez "${block.pair?.tr ?? ""}" ile:` : `Öğrendiğin parçayı (${block.tr}) başka bir cümlede kullan:`}
            </Txt>
            <Txt variant="title3" style={{ fontWeight: "500" }}>
              {prompt?.tr ?? ""}
            </Txt>
          </>
        )}
        {!attempt && (
          <View style={s.wrap}>
            {onMore && (
              <Chip icon="plus" label={moreLoading ? "Hazırlanıyor…" : "Başka örnek"} onPress={moreLoading ? undefined : onMore} />
            )}
            {onOpen && kind !== "open" && <Chip icon="pen" label="Kendi cümlen" onPress={onOpen} />}
          </View>
        )}
      </Surface>
      {attempt &&
        (kind === "open" ? (
          <VerdictPanel
            verdict={attempt.verdict}
            title={attempt.verdict === "dogru" ? "Güzel — parçayı kullandın" : "Parça duyulmadı"}
            heard={attempt.spoken ? attempt.heard : undefined}
            onVoid={onVoid}
          >
            <View style={s.row}>
              <Txt variant="caption" color={c.inkSoft}>{`${block.tr} =`}</Txt>
              <TargetText size={view.rtl ? 20 : 16}>{view.show(block.target)}</TargetText>
            </View>
            {attempt.verdict === "dogru" && onMore ? (
              <Button variant="ghost" size="sm" icon="plus" label="Başka örnek" onPress={onMore} style={{ alignSelf: "flex-start" }} />
            ) : null}
          </VerdictPanel>
        ) : (
          <VerdictPanel
            verdict={attempt.verdict}
            revealed={attempt.revealed}
            heard={attempt.spoken ? attempt.heard : undefined}
            feedback={attempt.feedback}
            answer={<AnswerDiff expected={attempt.expected || prompt?.target || ""} lang={lang} rtl={view.rtl} harakat={view.harakat} />}
            onListen={onListen}
            onVoid={onVoid}
          />
        ))}
    </View>
  );
}
