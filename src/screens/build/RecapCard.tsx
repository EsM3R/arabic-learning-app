/**
 * ÖZET kartı — cümlenin tam hâli, bağlacın öteki yeri ve bu cümlede
 * öğrenilen taşlar (notu ve alternatifleriyle) ve cümle geneli başka
 * söyleyişler. Alternatiflerin kararlar dışında listelendiği tek yer burası:
 * öğrenirken değil, öğrendikten sonra. C1+'da her alternatif üslup
 * etiketiyle (resmî / günlük / edebî) gelir: aynı anlamın hangi kayıtta
 * söylendiğini bilmek, o seviyenin asıl öğrettiği şeydir.
 */
import React from "react";
import { View } from "react-native";
import Icon from "../../components/Icon";
import { Badge, Button, ListGroup, Surface, TargetText, Txt } from "../../components/kit";
import type { LanguageId } from "../../languages";
import type { BuildSentence, Swap } from "../../sentencebuilding";
import { ltrLine } from "../../richtext";
import { altShown, extraSwaps } from "./helpers";
import type { RecallItem } from "./RecallChips";
import type { ViewOpts } from "./types";
import { useBuildStyles } from "./ui";

export default function RecapCard({
  sentence,
  finalShown,
  reorderShown,
  recall,
  swaps,
  lang,
  view,
  saved,
  onListen,
  onSave,
}: {
  sentence: BuildSentence;
  /** Cümlenin geçerli swap'ları (günlük dil ayarı uygulanmış). */
  swaps: Swap[];
  lang: LanguageId;
  finalShown: string;
  reorderShown: string;
  recall: RecallItem[];
  view: ViewOpts;
  saved: boolean;
  onListen: () => void;
  onSave: () => void;
}) {
  const { s, c } = useBuildStyles();
  const fresh = sentence.blocks.filter((b) => !b.recycled);
  const translit = sentence.steps[sentence.steps.length - 1]?.translit ?? "";
  const others = extraSwaps(sentence, swaps, lang);
  return (
    <View style={{ gap: 18 }}>
      <Surface raised style={{ gap: 10 }}>
        <View style={s.row}>
          <Icon name="check" size={18} color={c.accentDark} strokeWidth={2.6} />
          <Txt variant="overline" color={c.accentDark}>
            CÜMLE KURULDU
          </Txt>
        </View>
        <TargetText size={view.rtl ? 26 : 20}>{view.show(finalShown)}</TargetText>
        {!!translit && (
          <Txt variant="caption" color={c.inkSoft}>
            {translit}
          </Txt>
        )}
        {reorderShown ? (
          <View style={{ gap: 2 }}>
            <Txt variant="caption" color={c.inkSoft}>
              ya da, bağlaç ortada:
            </Txt>
            <TargetText size={view.rtl ? 21 : 16} color={c.inkSoft}>
              {view.show(reorderShown)}
            </TargetText>
          </View>
        ) : null}
        <View style={[s.row, { marginTop: 4 }]}>
          <Button variant="secondary" size="sm" icon="volume" label="Dinle" onPress={onListen} />
          <Button
            variant="secondary"
            size="sm"
            icon={saved ? "check" : "bookmark"}
            label={saved ? "Defterde" : "Deftere ekle"}
            disabled={saved}
            onPress={onSave}
          />
        </View>
      </Surface>

      {fresh.length > 0 && (
        <View>
          <Txt variant="overline" color={c.inkSoft} style={{ marginBottom: 10 }}>
            BU CÜMLEDE ÖĞRENDİKLERİN
          </Txt>
          <ListGroup>
            {fresh.map((b) => (
              <View key={b.key} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <Txt variant="bodyStrong" style={{ flexShrink: 1 }}>
                    {b.tr}
                  </Txt>
                  <TargetText size={view.rtl ? 20 : 16} color={c.accentDark}>
                    {view.show(b.target)}
                  </TargetText>
                </View>
                {!!b.note && (
                  <Txt variant="caption" color={c.inkSoft}>
                    {ltrLine(view.show(b.note))}
                  </Txt>
                )}
                {b.alts.length > 0 && (
                  <Txt variant="caption" color={c.inkSoft}>
                    {ltrLine(`Ayrıca: ${b.alts.map((a) => view.show(altShown(b, a, swaps, lang))).join(" · ")}`)}
                  </Txt>
                )}
              </View>
            ))}
          </ListGroup>
        </View>
      )}

      {others.length > 0 && (
        <View>
          <Txt variant="overline" color={c.inkSoft} style={{ marginBottom: 10 }}>
            BAŞKA SÖYLEYİŞLER
          </Txt>
          <ListGroup>
            {others.map((o) => (
              <View key={`${o.from}→${o.to}`} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
                {/* Yön oku yok: Arapçada sağdan sola satırda ok ters okunurdu. */}
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <TargetText size={view.rtl ? 20 : 16} color={c.accentDark} style={{ flex: 1 }}>
                    {view.show(o.to)}
                  </TargetText>
                  {o.label ? <Badge text={o.label} tone="gold" /> : null}
                </View>
                <Txt variant="caption" color={c.inkSoft}>
                  {ltrLine(`kalıptaki: ${view.show(o.from)}`)}
                </Txt>
              </View>
            ))}
          </ListGroup>
        </View>
      )}

      {recall.length > 0 && (
        <View>
          <Txt variant="overline" color={c.inkSoft} style={{ marginBottom: 10 }}>
            GERİ GELENLER
          </Txt>
          <View style={s.wrap}>
            {recall.map((r) => (
              <View key={r.key} style={[s.questionChip, { alignSelf: "auto" }]}>
                <Icon name="check" size={14} color={c.accentDark} />
                <Txt variant="caption" color={c.accentDark} style={{ fontWeight: "800" }}>
                  {`${r.tr} = ${view.show(r.target)}`}
                </Txt>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
