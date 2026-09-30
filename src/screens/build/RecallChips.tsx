/**
 * "Bunu öğrendik" — hocanın geri çağırma anı. Çipler YALNIZ Türkçe: hedef
 * gizli, çünkü öğrenci onu adımda kendisi hatırlayacak. İstersen bir çipe
 * dokunup "Nasıldı?" diye kendini yoklarsın; söylediğin denetlenir ve taşın
 * geri çağırma kaydına yazılır.
 */
import React from "react";
import { View } from "react-native";
import { Chip, Surface, TargetText, Txt } from "../../components/kit";
import type { Attempt, ViewOpts } from "./types";
import { useBuildStyles } from "./ui";

export interface RecallItem {
  key: string;
  tr: string;
  target: string;
  /** Öğretildiği cümle (setin içinde); -1 = önceki bir set. */
  from: number;
}

export default function RecallChips({
  items,
  synthesis,
  active,
  results,
  onPick,
  view,
}: {
  items: RecallItem[];
  synthesis: boolean;
  active: string | null;
  results: Record<string, Attempt>;
  onPick: (key: string) => void;
  view: ViewOpts;
}) {
  const { s, c } = useBuildStyles();
  const cur = items.find((x) => x.key === active);
  const res = cur ? results[cur.key] : undefined;
  return (
    <Surface raised style={{ gap: 12 }}>
      <Txt variant="headline">Bunu öğrendik</Txt>
      <View style={s.wrap}>
        {items.map((x) => (
          <Chip
            key={x.key}
            icon={results[x.key] ? (results[x.key].verdict === "yanlis" ? "close" : "check") : "check"}
            label={`${x.tr} · Öğrendik${x.from >= 0 ? ` (${x.from + 1}. cümle)` : ""}`}
            selected={x.key === active}
            onPress={() => onPick(x.key)}
          />
        ))}
      </View>
      {synthesis && (
        <Txt variant="callout" color={c.inkSoft}>
          Bunları öğrendik. Artık bu cümleyi rahatlıkla çevirebiliriz.
        </Txt>
      )}
      {cur && !res && (
        <Txt variant="callout" color={c.accentDark} style={{ fontWeight: "700" }}>
          {`Nasıldı? "${cur.tr}" nasıl söyleniyordu — söyle.`}
        </Txt>
      )}
      {cur && res && (
        <View style={{ gap: 4 }}>
          <Txt variant="caption" color={res.verdict === "yanlis" ? c.danger : c.accentDark} style={{ fontWeight: "800" }}>
            {res.verdict === "yanlis" ? "Hatırlatayım:" : "Doğru hatırladın"}
          </Txt>
          <TargetText size={view.rtl ? 22 : 18}>{view.show(cur.target)}</TargetText>
        </View>
      )}
      {!cur && (
        <Txt variant="caption" color={c.inkFaint}>
          Kendini yoklamak istersen bir çipe dokun.
        </Txt>
      )}
    </Surface>
  );
}
