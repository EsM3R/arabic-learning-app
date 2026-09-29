/**
 * Ortak arayüz bileşenleri.
 *
 * Denetimde çıkan kusur: her ekran kendi StyleSheet'inde kart, rozet, boş
 * durum ve başlık kalıbını yeniden yazıyordu; jetonlar (theme.ts) yerine
 * sabit değerler kullanılıyordu. Sonuç: ekranlar arası görsel tutarsızlık
 * ve karanlık moda geçilemez bir yapı.
 *
 * Buradaki bileşenler paleti useTheme()'den alır — renk sabiti yazmazlar,
 * dolayısıyla karanlık modu bedava desteklerler.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { radius, shadow, spacing } from "../theme";
import { useTheme } from "../useTheme";

// ---------------------------------------------------------------------------
// Yüzeyler
// ---------------------------------------------------------------------------

export function Card({
  children,
  style,
  tone = "card",
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** card: normal yüzey · sunken: zeminle aynı, çerçeveli · deep: koyu vurgu */
  tone?: "card" | "sunken" | "deep";
}) {
  const c = useTheme();
  const bg = tone === "deep" ? c.deep : tone === "sunken" ? c.bgAlt : c.card;
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.lg,
          borderWidth: tone === "deep" ? 0 : 1,
          borderColor: c.border,
          padding: spacing.lg,
        },
        tone !== "sunken" && shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Bölüm başlığı — panelin gruplara ayrılmasını sağlar. */
export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  const c = useTheme();
  return (
    <View style={styles.sectionWrap}>
      <Text style={[styles.sectionTitle, { color: c.inkSoft }]}>{title.toUpperCase()}</Text>
      {hint ? <Text style={[styles.sectionHint, { color: c.inkFaint }]}>{hint}</Text> : null}
    </View>
  );
}

/** Küçük rozet/etiket. */
export function Pill({
  text,
  tone = "neutral",
  style,
}: {
  text: string;
  tone?: "neutral" | "accent" | "gold" | "danger";
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const map = {
    neutral: { bg: c.bgAlt, fg: c.inkSoft },
    accent: { bg: c.accentSoft, fg: c.accentDark },
    gold: { bg: c.goldSoft, fg: c.gold },
    danger: { bg: c.dangerSoft, fg: c.danger },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }, style]}>
      <Text style={[styles.pillText, { color: map.fg }]}>{text}</Text>
    </View>
  );
}

/** Tutarlı boş durum: her ekranda ayrı yazılıyordu. */
export function EmptyState({
  emoji,
  title,
  text,
  action,
}: {
  emoji: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  const c = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={[styles.emptyTitle, { color: c.ink }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: c.inkSoft }]}>{text}</Text>
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Yükleniyor: sıfır yerine iskelet
//
// Panel açılışta "0 kelime / 0 tekrar / 0 hata" yazıp sonra gerçek sayılara
// zıplıyordu — bir an için öğrenciye "hiçbir şeyin yok" demek oluyordu.
// İskelet bunu önler.
// ---------------------------------------------------------------------------

export function Skeleton({
  width,
  height = 14,
  style,
}: {
  width: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: 7, backgroundColor: c.skeleton, opacity: pulse },
        style,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// İlerleme halkası — müfredat ilerlemesi için (çubuktan daha okunur ve
// panelde tek bakışta anlaşılır).
// ---------------------------------------------------------------------------

export function ProgressRing({
  progress,
  size = 62,
  stroke = 6,
  label,
  sublabel,
  color,
}: {
  /** 0-1 arası. */
  progress: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  color?: string;
}) {
  const c = useTheme();
  const p = Math.max(0, Math.min(1, progress));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.border}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? c.goldDeep}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - p)}
          // Halka tepeden başlasın (SVG varsayılanı sağdan başlar).
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {label ? (
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.ringLabel, { color: c.ink }]}>{label}</Text>
          {sublabel ? (
            <Text style={[styles.ringSub, { color: c.inkFaint }]}>{sublabel}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** İnce ilerleme çubuğu (oturum ilerlemesi gibi yerlerde). */
export function ProgressBar({
  progress,
  color,
  height = 6,
}: {
  progress: number;
  color?: string;
  height?: number;
}) {
  const c = useTheme();
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: c.bgAlt,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${p * 100}%`,
          borderRadius: height / 2,
          backgroundColor: color ?? c.accent,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionWrap: { marginTop: spacing.xxl, marginBottom: spacing.md },
  sectionTitle: { fontSize: 11.5, fontWeight: "800", letterSpacing: 1.1 },
  sectionHint: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 11.5, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyEmoji: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: "800", marginBottom: 7 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  ringLabel: { fontSize: 15, fontWeight: "800" },
  ringSub: { fontSize: 9.5, fontWeight: "700", marginTop: -1 },
});
