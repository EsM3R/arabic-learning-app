/**
 * SET BİTTİ — ilk denemelerin isabeti (tekrarlar sayılmaz) ve bu setten
 * kazanılan yardımsız kanıtlar. Rehberli adımlar "öğrenme"dir; kalıbın
 * oturmasını yardımsız söylenen farklı cümleler belirler.
 */
import React from "react";
import { View } from "react-native";
import Icon from "../../components/Icon";
import { Button, Ring, StarPattern, Txt } from "../../components/kit";
import type { CheckItem } from "./helpers";
import { useBuildStyles } from "./ui";

export interface SessionTally {
  /** Rehberli adımların ilk denemeleri. */
  ok: number;
  total: number;
  /** Yardımsız kanıtlar (tek seferde, bağlantılı, sıralama, anlatım). */
  unscaffolded: number;
  transfer: number;
  retell: number;
}

export default function DoneView({
  sentences,
  tally,
  mode,
  checklist,
  patternTitle,
  savedBlocks,
  nextEpisode,
  onNext,
  onRetell,
  onStory,
  onOneShot,
  onPractice,
  onSaveBlocks,
  onHome,
}: {
  sentences: number;
  tally: SessionTally;
  mode: "learn" | "review" | "practice";
  /** Odak kalıbın oturma listesi: bu setten sonra neyin eksik kaldığı. */
  checklist: CheckItem[];
  patternTitle: string;
  savedBlocks: boolean;
  nextEpisode: number;
  onNext: () => void;
  onRetell: () => void;
  /** "1 dakikada anlat": bütün hikâye tek seferde, hoca raporlar. */
  onStory?: () => void;
  onOneShot: () => void;
  onPractice: () => void;
  onSaveBlocks: () => void;
  onHome: () => void;
}) {
  const { s, c } = useBuildStyles();
  const pct = tally.total ? Math.round((tally.ok / tally.total) * 100) : 0;
  const delta = [
    tally.unscaffolded ? `${tally.unscaffolded} yardımsız cümle` : "",
    tally.transfer ? `${tally.transfer} aktarım` : "",
    tally.retell ? `${tally.retell} anlatım` : "",
  ].filter(Boolean);
  return (
    <View style={{ gap: 14 }}>
      <View style={[s.deepCard, { alignItems: "center" }]}>
        <StarPattern width="100%" height="100%" color={c.goldDeep} opacity={0.09} />
        <Ring progress={pct / 100} size={84} stroke={7} color={c.goldDeep} track={c.onDeepTrack} label={`%${pct}`} labelColor={c.onDeep} />
        <Txt variant="title2" color={c.onDeep} center style={{ marginTop: 14 }}>
          {`${sentences} cümle kurdun`}
        </Txt>
        <Txt variant="callout" color={c.onDeepSoft} center style={{ marginTop: 6 }}>
          {tally.total
            ? `Adımların %${pct}'i ilk seferde doğru.`
            : "Bu turda rehberli adım yoktu."}
          {mode === "practice" ? " Pratikti; ilerlemeye sayılmadı." : ""}
        </Txt>
        {delta.length > 0 && mode !== "practice" && (
          <Txt variant="caption" color={c.goldDeep} center style={{ marginTop: 8 }}>
            {`Kazandığın kanıt: ${delta.join(", ")}`}
          </Txt>
        )}
        {checklist.length > 0 && (
          <View style={{ marginTop: 14, alignSelf: "stretch", gap: 6 }}>
            <Txt variant="overline" color={c.goldDeep} center>
              {`KALIBIN OTURMASI · ${patternTitle}`}
            </Txt>
            <View style={[s.wrap, { justifyContent: "center", gap: 6 }]}>
              {checklist.map((it) => (
                <View key={it.label} style={[s.row, { gap: 4, marginRight: 8 }]}>
                  <Icon name={it.ok ? "check" : "close"} size={13} color={it.ok ? c.goldDeep : c.onDeepSoft} strokeWidth={2.6} />
                  <Txt variant="caption" color={it.ok ? c.goldDeep : c.onDeepSoft}>
                    {it.label}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
      <View style={{ gap: 10 }}>
        <Button icon="plus" label={`Devam (Bölüm ${nextEpisode})`} onPress={onNext} />
        <Button variant="secondary" size="md" icon="message" label="Günümü anlat" onPress={onRetell} />
        {onStory ? <Button variant="secondary" size="md" icon="timer" label="1 dakikada anlat" onPress={onStory} /> : null}
        <Button variant="secondary" size="md" icon="target" label="Tek seferde tekrar" onPress={onOneShot} />
        <Button variant="secondary" size="md" icon="replay" label="Pratik et (sayılmaz)" onPress={onPractice} />
        <Button
          variant="secondary"
          size="md"
          icon={savedBlocks ? "check" : "bookmark"}
          label={savedBlocks ? "Defterde" : "Yapı taşlarını deftere ekle"}
          disabled={savedBlocks}
          onPress={onSaveBlocks}
        />
        <Button variant="ghost" size="md" label="Başka hikâye" onPress={onHome} />
      </View>
    </View>
  );
}
