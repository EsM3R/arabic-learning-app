import React from "react";
import { ScrollView, View } from "react-native";
import Icon from "../../components/Icon";
import { ListGroup, ListRow, PageTitle, PressableScale, SectionLabel, StarPattern, Txt } from "../../components/kit";
import { useTheme } from "../../useTheme";
import type { HomeModel } from "./model";

/**
 * PRATİK — bütün çalışma odaları tek listede, amaca göre gruplu.
 * Konuşma Odası en üstte ve ağır: uygulamanın hedefi konuşmak.
 */
export default function PracticeTab({ m }: { m: HomeModel }) {
  const c = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <PageTitle title="Pratik" subtitle="Hedef: konuşmak. Gerisi ona hizmet eder." />

      <PressableScale onPress={m.onOpenConversation} accessibilityLabel="Konuşma Odası">
        <View style={{ borderRadius: 26, backgroundColor: c.deep, padding: 20, overflow: "hidden", flexDirection: "row", alignItems: "center", gap: 14 }}>
          <StarPattern width="100%" height="100%" color={c.goldDeep} opacity={0.1} />
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
            <Icon name="mic" size={24} color={c.onDeep} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Txt variant="title3" color={c.onDeep}>
              Konuşma Odası
            </Txt>
            <Txt variant="caption" color={c.onDeepSoft}>
              Sesli sohbet ve rol sahneleri — yazmak yok, konuşmak var
            </Txt>
          </View>
          <Icon name="chevronRight" size={22} color={c.goldDeep} />
        </View>
      </PressableScale>

      <View style={{ marginTop: 22 }}>
        <SectionLabel title={`${m.pack.teacherName} ile`} />
        <ListGroup>
          <ListRow
            icon="message"
            title={`${m.pack.teacherName} ile Serbest Sohbet`}
            subtitle={m.pack.tracks.konusma.subtitle}
            onPress={m.onFreeChat}
          />
          <ListRow
            icon="target"
            tone="gold"
            title={`${m.pack.teacherName} ile Tekrar`}
            subtitle="Sözlü sınav — hocan sorar, puanlar, takvimini kurar"
            onPress={m.startQuiz}
            badge={m.vocabDue > 0 ? `${m.vocabDue} hazır` : undefined}
          />
        </ListGroup>
      </View>

      <View style={{ marginTop: 22 }}>
        <SectionLabel title="Kurma" />
        <ListGroup>
          <ListRow
            icon="sentence"
            tone="gold"
            title="Cümle Kurma"
            subtitle="Türkçe cümleyi parça parça kur — sıfırdan ileri düzeye"
            onPress={m.onOpenSentences}
          />
          <ListRow
            icon="timer"
            title="Akıcılık Odası · 4·3·2"
            subtitle="Aynı şeyi azalan sürede üç kez anlat — hızlanman ölçülür"
            onPress={m.onOpenFluency}
          />
        </ListGroup>
      </View>

      <View style={{ marginTop: 22 }}>
        <SectionLabel title="Dinle · oku · söyle" />
        <ListGroup>
          <ListRow
            icon="bookOpen"
            tone="info"
            title="Okuma Salonu"
            subtitle="Kelime defterinden örülmüş, sana özel okuma metinleri"
            onPress={m.onOpenReading}
          />
          <ListRow
            icon="headphones"
            tone="info"
            title="Gölgeleme"
            subtitle="Dinle, üstüne konuş — taklitle prosodi"
            onPress={m.onOpenShadowing}
          />
          <ListRow
            icon="wave"
            tone="info"
            title="Telaffuz Stüdyosu"
            subtitle="Kulak turu + dinle-kaydet-karşılaştır"
            onPress={m.onOpenPronunciation}
          />
        </ListGroup>
      </View>
    </ScrollView>
  );
}
