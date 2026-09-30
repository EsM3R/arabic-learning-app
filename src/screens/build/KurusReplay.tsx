/**
 * HOCANIN KURUŞU — tek seferde doğru söylenen cümlenin ardından hocanın
 * adım adım kuruluşu (Türkçe soru → Türkçe cevap → hedef), sesli. Videodaki
 * son cümle de böyle kurulur; öğrenci kendi cümlesini hocanınkiyle
 * karşılaştırır. Atlanabilir.
 */
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Surface, TargetText, Txt } from "../../components/kit";
import type { BuildSentence } from "../../sentencebuilding";
import { speakTargetWith, stopSpeaking } from "../../speech";
import { answerLine } from "./helpers";
import type { ViewOpts } from "./types";
import { CueChip, QuestionChip, useBuildStyles } from "./ui";

/** TTS "bitti" demezse (bazı Android motorları) yine de ilerle. */
const WATCHDOG_MS = 4500;
const GAP_MS = 500;

export default function KurusReplay({ sentence, view, targets }: { sentence: BuildSentence; view: ViewOpts; targets: string[] }) {
  const { c } = useBuildStyles();
  const n = sentence.steps.length;
  const [shown, setShown] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  // Hedefler her çizimde yeni dizi olarak gelir (arka planda üretim ekranı
  // yeniden çizdirir); efekt ona bağlanırsa çalan adım baştan okunur.
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (shown > n) return;
    let moved = false;
    const next = () => {
      if (moved || !alive.current) return;
      moved = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (alive.current) setShown((k) => (k <= n ? k + 1 : k));
      }, GAP_MS);
    };
    speakTargetWith(targetsRef.current[shown - 1] ?? "", { onDone: next, onError: next });
    timer.current = setTimeout(next, WATCHDOG_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [shown, n]);

  const done = shown > n;
  return (
    <Surface raised style={{ gap: 14 }}>
      <CueChip text="Hocanın kuruşu" icon="play" />
      {sentence.steps.slice(0, Math.min(shown, n)).map((st, k) => {
        const line = answerLine(st.trSoFar, st.trPiece);
        return (
          <View key={k} style={{ gap: 4 }}>
            {st.question ? <QuestionChip text={st.question} /> : null}
            <Txt variant="callout" color={c.inkSoft}>
              {"→ "}
              {line.before}
              {line.bold ? (
                <Txt variant="callout" color={c.gold} style={{ fontWeight: "800" }}>
                  {line.bold}
                </Txt>
              ) : null}
              {line.after}
            </Txt>
            <TargetText size={view.rtl ? 21 : 16}>{view.show(targets[k] ?? st.target)}</TargetText>
          </View>
        );
      })}
      {!done && (
        <Button
          variant="ghost"
          size="sm"
          icon="arrowRight"
          label="Atla"
          style={{ alignSelf: "flex-start" }}
          onPress={() => {
            stopSpeaking();
            setShown(n + 1);
          }}
        />
      )}
    </Surface>
  );
}
