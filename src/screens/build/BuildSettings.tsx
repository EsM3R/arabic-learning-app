/**
 * Cümle Kurma AYARLARI — ana ekranda katlanır küçük bir bölüm (tasarım §3,
 * §7.5, §7.9, §12). Dört anahtar:
 *
 * - Hızlı akış (varsayılan AÇIK): doğru cevaptan sonra okunacak yeni bir şey
 *   yoksa kart kendiliğinden geçer; konuşma ritmi bozulmasın.
 * - Harekeler (yalnız Arapça yazıda): yalnız GÖSTERİM; denetim harekeye hiç
 *   bakmaz. Kartların içinde de başlıktaki göz düğmesiyle değişir.
 * - Videodaki sıra (varsayılan KAPALI, D3): hocanın birebir sırası — önce
 *   sözcükler, ek sonra ("I like wake up" → "I like to wake up"). Ara hâl
 *   "henüz eksik" diye işaretlenir. Kapalıyken hiçbir adımda bozuk bir cümle
 *   söyletilmez; yalnız YENİ hazırlanan cümlelere uygulanır.
 * - Günlük Arapça (yalnız Arapça, varsayılan KAPALI → yalnız fushâ):
 *   أَفْتَحُ التِّلْفَازَ, بَدِّي gibi günlük söyleyişler "bu da olur (günlük)"
 *   sayılır. Denetim anında uygulanır: eski setler de hemen uyar.
 *
 * Varsayılanlar, kullanıcıya sorulacak açık sorulardaki seçimlerdir (§12).
 */
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import Icon from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { IconTile, ListGroup, PressableScale, Txt } from "../../components/kit";
import type { IconTone } from "../../components/kit";
import type { Palette } from "../../theme";
import { useTheme } from "../../useTheme";

export interface BuildSettingsValue {
  fastFlow: boolean;
  harakat: boolean;
  videoOrder: boolean;
  acceptDialect: boolean;
}

export type BuildSettingKey = keyof BuildSettingsValue;

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    head: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
    toggle: { width: 46, height: 28, borderRadius: 14, backgroundColor: colors.line, padding: 3 },
    toggleOn: { backgroundColor: colors.accent },
    knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
    knobOn: { transform: [{ translateX: 18 }] },
  });
}

function ToggleRow({
  icon,
  tone,
  title,
  subtitle,
  value,
  onToggle,
}: {
  icon: IconName;
  tone: IconTone;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
}) {
  const c = useTheme();
  const st = React.useMemo(() => makeStyles(c), [c]);
  return (
    <PressableScale
      onPress={onToggle}
      scaleTo={0.985}
      accessibilityLabel={title}
    >
      <View style={st.row}>
        <IconTile icon={icon} tone={tone} size={34} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong">{title}</Txt>
          <Txt variant="caption" color={c.inkSoft}>
            {subtitle}
          </Txt>
        </View>
        <View style={[st.toggle, value && st.toggleOn]}>
          <View style={[st.knob, value && st.knobOn]} />
        </View>
      </View>
    </PressableScale>
  );
}

export default function BuildSettings({
  value,
  arabicScript,
  dialect,
  onToggle,
}: {
  value: BuildSettingsValue;
  /** Hedef yazı harekeli (Arapça harfli): hareke anahtarı görünür. */
  arabicScript: boolean;
  /** Dilin günlük karşılık listesi var (Arapça): günlük dil anahtarı görünür. */
  dialect: boolean;
  onToggle: (k: BuildSettingKey) => void;
}) {
  const c = useTheme();
  const st = React.useMemo(() => makeStyles(c), [c]);
  const [open, setOpen] = useState(false);
  const on = (b: boolean) => (b ? "açık" : "kapalı");
  const summary = [
    `Hızlı akış ${on(value.fastFlow)}`,
    arabicScript ? `harekeler ${value.harakat ? "görünür" : "gizli"}` : null,
    `video sırası ${on(value.videoOrder)}`,
    dialect ? (value.acceptDialect ? "günlük dil kabul" : "yalnız fushâ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={{ marginBottom: 22 }}>
      <PressableScale
        onPress={() => setOpen((o) => !o)}
        accessibilityLabel="Cümle Kurma ayarları"
        haptic={false}
      >
        <View style={st.head}>
          <Icon name="settings" size={18} color={c.inkSoft} />
          <View style={{ flex: 1, gap: 1 }}>
            <Txt variant="bodyStrong">Ayarlar</Txt>
            <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>
              {summary}
            </Txt>
          </View>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={18} color={c.inkFaint} />
        </View>
      </PressableScale>
      {open && (
        <ListGroup style={{ marginTop: 10 }}>
          <ToggleRow
            icon="zap"
            tone="accent"
            title="Hızlı akış"
            subtitle="Doğru cevaptan sonra okunacak yeni bir şey yoksa kart kendiliğinden geçer."
            value={value.fastFlow}
            onToggle={() => onToggle("fastFlow")}
          />
          {arabicScript ? (
            <ToggleRow
              icon={value.harakat ? "eye" : "eyeOff"}
              tone="gold"
              title="Harekeleri göster"
              subtitle="Yalnız görünüm; cevabın harekesine hiç bakılmaz."
              value={value.harakat}
              onToggle={() => onToggle("harakat")}
            />
          ) : null}
          <ToggleRow
            icon="play"
            tone="info"
            title="Videodaki sıra"
            subtitle="Hocanın birebir sırası: önce kelimeler, ek sonra (I like wake up → I like to wake up); ara hâl işaretlenir. Yeni cümlelerde geçerli."
            value={value.videoOrder}
            onToggle={() => onToggle("videoOrder")}
          />
          {dialect ? (
            <ToggleRow
              icon="message"
              tone="neutral"
              title="Günlük Arapçayı da kabul et"
              subtitle="Kapalıyken yalnız fushâ. Açıkken günlük söyleyişler de (ör. بَدِّي) doğru sayılır ve kararda (günlük) diye anılır."
              value={value.acceptDialect}
              onToggle={() => onToggle("acceptDialect")}
            />
          ) : null}
        </ListGroup>
      )}
    </View>
  );
}
