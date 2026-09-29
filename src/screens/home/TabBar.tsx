import React from "react";
import { View } from "react-native";
import Icon from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { PressableScale, Txt, useInsets } from "../../components/kit";
import { useTheme } from "../../useTheme";

export type TabKey = "today" | "practice" | "notebook" | "profile";

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "today", label: "Bugün", icon: "home" },
  { key: "practice", label: "Pratik", icon: "grid" },
  { key: "notebook", label: "Defter", icon: "book" },
  { key: "profile", label: "Profil", icon: "user" },
];

/**
 * Alt sekme çubuğu — ortada her zaman "hemen konuş". Uygulamanın hedefi
 * konuşmak; en kısa yol her ekrandan tek dokunuş olmalı.
 */
export default function TabBar({
  active,
  onChange,
  onSpeak,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  onSpeak: () => void;
}) {
  const c = useTheme();
  const insets = useInsets();
  const tab = (t: (typeof TABS)[number]) => {
    const on = t.key === active;
    return (
      <PressableScale
        key={t.key}
        onPress={() => onChange(t.key)}
        accessibilityRole="tab"
        accessibilityLabel={t.label}
        style={{ flex: 1, alignItems: "center", gap: 4, paddingTop: 8 }}
      >
        <Icon name={t.icon} size={23} color={on ? c.accent : c.inkFaint} strokeWidth={on ? 2.2 : 1.9} />
        <Txt variant="caption" color={on ? c.accent : c.inkFaint} style={{ fontSize: 11, fontWeight: on ? "800" : "700" }}>
          {t.label}
        </Txt>
      </PressableScale>
    );
  };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 10,
        paddingBottom: Math.max(insets.bottom, 10),
        backgroundColor: c.card,
        borderTopWidth: 1,
        borderTopColor: c.border,
      }}
    >
      {tab(TABS[0])}
      {tab(TABS[1])}
      <View style={{ flex: 1, alignItems: "center" }}>
        <PressableScale
          onPress={onSpeak}
          accessibilityLabel="Hemen konuş"
          style={{
            width: 62,
            height: 62,
            marginTop: -22,
            borderRadius: 31,
            backgroundColor: c.accent,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 5,
            borderColor: c.card,
            shadowColor: c.shadowTint,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 14,
            elevation: 8,
          }}
        >
          <Icon name="mic" size={25} color="#FFFFFF" />
        </PressableScale>
      </View>
      {tab(TABS[2])}
      {tab(TABS[3])}
    </View>
  );
}
