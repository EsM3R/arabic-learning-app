import React from "react";
import { ScrollView, View } from "react-native";
import Icon from "../../components/Icon";
import { ListGroup, ListRow, PageTitle, SectionLabel, StatTile, Surface, TargetText, Txt } from "../../components/kit";
import { useTheme } from "../../useTheme";
import type { HomeModel } from "./model";

/** DEFTER — öğrendiğin kelimeler, yaptığın hatalar, bu hafta ne ürettin. */
export default function NotebookTab({ m }: { m: HomeModel }) {
  const c = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <PageTitle title="Defter" subtitle="Kelimeler ve hatalar burada birikiyor" />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile value={String(m.vocabTotal)} label="kelime" style={{ flex: 1 }} />
        <StatTile value={String(m.vocabDue)} label="tekrar bekliyor" style={{ flex: 1 }} />
        <StatTile value={String(m.mistakeCount)} label="açık hata" style={{ flex: 1 }} />
      </View>

      <View style={{ marginTop: 22 }}>
        <SectionLabel title="Defterlerin" />
        <ListGroup>
          <ListRow
            icon="repeat"
            title="Kelime Defteri"
            subtitle={`${m.vocabTotal} kelime · yazarak ya da söyleyerek tekrar`}
            onPress={m.onOpenReview}
            badge={m.vocabDue > 0 ? m.vocabDue : undefined}
          />
          <ListRow
            icon="note"
            tone="danger"
            title="Hata Defteri"
            subtitle={`${m.mistakeCount} açık kayıt`}
            onPress={m.onOpenMistakes}
          />
        </ListGroup>
      </View>

      {m.recentWords.length > 0 && (
        <View style={{ marginTop: 22 }}>
          <SectionLabel title="Son eklenenler" action="Tümü" onAction={m.onOpenReview} />
          <ListGroup>
            {m.recentWords.map((w) => (
              <View key={w.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Txt variant="bodyStrong">{w.turkish}</Txt>
                  {w.transliteration ? (
                    <Txt variant="caption" color={c.inkSoft}>
                      {w.transliteration}
                    </Txt>
                  ) : null}
                </View>
                <TargetText size={21} align="right" style={{ maxWidth: "55%" }}>
                  {w.arabic}
                </TargetText>
              </View>
            ))}
          </ListGroup>
        </View>
      )}

      {m.recentMistakes.length > 0 && (
        <View style={{ marginTop: 22 }}>
          <SectionLabel title="Üzerinde çalıştıkların" action="Tümü" onAction={m.onOpenMistakes} />
          <ListGroup>
            {m.recentMistakes.map((x) => (
              <View key={x.id} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 3 }}>
                <Txt variant="caption" color={c.danger} style={{ textDecorationLine: "line-through" }}>
                  {x.mistake}
                </Txt>
                <Txt variant="bodyStrong" color={c.accentDark}>
                  {x.correction}
                </Txt>
                <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>
                  {x.explanation}
                </Txt>
              </View>
            ))}
          </ListGroup>
        </View>
      )}

      {m.weekLine && (
        <View style={{ marginTop: 22 }}>
          <SectionLabel title="Bu hafta" />
          <Surface style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <Icon name="chart" size={22} color={c.accentDark} />
            <Txt variant="callout" style={{ flex: 1 }}>
              {m.weekLine}
            </Txt>
          </Surface>
        </View>
      )}
    </ScrollView>
  );
}
