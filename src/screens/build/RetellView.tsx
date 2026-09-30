/**
 * GÜNÜMÜ ANLAT — set bitince hikâyenin tamamını baştan anlatmak. Her cümle
 * tek seferde söylenir ve yardımsız kanıt sayılır. A1–B1'de Türkçe cümle
 * görünür; B2+ yalnız sahnenin adı (hikâyeyi kendi cümlelerinle kurarsın).
 * "Hepsini bir kerede": tek kayıt, cihaz cümlelere böler.
 */
import React from "react";
import { View } from "react-native";
import Icon from "../../components/Icon";
import { Surface, TargetText, TeacherAvatar, Txt } from "../../components/kit";
import type { BuildSet } from "../../sentencebuilding";
import type { Attempt, ViewOpts } from "./types";
import { CueChip, useBuildStyles } from "./ui";

export default function RetellView({
  set,
  indices,
  at,
  all,
  showTr,
  stageOf,
  attempts,
  view,
  title = "Günümü anlat",
}: {
  set: BuildSet;
  indices: number[];
  /** Sıradaki cümle (indices içindeki yeri); -1 = giriş. */
  at: number;
  all: boolean;
  showTr: boolean;
  stageOf: (si: number) => string;
  attempts: Record<number, Attempt>;
  view: ViewOpts;
  title?: string;
}) {
  const { s, c } = useBuildStyles();
  const prompt = (si: number) => (showTr ? set.sentences[si].tr : stageOf(si));

  if (at < 0) {
    return (
      <View style={{ gap: 14 }}>
        <View style={s.row}>
          <TeacherAvatar size={40} />
          <Txt variant="headline" style={{ flex: 1 }}>
            {title}
          </Txt>
        </View>
        <Surface raised style={{ gap: 10 }}>
          <Txt variant="callout">
            {`Hikâyenin ${indices.length} cümlesini şimdi baştan, kendi sesinle anlat. Her cümle tek seferde; adım yok, ipucu yok.`}
          </Txt>
          <Txt variant="caption" color={c.inkSoft}>
            İstersen hepsini tek kayıtta söyle; cümlelere ben bölerim. Atlayabilirsin de — birkaç gün sonra tekrar önerilir.
          </Txt>
        </Surface>
      </View>
    );
  }

  const list = all ? indices : [indices[at]];
  return (
    <View style={{ gap: 12 }}>
      <CueChip text={all ? "Hepsini bir kerede" : `${at + 1} / ${indices.length}`} icon="message" />
      {list.map((si) => {
        const a = attempts[si];
        return (
          <Surface key={si} raised={!all} style={{ gap: 8 }}>
            <Txt variant={all ? "bodyStrong" : "title3"} style={{ fontWeight: "500" }}>
              {prompt(si)}
            </Txt>
            {a ? (
              <View style={{ gap: 4 }}>
                <View style={s.row}>
                  <Icon
                    name={a.verdict === "yanlis" ? "close" : "check"}
                    size={16}
                    color={a.verdict === "yanlis" ? c.danger : c.accentDark}
                    strokeWidth={2.6}
                  />
                  <Txt variant="caption" color={a.verdict === "yanlis" ? c.danger : c.accentDark} style={{ fontWeight: "800" }}>
                    {a.verdict === "yanlis" ? "Olmadı" : a.verdict === "yakin" ? "Çok yakın" : "Doğru"}
                  </Txt>
                </View>
                {a.heard ? (
                  <Txt variant="caption" color={c.inkSoft}>{`Duyduğum: ${a.heard}`}</Txt>
                ) : null}
                <TargetText size={view.rtl ? 20 : 16}>{view.show(a.expected)}</TargetText>
              </View>
            ) : null}
          </Surface>
        );
      })}
    </View>
  );
}
