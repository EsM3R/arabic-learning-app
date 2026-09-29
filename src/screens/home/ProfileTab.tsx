import React from "react";
import { ScrollView, View } from "react-native";
import Icon from "../../components/Icon";
import {
  IconTile,
  ListGroup,
  ListRow,
  PageTitle,
  PressableScale,
  Ring,
  SectionLabel,
  Surface,
  Txt,
} from "../../components/kit";
import { useTheme } from "../../useTheme";
import type { Track } from "../../types";
import type { HomeModel } from "./model";

const TRACKS: Track[] = ["konusma", "okuma"];

/** PROFİL — seviye, müfredatın tamamı, dil, ayarlar. */
export default function ProfileTab({ m }: { m: HomeModel }) {
  const c = useTheme();
  const { assessment, curriculum, completedModuleIds } = m.profile;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <PageTitle title={m.profile.name} subtitle={`${m.pack.label} · hocan ${m.pack.teacherName}`} />

      <PressableScale onPress={m.onOpenLevel} accessibilityLabel="Seviye raporu">
        <Surface raised style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Ring progress={m.progress} size={72} stroke={7} label={`%${Math.round(m.progress * 100)}`} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <View>
                <Txt variant="caption" color={c.inkSoft}>
                  Konuşma
                </Txt>
                <Txt variant="title2">{assessment?.speakingLevel ?? "A0"}</Txt>
              </View>
              <View>
                <Txt variant="caption" color={c.inkSoft}>
                  Okuma
                </Txt>
                <Txt variant="title2">{assessment?.readingLevel ?? "A0"}</Txt>
              </View>
            </View>
            <Txt variant="caption" color={c.accentDark}>
              {m.totalModules > 0 ? `${m.doneModules}/${m.totalModules} modül tamam · ` : ""}Seviye raporu ›
            </Txt>
          </View>
        </Surface>
      </PressableScale>

      {TRACKS.map((track) => {
        const modules = curriculum?.modules.filter((x) => x.track === track) ?? [];
        if (modules.length === 0) return null;
        const done = modules.filter((x) => completedModuleIds.includes(x.id)).length;
        return (
          <View key={track} style={{ marginTop: 22 }}>
            <SectionLabel title={`${m.pack.tracks[track].title} · ${done}/${modules.length}`} />
            <ListGroup>
              {modules.map((mod, i) => {
                const isDone = completedModuleIds.includes(mod.id);
                return (
                  <PressableScale key={mod.id} onPress={() => m.onOpenModule(mod)} scaleTo={0.985} accessibilityLabel={mod.title}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                      {isDone ? (
                        <IconTile icon="check" tone="deep" size={34} />
                      ) : (
                        <View style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
                          <Txt variant="caption" style={{ fontWeight: "800" }}>
                            {i + 1}
                          </Txt>
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt variant="bodyStrong" color={isDone ? c.inkSoft : c.ink}>
                          {mod.title}
                        </Txt>
                        <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>
                          {mod.description}
                        </Txt>
                      </View>
                      <Txt variant="caption" color={c.gold} style={{ fontWeight: "800" }}>
                        {mod.level}
                      </Txt>
                    </View>
                  </PressableScale>
                );
              })}
            </ListGroup>
          </View>
        );
      })}

      <View style={{ marginTop: 22 }}>
        <SectionLabel title="Uygulama" />
        <ListGroup>
          <ListRow icon="globe" tone="info" title="Dil değiştir" subtitle={`Şu an: ${m.pack.label}`} onPress={m.pickLanguage} />
          <ListRow icon="settings" tone="neutral" title="Ayarlar" subtitle="Model, anahtar, ses, harcama tavanı, yedek" onPress={m.onOpenSettings} />
        </ListGroup>
      </View>

      <View style={{ marginTop: 22 }}>
        <ListGroup>
          <PressableScale onPress={m.confirmReset} accessibilityLabel="Sıfırla" scaleTo={0.985}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 }}>
              <IconTile icon="trash" tone="danger" size={34} />
              <Txt variant="bodyStrong" color={c.danger} style={{ flex: 1 }}>
                Sıfırla
              </Txt>
              <Icon name="chevronRight" size={18} color={c.inkFaint} />
            </View>
          </PressableScale>
        </ListGroup>
      </View>
    </ScrollView>
  );
}
