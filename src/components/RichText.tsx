import React from "react";
import { StyleSheet, Text, TextStyle, View } from "react-native";
import { Block, classifyLine, InlineToken, splitInline, splitScript } from "../richtext";
import { arabicText, colors } from "../theme";

/**
 * Hocanın mesajlarını okunabilir biçimde basar.
 *
 * Model doğal olarak markdown yazıyor: **kalın**, madde işaretleri, numaralı
 * listeler, başlıklar. Bunlar tek bir <Text> içine dökülünce ekrana ham
 * yıldızlar ve tirelerle duvar gibi geliyordu.
 *
 * Ayrıştırma saf modülde (src/richtext.ts) — burada yalnızca çizim var.
 */

const SCRIPT_SCALE = 1.25;

interface Props {
  content: string;
  style: TextStyle;
  /** Ayrı alfabedeki parçaları büyüt (Arapça için true). */
  scaleScript?: boolean;
}

/**
 * Arapça parçaları ayrı <Text> olarak basar.
 *
 * İki tuzak burada kapatılıyor:
 * 1) lineHeight çarpanı 1.6 idi; harekeli metnin ihtiyacı 2.25 (bkz. theme.ts).
 *    1.6 ile `أَلْلَّٰهُ` gibi yığılmalı biçimler tepeden kırpılıyordu.
 * 2) Kalın gövdede fontWeight mirası Arapça fontu düşürüyordu; kalın için
 *    fontWeight değil ayrı aile adı (SemiBold) verilir.
 */
function renderRuns(
  text: string,
  baseSize: number,
  scaleScript: boolean,
  key: string,
  bold = false
): React.ReactNode {
  if (!scaleScript) return text;
  const runs = splitScript(text);
  if (runs.length === 1 && !runs[0].arabic) return text;
  return runs.map((run, i) =>
    run.arabic ? (
      <Text
        key={`${key}r${i}`}
        style={[
          arabicText(Math.round(baseSize * SCRIPT_SCALE), bold),
          // Kalın sarmalayıcıdan miras kalan fontWeight'i açıkça sıfırla:
          // Android'de 700+ özel Arapça fontu sistem fontuna düşürür.
          styles.arabicWeightReset,
        ]}
      >
        {run.text}
      </Text>
    ) : (
      run.text
    )
  );
}

function renderInline(
  text: string,
  baseSize: number,
  scaleScript: boolean,
  key: string
): React.ReactNode[] {
  return splitInline(text).map((token: InlineToken, i) => {
    const k = `${key}i${i}`;
    const inner = renderRuns(token.text, baseSize, scaleScript, k, token.kind === "bold");
    if (token.kind === "bold") {
      return (
        <Text key={k} style={styles.bold}>
          {inner}
        </Text>
      );
    }
    if (token.kind === "italic") {
      return (
        <Text key={k} style={styles.italic}>
          {inner}
        </Text>
      );
    }
    if (token.kind === "code") {
      return (
        <Text key={k} style={styles.code}>
          {token.text}
        </Text>
      );
    }
    return <Text key={k}>{inner}</Text>;
  });
}

export default function RichText({ content, style, scaleScript = false }: Props) {
  const baseSize = typeof style.fontSize === "number" ? style.fontSize : 15;
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  const nodes: React.ReactNode[] = [];
  let lastWasBlank = true; // baştaki boşlukları yut

  lines.forEach((raw, idx) => {
    const block: Block = classifyLine(raw);
    const key = `l${idx}`;

    if (block.type === "blank") {
      if (!lastWasBlank) nodes.push(<View key={`g${idx}`} style={styles.gap} />);
      lastWasBlank = true;
      return;
    }
    lastWasBlank = false;

    const content = renderInline(block.text, baseSize, scaleScript, key);

    if (block.type === "heading") {
      nodes.push(
        <Text key={key} style={[style, styles.heading]}>
          {content}
        </Text>
      );
      return;
    }
    if (block.type === "bullet" || block.type === "numbered") {
      nodes.push(
        <View key={key} style={styles.row}>
          <Text style={[style, styles.marker]}>{block.marker}</Text>
          <Text style={[style, styles.rowText]}>{content}</Text>
        </View>
      );
      return;
    }
    if (block.type === "quote") {
      nodes.push(
        <View key={key} style={styles.quote}>
          <Text style={[style, styles.quoteText]}>{content}</Text>
        </View>
      );
      return;
    }
    nodes.push(
      <Text key={key} style={style}>
        {content}
      </Text>
    );
  });

  return <View>{nodes}</View>;
}

const styles = StyleSheet.create({
  gap: { height: 9 },
  bold: { fontWeight: "800" },
  /** Arapça run'ı, kalın sarmalayıcının fontWeight mirasından korur. */
  arabicWeightReset: { fontWeight: "400" },
  italic: { fontStyle: "italic" },
  code: { color: colors.accentDark },
  heading: { fontWeight: "800", marginTop: 2, marginBottom: 1 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  marker: { fontWeight: "800", color: colors.accentDark, minWidth: 16 },
  rowText: { flex: 1 },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.goldDeep,
    paddingLeft: 10,
    marginVertical: 3,
  },
  quoteText: { fontStyle: "italic" },
});
