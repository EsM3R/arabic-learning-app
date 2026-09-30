/**
 * KALIP MERDİVENİ — A1'den C2'ye bütün kalıplar ve durumları. Öğrenci
 * istediği kalıbı seçip çalışabilir (focusOverride) ya da bildiğini
 * düşündüğü kalıbı "Sına ve geç" ile 4 tek seferlik cümleyle atlayabilir
 * (tasarım §6.5). Oturmuş kalıp yeniden rehberli setle kurulmaz (CM-13):
 * onun için yalnız "Tek seferde tekrar" var.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Badge, Button, ListGroup, ListRow, Segmented, Txt } from "../../components/kit";
import type { PatternProgress, PatternStatus, ProgressMap2 } from "../../buildmastery";
import { BANDS, PATTERN_LADDER } from "../../sentencebuilding";
import type { Band, Pattern } from "../../sentencebuilding";
import { useBuildStyles } from "./ui";

const STATUS: Record<PatternStatus, { label: string; tone: "ink" | "accent" | "gold" | "danger" }> = {
  new: { label: "yeni", tone: "ink" },
  learning: { label: "öğreniyor", tone: "ink" },
  proving: { label: "kanıtlıyor", tone: "gold" },
  verify: { label: "doğrulanacak", tone: "gold" },
  mastered: { label: "oturdu", tone: "accent" },
  slipping: { label: "soluyor", tone: "danger" },
};

export function statusLabel(p: PatternProgress | undefined): { label: string; tone: "ink" | "accent" | "gold" | "danger" } {
  return STATUS[p?.status ?? "new"];
}

export default function LadderPicker({
  progress,
  focusId,
  initialBand,
  onStudy,
  onTestOut,
  onReview,
}: {
  progress: ProgressMap2;
  /** Şu anki odak (vurgulu). */
  focusId?: string;
  initialBand: Band;
  onStudy: (p: Pattern) => void;
  onTestOut: (p: Pattern) => void;
  onReview: (p: Pattern) => void;
}) {
  const { s, c } = useBuildStyles();
  const [band, setBand] = useState<Band>(initialBand);
  const [open, setOpen] = useState<string | null>(null);
  const list = PATTERN_LADDER.filter((p) => p.band === band);
  const done = list.filter((p) => progress[p.id]?.status === "mastered" || progress[p.id]?.status === "verify").length;
  return (
    <View style={{ gap: 14 }}>
      <Txt variant="callout" color={c.inkSoft}>
        İstediğin kalıbı seç: ya onu çalış ya da bildiğini düşünüyorsan 4 cümleyle sına ve geç.
      </Txt>
      <Segmented options={BANDS.map((b) => ({ key: b, label: b }))} value={band} onChange={(b) => { setBand(b); setOpen(null); }} />
      <Txt variant="caption" color={c.inkSoft}>{`${band}: ${done}/${list.length} kalıp geçildi`}</Txt>
      <ListGroup>
        {list.map((p) => {
          const pr = progress[p.id];
          const st = statusLabel(pr);
          const settled = pr?.status === "mastered" || pr?.status === "verify";
          const expanded = open === p.id;
          return (
            <View key={p.id}>
              <ListRow
                icon={settled ? "check" : p.id === focusId ? "target" : "sentence"}
                tone={settled ? "accent" : p.id === focusId ? "gold" : "neutral"}
                title={p.title}
                subtitle={p.trigger ? `${p.trigger}${p.question ? ` · ${p.question}` : ""}` : p.concept}
                right={<Badge text={p.id === focusId ? "sıradaki" : st.label} tone={p.id === focusId ? "gold" : st.tone} />}
                chevron={false}
                onPress={() => setOpen(expanded ? null : p.id)}
                accessibilityLabel={`Kalıp: ${p.title}`}
              />
              {expanded && (
                <View style={[s.row, { paddingHorizontal: 14, paddingBottom: 12, flexWrap: "wrap" }]}>
                  {settled ? (
                    <Button size="sm" variant="secondary" icon="target" label="Tek seferde tekrar" onPress={() => onReview(p)} />
                  ) : (
                    <>
                      <Button size="sm" icon="play" label="Bunu çalış" onPress={() => onStudy(p)} />
                      <Button size="sm" variant="secondary" icon="zap" label="Sına ve geç" onPress={() => onTestOut(p)} />
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ListGroup>
    </View>
  );
}
