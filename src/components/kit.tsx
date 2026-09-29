/**
 * PREMIUM+ ARAYÜZ KİTİ
 *
 * Bütün ekranlar yalnız bu parçalarla kurulur: yazı (Txt), yüzey (Surface),
 * düğme (Button / IconButton), liste (ListGroup / ListRow), rozet, çip,
 * bölütlü seçici, ilerleme halkası/çubuğu, hoca avatarı ve geometrik desen.
 *
 * Kural: ekran dosyası renk, yazı boyutu ya da gölge SEÇMEZ; jetonları
 * (theme.ts) bu bileşenler üzerinden kullanır. Önceki arayüzün en büyük
 * kusuru her ekranın kendi kartını ve düğmesini yeniden yazmasıydı.
 */
import React, { useContext, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  Insets,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import Svg, { Circle, Defs, Pattern, Polygon, Rect } from "react-native-svg";
import { tap } from "../feedback";
import { getActivePack } from "../languages";
import { arabicText, radius, shadow, shadowLift, type } from "../theme";
import type { Palette, TypeVariant } from "../theme";
import { useTheme } from "../useTheme";
import Icon from "./Icon";
import type { IconName } from "./Icon";

// ---------------------------------------------------------------------------
// Güvenli alan
// ---------------------------------------------------------------------------

/**
 * Çentik/durum çubuğu boşlukları. Sağlayıcı yoksa (testler, eski kabuk)
 * makul bir varsayılana düşer — eski arayüz 58 px'i elle yazıyordu ve
 * çentikli telefonlarda başlık ya sıkışıyor ya da boşlukta yüzüyordu.
 */
export function useInsets(): { top: number; bottom: number } {
  const ctx = useContext(SafeAreaInsetsContext);
  return { top: ctx?.top ?? 36, bottom: ctx?.bottom ?? 0 };
}

// ---------------------------------------------------------------------------
// Yazı
// ---------------------------------------------------------------------------

export function Txt({
  variant = "body",
  color,
  center,
  style,
  children,
  ...rest
}: TextProps & {
  variant?: TypeVariant;
  color?: string;
  center?: boolean;
}) {
  const c = useTheme();
  return (
    <Text
      {...rest}
      style={[
        type[variant] as TextStyle,
        { color: color ?? c.ink },
        center && { textAlign: "center" },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Hedef dildeki metin — Arap alfabesinde Naskh ve sağdan sola. */
export function TargetText({
  children,
  size = 22,
  color,
  align,
  style,
  highlight,
}: {
  children: string;
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  style?: StyleProp<TextStyle>;
  /** Vurgulanacak kelime (karaoke). */
  highlight?: string;
}) {
  const c = useTheme();
  const pack = getActivePack();
  const rtl = pack.script === "arabic" || pack.script === "persian";
  const base: TextStyle = rtl
    ? { ...arabicText(size), writingDirection: "rtl", textAlign: align ?? "right" }
    : { fontFamily: "Manrope", fontWeight: "700", fontSize: size, lineHeight: Math.round(size * 1.35), textAlign: align ?? "left" };
  if (!highlight || !children.includes(highlight)) {
    return <Text style={[base, { color: color ?? c.ink }, style]}>{children}</Text>;
  }
  const i = children.indexOf(highlight);
  return (
    <Text style={[base, { color: color ?? c.ink }, style]}>
      {children.slice(0, i)}
      <Text style={{ backgroundColor: c.highlight }}>{highlight}</Text>
      {children.slice(i + highlight.length)}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Dokunma: hafif küçülme + seçim titreşimi
// ---------------------------------------------------------------------------

export function PressableScale({
  children,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  style,
  haptic = true,
  accessibilityLabel,
  accessibilityRole = "button",
  hitSlop,
  scaleTo = 0.97,
  testID,
}: {
  children: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onPressIn?: (e: GestureResponderEvent) => void;
  onPressOut?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link" | "tab";
  hitSlop?: number | Insets;
  scaleTo?: number;
  testID?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  // Yerleşim (flex, genişlik, dış boşluk) dıştaki Pressable'a gitmeli; yoksa
  // "flex: 1" verilen düğme satırda payını alamaz ve sıkışır.
  const flat = StyleSheet.flatten(style) ?? {};
  const outer: ViewStyle = {};
  const inner: ViewStyle = { ...flat };
  for (const k of ["flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf", "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "marginHorizontal", "marginVertical", "position", "top", "left", "right", "bottom"] as const) {
    if (flat[k] !== undefined) {
      (outer as Record<string, unknown>)[k] = flat[k];
      delete (inner as Record<string, unknown>)[k];
    }
  }
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      testID={testID}
      onPress={
        onPress
          ? (e) => {
              if (haptic) void tap();
              onPress(e);
            }
          : undefined
      }
      onPressIn={(e) => {
        to(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={hitSlop}
      style={outer}
    >
      <Animated.View style={[inner, { transform: [{ scale }] }, disabled && { opacity: 0.45 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Düğmeler
// ---------------------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "ghost" | "gold" | "danger" | "onDeep";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  size = "lg",
  disabled,
  loading,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: "lg" | "md" | "sm";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.accent, fg: "#FFFFFF" },
    secondary: { bg: c.card, fg: c.ink, border: c.border },
    ghost: { bg: "transparent", fg: c.ink, border: c.border },
    gold: { bg: c.goldDeep, fg: c.onGold },
    danger: { bg: c.dangerSoft, fg: c.danger },
    onDeep: { bg: "rgba(255,255,255,0.08)", fg: c.onDeep, border: "rgba(255,255,255,0.2)" },
  };
  const p = palette[variant];
  const h = size === "lg" ? 54 : size === "md" ? 46 : 36;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          height: h,
          borderRadius: size === "sm" ? 12 : 16,
          paddingHorizontal: size === "sm" ? 12 : size === "md" ? 14 : 18,
          backgroundColor: p.bg,
          borderWidth: p.border ? 1 : 0,
          borderColor: p.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={size === "sm" ? 15 : 18} color={p.fg} strokeWidth={2.2} />}
          <Txt
            variant="button"
            color={p.fg}
            style={[{ flexShrink: 1 }, size === "sm" ? { fontSize: 13 } : size === "md" ? { fontSize: 14.5 } : undefined]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {label}
          </Txt>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  variant = "outline",
  size = 44,
  iconSize,
  color,
  disabled,
  onPressIn,
  onPressOut,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  /** Ekran okuyucu etiketi — ikon tek başına anlam taşımaz. */
  label: string;
  variant?: "plain" | "outline" | "soft" | "deep" | "gold" | "onDeep";
  size?: number;
  iconSize?: number;
  color?: string;
  disabled?: boolean;
  onPressIn?: () => void;
  onPressOut?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const v = {
    plain: { bg: "transparent", fg: c.ink, border: undefined },
    outline: { bg: c.card, fg: c.ink, border: c.border },
    soft: { bg: c.accentSoft, fg: c.accentDark, border: undefined },
    deep: { bg: c.accent, fg: "#FFFFFF", border: undefined },
    gold: { bg: c.goldDeep, fg: c.onGold, border: undefined },
    onDeep: { bg: "rgba(255,255,255,0.07)", fg: c.onDeep, border: "rgba(255,255,255,0.2)" },
  }[variant];
  return (
    <PressableScale
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={6}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.44)} color={color ?? v.fg} />
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Yüzeyler
// ---------------------------------------------------------------------------

export function Surface({
  children,
  style,
  raised,
  padded = true,
  tone = "card",
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Yüzen kart (büyük gölge). */
  raised?: boolean;
  padded?: boolean;
  tone?: "card" | "sunken" | "deep" | "soft" | "gold";
}) {
  const c = useTheme();
  const bg = {
    card: c.card,
    sunken: c.bgAlt,
    deep: c.deep,
    soft: c.accentSoft,
    gold: c.goldSoft,
  }[tone];
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: raised ? radius.xxl : radius.xl,
          padding: padded ? 18 : 0,
          borderWidth: tone === "card" && !raised ? 1 : 0,
          borderColor: c.border,
        },
        raised ? shadowLift : tone === "card" ? shadow : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Bölüm başlığı — küçük, aralıklı büyük harf. */
export function SectionLabel({
  title,
  action,
  onAction,
  color,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }, style]}>
      <Txt variant="overline" color={color ?? c.inkSoft}>
        {title.toLocaleUpperCase("tr-TR")}
      </Txt>
      {action && onAction ? (
        <PressableScale onPress={onAction} hitSlop={8} haptic={false}>
          <Txt variant="caption" color={c.accentDark}>
            {action}
          </Txt>
        </PressableScale>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export type IconTone = "accent" | "gold" | "info" | "neutral" | "danger" | "deep";

export function IconTile({ icon, tone = "accent", size = 38 }: { icon: IconName; tone?: IconTone; size?: number }) {
  const c = useTheme();
  const t = {
    accent: { bg: c.accentSoft, fg: c.accentDark },
    gold: { bg: c.goldSoft, fg: c.gold },
    info: { bg: c.infoSoft, fg: c.info },
    neutral: { bg: c.bgAlt, fg: c.ink },
    danger: { bg: c.dangerSoft, fg: c.danger },
    deep: { bg: c.accent, fg: "#FFFFFF" },
  }[tone];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: t.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} color={t.fg} />
    </View>
  );
}

export function ListGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: c.border,
          overflow: "hidden",
        },
        shadow,
        style,
      ]}
    >
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.line } : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function ListRow({
  icon,
  tone = "accent",
  title,
  subtitle,
  onPress,
  right,
  badge,
  chevron = true,
  accessibilityLabel,
}: {
  icon?: IconName;
  tone?: IconTone;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  badge?: string | number;
  chevron?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}>
      {icon && <IconTile icon={icon} tone={tone} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {subtitle ? (
          <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
      {badge !== undefined && badge !== 0 && badge !== "" ? <Badge text={String(badge)} /> : null}
      {onPress && chevron && !right ? <Icon name="chevronRight" size={18} color={c.inkFaint} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityLabel={accessibilityLabel ?? title}>
      {body}
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Küçük parçalar
// ---------------------------------------------------------------------------

export function Badge({ text, tone = "ink" }: { text: string; tone?: "ink" | "accent" | "gold" | "danger" }) {
  const c = useTheme();
  const t = {
    ink: { bg: c.ink, fg: c.bg },
    accent: { bg: c.accent, fg: "#FFFFFF" },
    gold: { bg: c.goldDeep, fg: c.onGold },
    danger: { bg: c.danger, fg: "#FFFFFF" },
  }[tone];
  return (
    <View
      style={{
        minWidth: 24,
        height: 22,
        paddingHorizontal: 8,
        borderRadius: 11,
        backgroundColor: t.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt variant="caption" color={t.fg} style={{ fontWeight: "800", fontSize: 12 }}>
        {text}
      </Txt>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  onDeep,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  onDeep?: boolean;
}) {
  const c = useTheme();
  const bg = selected ? (onDeep ? c.goldDeep : c.accent) : onDeep ? "rgba(255,255,255,0.07)" : c.card;
  const fg = selected ? (onDeep ? c.onGold : "#FFFFFF") : onDeep ? c.onDeep : c.ink;
  const border = selected ? "transparent" : onDeep ? "rgba(255,255,255,0.2)" : c.border;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        height: 36,
        paddingHorizontal: 13,
        borderRadius: 18,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {icon && <Icon name={icon} size={15} color={fg} strokeWidth={2.2} />}
      <Txt variant="caption" color={fg} style={{ fontWeight: "800" }}>
        {label}
      </Txt>
    </PressableScale>
  );
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", padding: 3, borderRadius: 13, backgroundColor: c.bgAlt }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <PressableScale
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityLabel={o.label}
            style={[
              { height: 32, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
              on && { backgroundColor: c.card },
              on && shadow,
            ]}
          >
            <Txt variant="caption" color={on ? c.accentDark : c.inkSoft} style={{ fontWeight: on ? "800" : "700" }}>
              {o.label}
            </Txt>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** İlerleme halkası. */
export function Ring({
  progress,
  size = 64,
  stroke = 6,
  color,
  track,
  label,
  labelColor,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: string;
  labelColor?: string;
}) {
  const c = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? c.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? c.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {label ? (
        <Txt variant="caption" color={labelColor ?? c.ink} style={{ fontWeight: "800", fontSize: size > 56 ? 14 : 11 }}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

/** İlerleme çubuğu. */
export function Bar({
  progress,
  color,
  track,
  height = 6,
  style,
}: {
  progress: number;
  color?: string;
  track?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: track ?? c.line, overflow: "hidden" }, style]}>
      <View style={{ width: `${p * 100}%`, height, borderRadius: height / 2, backgroundColor: color ?? c.accent }} />
    </View>
  );
}

/**
 * Sekiz köşeli yıldız deseni — Arap geometrik süslemesi. Koyu sahnelerin
 * zemininde çok soluk durur; uygulamaya yalnız ona ait bir kimlik verir.
 */
export function StarPattern({
  width,
  height,
  color = "#D9C08F",
  opacity = 0.13,
  cell = 56,
}: {
  width: number | string;
  height: number | string;
  color?: string;
  opacity?: number;
  cell?: number;
}) {
  const q = cell / 56;
  const pts = (arr: number[]) => arr.map((n) => n * q).join(",");
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="star8" width={cell} height={cell} patternUnits="userSpaceOnUse">
          <Polygon points={pts([16, 16, 40, 16, 40, 40, 16, 40])} fill="none" stroke={color} strokeWidth={1} />
          <Polygon points={pts([28, 11, 45, 28, 28, 45, 11, 28])} fill="none" stroke={color} strokeWidth={1} />
          <Circle cx={28 * q} cy={28 * q} r={4 * q} fill="none" stroke={color} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#star8)" opacity={opacity} />
    </Svg>
  );
}

/** Hocanın avatarı — dilin harfi, pirinç halka. speaking → halka nabız atar. */
export function TeacherAvatar({ size = 44, speaking = false, ring = true }: { size?: number; speaking?: boolean; ring?: boolean }) {
  const c = useTheme();
  const pack = getActivePack();
  const pulse = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!speaking) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, pulse]);
  const inner = ring ? size - 10 : size;
  const latin = pack.script === "latin";
  const fsz = Math.round(inner * (latin ? 0.46 : 0.5));
  // Naskh'ın satır yüksekliği harekeler için çok yüksek; avatarda tek harf
  // var, harfi daireye oturtmak için satırı daire kadar tutup optik olarak
  // biraz aşağı itiyoruz (Arap harfleri taban çizgisinin üstünde durur).
  const letterStyle: TextStyle = latin
    ? { fontFamily: "Fraunces", fontWeight: "600", fontSize: fsz, lineHeight: inner, textAlign: "center" }
    : { fontFamily: "NotoNaskhArabic", fontSize: fsz, lineHeight: inner * 1.2, textAlign: "center", marginTop: inner * 0.12 };
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {ring && (
        <Animated.View
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: c.goldDeep,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
          }}
        />
      )}
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: c.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={[letterStyle, { color: "#FFFFFF", includeFontPadding: false }]}>
          {pack.avatarLetter}
        </Text>
      </View>
    </View>
  );
}

/** Canlı dalga — konuşurken çubuklar oynar. */
export function Wave({
  active,
  color,
  bars = 5,
  height = 16,
}: {
  active: boolean;
  color?: string;
  bars?: number;
  height?: number;
}) {
  const c = useTheme();
  const anims = useMemo(() => Array.from({ length: bars }, () => new Animated.Value(0.4)), [bars]);
  React.useEffect(() => {
    if (!active) {
      anims.forEach((a) => a.setValue(0.4));
      return;
    }
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(a, { toValue: 1, duration: 260 + i * 70, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.3, duration: 260 + i * 50, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, anims]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, height }}>
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height,
            borderRadius: 2,
            backgroundColor: color ?? c.accent,
            transform: [{ scaleY: a }],
          }}
        />
      ))}
    </View>
  );
}

/** Sayı + etiket kutusu. */
export function StatTile({
  value,
  label,
  visual,
  onPress,
  style,
}: {
  value: string;
  label: string;
  visual?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const body = (
    <Surface style={[{ gap: 12, padding: 16 }, style]}>
      {visual}
      <View style={{ gap: 2 }}>
        <Txt variant="stat">{value}</Txt>
        <Txt variant="caption" color={c.inkSoft}>
          {label}
        </Txt>
      </View>
    </Surface>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} style={{ flex: 1 }} accessibilityLabel={`${value} ${label}`}>
      {body}
    </PressableScale>
  );
}

/** Boş durum. */
export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  const c = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 24, gap: 10 }}>
      <IconTile icon={icon} tone="gold" size={56} />
      <Txt variant="title3" center>
        {title}
      </Txt>
      {text ? (
        <Txt variant="callout" color={c.inkSoft} center>
          {text}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

/**
 * Ekran iskeleti: zemin + güvenli alan + (isteğe bağlı) kaydırma.
 * header, kaydırmanın DIŞINDA sabit kalır; footer altta sabit.
 */
export function Screen({
  children,
  header,
  footer,
  scroll = true,
  padded = true,
  tone = "light",
  contentStyle,
  bottomInset = true,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  tone?: "light" | "deep";
  contentStyle?: StyleProp<ViewStyle>;
  /** Sekme çubuğunun altında kalan ekranlar alt boşluğu çubuğa bırakır. */
  bottomInset?: boolean;
}) {
  const c = useTheme();
  const insets = useInsets();
  const bg = tone === "deep" ? c.deep : c.bg;
  const pad: ViewStyle = {
    paddingHorizontal: padded ? 20 : 0,
    paddingBottom: footer ? 16 : bottomInset ? 28 + insets.bottom : 24,
  };
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {header}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[pad, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 + insets.bottom, backgroundColor: bg }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/** Büyük başlıklı sekme sayfası üst bölümü. */
export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const c = useTheme();
  const insets = useInsets();
  return (
    <View style={{ paddingTop: insets.top + 18, paddingBottom: 18, flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="title1" accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="callout" color={c.inkSoft}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export type { Palette };
