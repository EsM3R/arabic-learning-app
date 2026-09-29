import React, { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import Header from "../components/Header";
import Icon from "../components/Icon";
import { Empty, Surface, Txt } from "../components/kit";
import { ltrLine } from "../richtext";
import { loadMistakes } from "../storage";
import { useTheme } from "../useTheme";
import { MistakeEntry } from "../types";

interface Props {
  onBack: () => void;
}

/** HATA DEFTERİ — hocanın kaydettiği hatalar; en yenisi üstte. */
export default function MistakesScreen({ onBack }: Props) {
  const c = useTheme();
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const entries = await loadMistakes();
      setMistakes([...entries].reverse()); // en yeni üstte
      setLoaded(true);
    })();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Hata Defteri" subtitle={`${mistakes.length} kayıt`} onBack={onBack} />

      {loaded && mistakes.length === 0 ? (
        <Empty
          icon="note"
          title="Defter tertemiz"
          text="Derslerde anlamlı bir hata yaptığında hocan buraya kendisi kaydedecek ve sonraki derslerde üzerinden geçecek."
        />
      ) : (
        <FlatList
          data={mistakes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 32, gap: 12 }}
          renderItem={({ item }) => (
            <Surface style={[{ gap: 8 }, item.resolved && { opacity: 0.6 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Txt variant="overline" color={c.gold} style={{ flex: 1 }} numberOfLines={1}>
                  {item.topic}
                </Txt>
                {(item.timesSeen ?? 1) >= 3 && !item.resolved && (
                  <Txt variant="caption" color={c.danger} style={{ fontWeight: "800" }}>
                    {item.timesSeen}×
                  </Txt>
                )}
                {item.resolved && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Icon name="check" size={13} color={c.accentDark} strokeWidth={2.8} />
                    <Txt variant="overline" color={c.accentDark} style={{ fontSize: 10 }}>
                      ÇÖZÜLDÜ
                    </Txt>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Icon name="close" size={16} color={c.danger} strokeWidth={2.6} />
                <Txt variant="body" color={c.danger} style={{ flex: 1 }}>
                  {item.mistake}
                </Txt>
              </View>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Icon name="check" size={16} color={c.accentDark} strokeWidth={2.6} />
                <Txt variant="bodyStrong" color={c.accentDark} style={{ flex: 1 }}>
                  {item.correction}
                </Txt>
              </View>
              <Txt variant="callout" color={c.inkSoft}>
                {ltrLine(item.explanation)}
              </Txt>
            </Surface>
          )}
        />
      )}
    </View>
  );
}
