import { StatusBar } from "expo-status-bar";
import React from "react";
import { ScrollView, View } from "react-native";
import Icon from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import {
  Button,
  PressableScale,
  Ring,
  SectionLabel,
  StarPattern,
  Surface,
  TargetText,
  TeacherAvatar,
  Txt,
  useInsets,
} from "../../components/kit";
import { Skeleton } from "../../components/ui";
import type { ActionScreen } from "../../nextaction";
import { useTheme } from "../../useTheme";
import type { HomeModel } from "./model";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function greetingFor(h: number): string {
  if (h >= 5 && h < 11) return "Günaydın";
  if (h >= 11 && h < 17) return "İyi günler";
  if (h >= 17 && h < 22) return "İyi akşamlar";
  return "İyi geceler";
}

const ACTION_ICON: Record<ActionScreen, IconName> = {
  review: "repeat",
  lesson: "message",
  module: "mic",
  reading: "bookOpen",
  pronunciation: "wave",
  shadowing: "headphones",
  fluency: "timer",
  mistakes: "note",
  curriculum: "layers",
};

/**
 * BUGÜN — tek soru, tek cevap: "şimdi ne yapayım?"
 * Koyu desenli başlık + üstüne binen tek bir ana kart. Gerisi ikincil.
 */
export default function TodayTab({ m }: { m: HomeModel }) {
  const c = useTheme();
  const insets = useInsets();
  const now = new Date();
  const date = `${DAYS[now.getDay()]} · ${now.getDate()} ${MONTHS[now.getMonth()]}`.toLocaleUpperCase("tr-TR");
  const initial = (m.profile.name.trim()[0] ?? "?").toLocaleUpperCase("tr-TR");
  const weekVoice = m.week.reduce((s, d) => s + d.voice, 0);
  const maxVoice = Math.max(1, ...m.week.map((d) => d.voice));
  const allDone = m.totalModules > 0 && m.doneModules === m.totalModules;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <StatusBar style="light" />
      {/* Koyu başlık: desen + selam + haftanın günleri */}
      <View style={{ backgroundColor: c.deep, paddingTop: insets.top + 14, paddingHorizontal: 22, paddingBottom: 66, overflow: "hidden" }}>
        <StarPattern width="100%" height="100%" color={c.goldDeep} opacity={0.12} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Txt variant="overline" color={c.goldDeep}>
            {date}
          </Txt>
          <PressableScale
            onPress={() => m.goTab("profile")}
            accessibilityLabel="Profilim"
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              borderWidth: 1.5,
              borderColor: c.goldDeep,
              backgroundColor: "rgba(217,192,143,0.12)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Txt variant="headline" color={c.onDeep} style={{ fontSize: 14 }}>
              {initial}
            </Txt>
          </PressableScale>
        </View>
        <View style={{ marginTop: 14 }}>
          <TargetText size={21} color={c.goldDeep} align="left">
            {m.pack.greeting}
          </TargetText>
          <Txt variant="display" color={c.onDeep}>
            {greetingFor(now.getHours())}, {m.profile.name}
          </Txt>
        </View>
        {m.week.length === 7 && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 20 }}>
            {m.week.map((d) => (
              <View key={d.key} style={{ alignItems: "center", gap: 6 }}>
                <Txt variant="caption" color={c.onDeepSoft} style={{ fontSize: 10.5 }}>
                  {d.label}
                </Txt>
                <View
                  accessibilityLabel={`${d.label} ${d.active ? "çalıştın" : ""}`}
                  style={[
                    { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
                    d.active
                      ? { backgroundColor: c.goldDeep }
                      : d.isToday
                        ? { borderWidth: 1.5, borderStyle: "dashed", borderColor: c.goldDeep }
                        : { backgroundColor: "rgba(255,255,255,0.07)" },
                  ]}
                >
                  {d.active ? (
                    <Icon name="check" size={15} color={c.onGold} strokeWidth={3} />
                  ) : d.isToday ? (
                    <Txt variant="caption" color={c.goldDeep} style={{ fontWeight: "800" }}>
                      {d.day}
                    </Txt>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: -46, gap: 14 }}>
        {/* ANA KART */}
        {!m.loaded ? (
          <Surface raised style={{ gap: 12 }}>
            <Skeleton width="40%" height={11} />
            <Skeleton width="80%" height={22} />
            <Skeleton width="60%" height={13} />
            <Skeleton width="100%" height={52} />
          </Surface>
        ) : m.totalModules === 0 ? (
          <Surface raised style={{ gap: 14 }}>
            <Txt variant="overline" color={c.gold}>
              İLK ADIM
            </Txt>
            <Txt variant="title2">Müfredatını kur</Txt>
            <Txt variant="callout" color={c.inkSoft}>
              Sıfırdan başlıyorsun — {m.pack.teacherName} iki parkur için 12-16 derslik bir başlangıç
              müfredatı tasarlasın. Bir API isteği harcar; sonrası burada hazır.
            </Txt>
            {m.buildError ? (
              <Txt variant="caption" color={c.danger} selectable>
                {m.buildError}
              </Txt>
            ) : null}
            <Button
              icon="layers"
              label={m.building ? `Hazırlanıyor… ${m.buildElapsed}s` : m.buildError ? "Tekrar dene" : "Müfredatı kur"}
              onPress={m.startCurriculumBuild}
              disabled={m.building}
            />
          </Surface>
        ) : m.today ? (
          <Surface raised style={{ gap: 16 }}>
            <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Txt variant="overline" color={c.gold}>
                  {`SIRADAKİ ADIM${m.today.badge ? ` · ${m.today.badge}` : ""}`}
                </Txt>
                <Txt variant="title2">{m.today.label}</Txt>
                <Txt variant="callout" color={c.inkSoft}>
                  {m.today.reason}
                </Txt>
              </View>
              <Ring progress={m.progress} size={64} label={`%${Math.round(m.progress * 100)}`} />
            </View>
            <Button icon={ACTION_ICON[m.today.screen]} label="Başla" onPress={m.openToday} />
          </Surface>
        ) : null}

        {allDone && (
          <PressableScale onPress={m.onLevelUp} accessibilityLabel="Sıradaki seviyeye geç">
            <Surface tone="gold" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Icon name="award" size={28} color={c.gold} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="headline">Bu seviyeyi bitirdin</Txt>
                <Txt variant="caption" color={c.inkSoft}>
                  {m.totalModules} modülün hepsi tamam. {m.pack.teacherName} sıradaki seviyenin müfredatını kursun.
                </Txt>
              </View>
              <Icon name="chevronRight" size={20} color={c.gold} />
            </Surface>
          </PressableScale>
        )}

        {m.fusha && (
          <Surface tone="gold" style={{ gap: 10 }}>
            <Txt variant="headline">Fushaya geçiş</Txt>
            <Txt variant="callout" color={c.inkSoft}>
              Artık yalnız fusha öğreniyorsun; ammice dersleri kaldırıldı. Defterindeki eski ammice
              kartların ve ammiceye göre kurulmuş müfredatın temizlenmesi gerekiyor — sonrasında hocan
              sıfırdan fusha müfredatı kuracak.
            </Txt>
            <Txt variant="caption" color={c.gold}>
              {m.fusha.cardsToRemove > 0
                ? `${m.fusha.cardsToRemove} ammice kart · ${m.fusha.modulesToClear} modül`
                : `${m.fusha.modulesToClear} modül`}
            </Txt>
            <Button variant="primary" size="md" label="Temizle ve fushaya geç" onPress={m.confirmFushaMigration} />
          </Surface>
        )}

        {/* İki kutu: tekrar + bu haftaki sesli iş */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <PressableScale onPress={m.onOpenReview} style={{ flex: 1 }} accessibilityLabel={`${m.vocabDue} kelime tekrar bekliyor`}>
            <Surface style={{ gap: 12, padding: 16 }}>
              <View style={{ height: 44 }}>
                <View style={{ position: "absolute", left: 16, top: 0, width: 50, height: 36, borderRadius: 8, backgroundColor: c.bgAlt, transform: [{ rotate: "8deg" }] }} />
                <View style={{ position: "absolute", left: 8, top: 3, width: 50, height: 36, borderRadius: 8, backgroundColor: c.goldSoft, transform: [{ rotate: "-4deg" }] }} />
                <View style={{ position: "absolute", left: 0, top: 7, width: 50, height: 36, borderRadius: 8, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="repeat" size={17} color="#FFFFFF" />
                </View>
              </View>
              <View style={{ gap: 2 }}>
                {m.loaded ? <Txt variant="stat">{m.vocabDue}</Txt> : <Skeleton width={28} height={22} />}
                <Txt variant="caption" color={c.inkSoft}>
                  kelime tekrar bekliyor
                </Txt>
              </View>
            </Surface>
          </PressableScale>
          <PressableScale onPress={m.onOpenConversation} style={{ flex: 1 }} accessibilityLabel={`Bu hafta ${weekVoice} sesli iş`}>
            <Surface style={{ gap: 12, padding: 16 }}>
              <View style={{ height: 44, flexDirection: "row", alignItems: "flex-end", gap: 5 }}>
                {(m.week.length ? m.week : Array.from({ length: 7 }, () => null)).map((d, i) => (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: d && !d.future ? Math.max(5, (d.voice / maxVoice) * 44) : 5,
                      borderRadius: 4,
                      backgroundColor: d?.isToday ? c.accent : d && !d.future ? c.accentSoft : c.line,
                    }}
                  />
                ))}
              </View>
              <View style={{ gap: 2 }}>
                {m.loaded ? <Txt variant="stat">{weekVoice}</Txt> : <Skeleton width={28} height={22} />}
                <Txt variant="caption" color={c.inkSoft}>
                  bu hafta sesli iş
                </Txt>
              </View>
            </Surface>
          </PressableScale>
        </View>

        {m.teacherNote && (
          <Surface style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TeacherAvatar size={38} />
              <View style={{ flex: 1 }}>
                <Txt variant="headline" style={{ fontSize: 15 }}>
                  {m.pack.teacherName}'dan not
                </Txt>
                <Txt variant="caption" color={c.inkSoft}>
                  Hocandan not
                </Txt>
              </View>
            </View>
            <Txt variant="body">{m.teacherNote}</Txt>
            {m.teacherSuggestion && (
              <Button variant="secondary" size="md" icon="arrowRight" label={m.teacherSuggestion.label} onPress={m.onSuggestionPress} />
            )}
          </Surface>
        )}

        {m.backupWarn && (
          <PressableScale onPress={m.onOpenSettings} accessibilityLabel="Yedek al">
            <Surface tone="sunken" style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Icon name="download" size={22} color={c.ink} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong">Yedek al</Txt>
                <Txt variant="caption" color={c.inkSoft}>
                  {m.backupWarn.message}
                </Txt>
              </View>
              <Icon name="chevronRight" size={18} color={c.inkFaint} />
            </Surface>
          </PressableScale>
        )}

        {m.totalModules > 0 && (
          <View style={{ marginTop: 6 }}>
            <SectionLabel title="Hızlı başla" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              {(
                [
                  { icon: "message", label: "Serbest sohbet", tone: c.accentSoft, fg: c.accentDark, on: m.onFreeChat },
                  { icon: "sentence", label: "Cümle kur", tone: c.goldSoft, fg: c.gold, on: m.onOpenSentences },
                  { icon: "bookOpen", label: "Oku", tone: c.infoSoft, fg: c.info, on: m.onOpenReading },
                ] as const
              ).map((q) => (
                <PressableScale key={q.label} onPress={q.on} style={{ flex: 1 }} accessibilityLabel={q.label}>
                  <Surface style={{ padding: 14, gap: 16 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: q.tone, alignItems: "center", justifyContent: "center" }}>
                      <Icon name={q.icon} size={19} color={q.fg} />
                    </View>
                    <Txt variant="callout" style={{ fontWeight: "700" }}>
                      {q.label}
                    </Txt>
                  </Surface>
                </PressableScale>
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
