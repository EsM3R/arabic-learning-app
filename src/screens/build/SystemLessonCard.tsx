/**
 * SİSTEM dersi — Türkçede olmayan bir düzen (12'lik saat, Arapçada sıra
 * sayısıyla saat…). Hocanın dört parçası: (a) Türkçeden farkı, (b)
 * aralıklar, (c) tek çözülmüş örnek — gerektiren adımdan ÖNCE; (d) "Bu
 * cümlede: 7 PM" — o adımın cevabından SONRA.
 */
import React, { useState } from "react";
import { View } from "react-native";
import Icon from "../../components/Icon";
import { PressableScale, Surface, Txt } from "../../components/kit";
import type { SystemLesson } from "../../buildmethod";
import { ltrLine } from "../../richtext";
import { CueChip, useBuildStyles, useShowTarget } from "./ui";

export default function SystemLessonCard({
  lesson,
  part,
  finalTarget,
}: {
  lesson: SystemLesson;
  part: "abc" | "d";
  finalTarget: string;
}) {
  const { s, c } = useBuildStyles();
  const show = useShowTarget();
  const [open, setOpen] = useState<Record<string, boolean>>({ a: true });
  if (part === "d") {
    return (
      <Surface raised style={{ gap: 10 }}>
        <CueChip text={show(lesson.title)} icon="clock" />
        <Txt variant="title3">{ltrLine(show(lesson.d(finalTarget)))}</Txt>
      </Surface>
    );
  }
  const parts: [string, string, string][] = [
    ["a", "Türkçeden farkı", lesson.a],
    ["b", "Aralıklar", lesson.b],
    ["c", "Örnek", lesson.c],
  ];
  return (
    <Surface raised style={{ gap: 12 }}>
      <CueChip text="Yeni bir sistem" icon="clock" />
      <Txt variant="title3">{show(lesson.title)}</Txt>
      {parts.map(([k, title, text]) => (
        <View key={k} style={{ gap: 6 }}>
          <PressableScale
            onPress={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}
            accessibilityLabel={title}
            haptic={false}
            style={s.row}
          >
            <Icon name={open[k] ? "chevronDown" : "chevronRight"} size={16} color={c.inkSoft} />
            <Txt variant="bodyStrong" style={{ flex: 1 }}>
              {title}
            </Txt>
          </PressableScale>
          {open[k] ? (
            <Txt variant="callout" color={c.inkSoft} style={{ paddingLeft: 24 }}>
              {ltrLine(show(text))}
            </Txt>
          ) : null}
        </View>
      ))}
    </Surface>
  );
}
