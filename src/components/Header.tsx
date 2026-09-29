import React from "react";
import { View } from "react-native";
import { useTheme } from "../useTheme";
import { IconButton, Txt, useInsets } from "./kit";

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Sağ tarafa düğme vb. */
  right?: React.ReactNode;
  /** deep: koyu sahne ekranları (Konuşma Odası). */
  tone?: "light" | "deep";
  /** Geri yerine kapat (×) — tam ekran akışlarda. */
  closeIcon?: boolean;
}

/**
 * İç ekranların ortak üst çubuğu. Güvenli alanı kendi ölçer (eski sürüm
 * 58 px'i elle yazıyordu), geri düğmesi 44 px dokunma alanlı bir ikon.
 */
export default function Header({ title, subtitle, onBack, right, tone = "light", closeIcon }: Props) {
  const c = useTheme();
  const insets = useInsets();
  const deep = tone === "deep";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingTop: insets.top + 8,
        paddingBottom: 10,
        paddingLeft: 8,
        paddingRight: 14,
        gap: 6,
        backgroundColor: deep ? c.deep : c.bg,
      }}
    >
      {onBack ? (
        <IconButton
          icon={closeIcon ? "close" : "chevronLeft"}
          label={closeIcon ? "Kapat" : "Geri"}
          onPress={onBack}
          variant="plain"
          color={deep ? c.onDeep : c.ink}
          iconSize={23}
        />
      ) : (
        <View style={{ width: 12 }} />
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="headline" color={deep ? c.onDeep : c.ink} numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" color={deep ? c.onDeepSoft : c.inkSoft} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{right}</View> : null}
    </View>
  );
}
