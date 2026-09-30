/**
 * GERİ ÇAĞIRMA — "AM mi PM mi?", "by mı with mi?": gerektiren adımdan önce
 * iki seçenekli karar. Hoca bunu sorar ve cevabı hikâyeye bağlar ("PM:
 * işten çıktığımız saatler"). Seçenekler yalnız yöntem tablosundan gelir;
 * İngilizcenin tuzakları başka dile sızmaz.
 */
import React from "react";
import { View } from "react-native";
import { Button, Surface, Txt } from "../../components/kit";
import type { Retrieval } from "../../sentencebuilding";
import { ltrLine } from "../../richtext";
import type { ViewOpts } from "./types";
import { CueChip, useBuildStyles } from "./ui";

export default function RetrievalCard({
  r,
  picked,
  onPick,
  view,
  unheard,
}: {
  r: Retrieval;
  picked: 0 | 1 | null;
  onPick: (i: 0 | 1) => void;
  view: ViewOpts;
  /** Sesle söylenen ama iki seçenekten hiçbirine uymayan duyuş. */
  unheard?: string | null;
}) {
  const { c } = useBuildStyles();
  const ok = picked !== null && picked === r.answer;
  return (
    <Surface raised style={{ gap: 14 }}>
      <CueChip text="Hatırlayalım" icon="target" />
      <Txt variant="title2">{ltrLine(view.show(r.q))}</Txt>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {r.options.map((o, i) => {
          const chosen = picked === i;
          const variant = picked === null ? "secondary" : i === r.answer ? "primary" : chosen ? "danger" : "secondary";
          return (
            <Button
              key={i}
              label={view.show(o)}
              accessibilityLabel={`Seçenek: ${o}`}
              variant={variant}
              disabled={picked !== null && !chosen && i !== r.answer}
              style={{ flex: 1, height: 64 }}
              onPress={picked === null ? () => onPick(i as 0 | 1) : undefined}
            />
          );
        })}
      </View>
      {picked === null ? (
        unheard ? (
          // Sessizce hiçbir şey olmasın: öğrenci neyin duyulduğunu görüp yeniden söylesin.
          <Txt variant="caption" color={c.danger}>
            {ltrLine(`Duyduğum: ${unheard} — iki seçenekten birini söyle ya da dokun.`)}
          </Txt>
        ) : (
          <Txt variant="caption" color={c.inkFaint}>
            Dokun ya da söyle.
          </Txt>
        )
      ) : (
        <View style={{ gap: 4 }}>
          <Txt variant="headline" color={ok ? c.accentDark : c.danger} style={{ fontSize: 15 }}>
            {ok ? "Doğru" : `Olmadı — ${view.show(r.options[r.answer])}`}
          </Txt>
          {!!r.why && (
            <Txt variant="callout" color={c.ink}>
              {ltrLine(view.show(r.why))}
            </Txt>
          )}
        </View>
      )}
    </Surface>
  );
}
