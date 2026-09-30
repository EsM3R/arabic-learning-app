/**
 * HAZIRLANIYOR — sıradaki cümle henüz üretilmediyse (cümleler öğrenci
 * çalışırken tek tek hazırlanır). Beklerken önceki cümlenin toparla hâli
 * dinlenebilir; vadesi gelmiş bir cümle varsa bekleme bir tekrara dönüşür
 * (tek seferde söyle, sonra doğrusunu dinle). Üretim durduysa yeniden denenir.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Button, Surface, TargetText, TeacherAvatar, Txt } from "../../components/kit";
import { ltrLine } from "../../richtext";
import type { ViewOpts } from "./types";
import { useBuildStyles } from "./ui";

export default function PreparingCard({
  title = "Hoca sıradaki cümleyi hazırlıyor…",
  note,
  prevTarget,
  error,
  view,
  onReplay,
  onRetry,
  review,
  onReviewListen,
}: {
  title?: string;
  note?: string;
  prevTarget?: string;
  error?: string | null;
  view: ViewOpts;
  onReplay?: () => void;
  onRetry?: () => void;
  /** Vadesi gelmiş bir cümle (Türkçesi ve hedefi); beklerken söylenir, sayılmaz. */
  review?: { tr: string; target: string } | null;
  onReviewListen?: () => void;
}) {
  const { c } = useBuildStyles();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: 16, alignItems: "stretch" }}>
      <View style={{ alignItems: "center", gap: 14, paddingTop: 30 }}>
        <TeacherAvatar size={72} speaking={!error} />
        <Txt variant="title3" center>
          {error ? "Cümle hazırlanamadı" : title}
        </Txt>
        <Txt variant="callout" color={c.inkSoft} center>
          {error
            ? ltrLine(error)
            : note ?? "Bir cümlenin hazırlanması yarım dakika kadar sürer; sen çalışırken sıradakiler hazırlanıyor."}
        </Txt>
        {error && onRetry ? <Button icon="refresh" label="Tekrar dene" onPress={onRetry} /> : null}
      </View>
      {prevTarget ? (
        <Surface style={{ gap: 8 }}>
          <Txt variant="caption" color={c.inkSoft}>
            Beklerken önceki cümleni bir daha dinle ve söyle:
          </Txt>
          <TargetText size={view.rtl ? 22 : 17}>{view.show(prevTarget)}</TargetText>
          {onReplay ? (
            <Button variant="secondary" size="sm" icon="volume" label="Dinle" onPress={onReplay} style={{ alignSelf: "flex-start" }} />
          ) : null}
        </Surface>
      ) : null}
      {review ? (
        <Surface style={{ gap: 8 }}>
          <Txt variant="caption" color={c.inkSoft}>
            Tekrar zamanı gelmiş bir cümle — tek seferde söyle:
          </Txt>
          <Txt variant="headline">{review.tr}</Txt>
          {shown ? <TargetText size={view.rtl ? 22 : 17}>{view.show(review.target)}</TargetText> : null}
          <Button
            variant="secondary"
            size="sm"
            icon={shown ? "volume" : "eye"}
            label={shown ? "Dinle" : "Doğrusunu göster"}
            onPress={() => {
              setShown(true);
              onReviewListen?.();
            }}
            style={{ alignSelf: "flex-start" }}
          />
        </Surface>
      ) : null}
    </View>
  );
}
