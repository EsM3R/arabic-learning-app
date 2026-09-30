/**
 * ADIM kartı — hocanın asıl hamlesi: soru → Türkçe cevap → (sen söyle).
 *
 * Denemeden ÖNCE görünen: sözlü işaret ("Bağlaçla başlıyorum"), soru
 * çipi, Türkçe cevap satırı (yeni parça kalın), tam zamanında lamba (YALNIZ
 * Türkçe tetik) ve A1–B1'de "Şu ana kadar". Hedef dildeki parça, not,
 * karşıtlık ve alternatifler denemeden SONRA gelir: önceden gösterilen cevap
 * söyletmez, okutur.
 */
import React from "react";
import { View } from "react-native";
import Icon from "../../components/Icon";
import { Surface, TargetText, Txt } from "../../components/kit";
import { trapById } from "../../buildmethod";
import type { LanguageId } from "../../languages";
import type { BuildSentence } from "../../sentencebuilding";
import { ltrLine } from "../../richtext";
import AnswerDiff from "./AnswerDiff";
import { altShown, answerLine, blocksAt, glossSegments, lampText, recycledAt, stepLabels } from "./helpers";
import type { Attempt, ViewOpts } from "./types";
import { ContrastBox, CueChip, Lamp, NoteRow, QuestionChip, useBuildStyles } from "./ui";
import VerdictPanel from "./VerdictPanel";

export default function StepCard({
  sentence,
  i,
  lang,
  view,
  showSoFar,
  prevShown,
  expectedShown,
  finalShown,
  attempt,
  translit,
  onListen,
  onVoid,
  extra,
}: {
  sentence: BuildSentence;
  i: number;
  lang: LanguageId;
  view: ViewOpts;
  /** "Şu ana kadar" (A1–B1; sentez yedeğinde ve solmada gizli). */
  showSoFar: boolean;
  /** Önceki adımın hedefi, öğrencinin söyleyişiyle. */
  prevShown?: string;
  /** Bu adımın hedefi, öğrencinin söyleyişiyle (kararda gösterilir). */
  expectedShown: string;
  /** Cümlenin son hâli, öğrencinin söyleyişiyle (toparla açıklaması). */
  finalShown: string;
  attempt: Attempt | null;
  translit?: string;
  onListen: () => void;
  onVoid?: () => void;
  /** Cinsiyet seçimi gibi cümle düzeyi eklentiler. */
  extra?: React.ReactNode;
}) {
  const { s, c } = useBuildStyles();
  const st = sentence.steps[i];
  const linked = st.move === "linked";
  const labels = stepLabels(sentence, i, lang);
  const line = answerLine(st.trSoFar, st.trPiece);
  const fresh = blocksAt(sentence, i);
  const recycled = recycledAt(sentence, i);
  const last = i === sentence.steps.length - 1 && sentence.steps.length > 1;
  const ok = !!attempt && attempt.verdict !== "yanlis" && !attempt.revealed;
  const missed = !!attempt && (attempt.verdict === "yanlis" || attempt.revealed);
  // C1+: alternatif üslup etiketiyle ("… (resmî)").
  const alts = fresh.flatMap((b) => b.alts.map((x) => altShown(b, x, sentence.swaps, lang)));

  return (
    <View>
      <Surface raised style={{ gap: 12 }}>
        {labels.length > 0 && (
          <View style={s.wrap}>
            {labels.map((l) => (
              <CueChip key={l} text={l} icon={l.startsWith("Hemen vurgu") ? "zap" : l.startsWith("Ara hâl") ? "info" : linked ? "replay" : "sparkles"} />
            ))}
          </View>
        )}
        {linked ? (
          <Txt variant="callout" color={c.inkSoft}>
            Bir önceki cümleyi olduğu gibi söyle; sonra çünkü ile devam edeceğiz.
          </Txt>
        ) : (
          <>
            {st.question ? <QuestionChip text={st.question} /> : null}
            <Txt variant="title3" style={{ fontWeight: "500" }}>
              {"→ "}
              {line.before}
              {line.bold ? (
                <Txt variant="title3" color={c.gold}>
                  {line.bold}
                </Txt>
              ) : null}
              {line.after}
            </Txt>
            {fresh.map((b) => (
              <Lamp key={b.key} text={lampText(b, lang)} />
            ))}
            {showSoFar && i > 0 && prevShown ? (
              <View style={{ gap: 2 }}>
                <Txt variant="caption" color={c.inkSoft}>
                  Şu ana kadar
                </Txt>
                <TargetText size={view.rtl ? 22 : 17}>{view.show(prevShown)}</TargetText>
              </View>
            ) : null}
            {!attempt ? (
              <Txt variant="caption" color={c.inkFaint}>
                Cümlenin şu ana kadarki TAMAMINI söyle.
              </Txt>
            ) : null}
          </>
        )}
        {extra}
      </Surface>

      {attempt && (
        <VerdictPanel
          verdict={attempt.verdict}
          revealed={attempt.revealed}
          heard={attempt.spoken ? attempt.heard : undefined}
          feedback={attempt.feedback}
          answer={
            <AnswerDiff
              expected={expectedShown}
              prev={i > 0 && !linked ? prevShown ?? "" : undefined}
              lang={lang}
              rtl={view.rtl}
              harakat={view.harakat}
            />
          }
          translit={translit}
          onListen={onListen}
          onVoid={onVoid}
        >
          {!!st.note && st.note !== attempt.feedback && <NoteRow text={st.note} />}
          {fresh.map((b) => (
            <View key={b.key} style={{ gap: 6 }}>
              {!!b.note && <NoteRow text={`${b.tr} → ${view.show(b.target)}: ${b.note}`} icon="layers" />}
              {/* Tuzağa düşüldüyse aynı metin zaten kararın geri bildiriminde. */}
              {!!b.contrast && !attempt.feedback.includes(b.contrast) && (
                <ContrastBox text={b.contrast} mini={(b.trapIds ?? []).map((id) => trapById(lang, id)?.mini).find(Boolean)} />
              )}
            </View>
          ))}
          {missed &&
            recycled.map((b) =>
              b.recycled && (b.recycled.firstNote || b.recycled.firstContrast) ? (
                <View key={b.key} style={{ gap: 6 }}>
                  {!!b.recycled.firstNote && <NoteRow text={`Bunu öğrenmiştik — ${b.tr}: ${b.recycled.firstNote}`} icon="repeat" />}
                  {!!b.recycled.firstContrast && <ContrastBox text={b.recycled.firstContrast} />}
                </View>
              ) : null
            )}
          {alts.length > 0 && (
            <Txt variant="caption" color={c.inkSoft}>
              {ltrLine(`Ayrıca: ${alts.map(view.show).join(" · ")}`)}
            </Txt>
          )}
          {ok && st.clauseEnd && !last && (
            <View style={[s.row, { backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }]}>
              <Icon name="check" size={15} color={c.accentDark} strokeWidth={2.6} />
              <Txt variant="caption" color={c.accentDark} style={{ fontWeight: "800", flex: 1 }}>
                {ltrLine(`Birinci kısmımız oldu → ${view.show(expectedShown.replace(/[\s,،]+$/, ""))}`)}
              </Txt>
            </View>
          )}
          {ok && last && <Gloss sentence={sentence} lang={lang} view={view} finalShown={finalShown} />}
        </VerdictPanel>
      )}
    </View>
  );
}

/**
 * Toparla açıklaması: "When I arrive at home · eve vardığımda │ I turn on
 * the TV · televizyonu açarım" — iki kısım yan yana, bağlacın nereye düştüğü
 * görünsün.
 */
export function Gloss({
  sentence,
  lang,
  view,
  finalShown,
}: {
  sentence: BuildSentence;
  lang: LanguageId;
  view: ViewOpts;
  finalShown: string;
}) {
  const { c } = useBuildStyles();
  const segs = glossSegments(sentence, lang, finalShown);
  if (segs.length < 2) return null;
  return (
    // Sağdan sola dilde birinci kısım sağda durur.
    <View
      style={{ flexDirection: view.rtl ? "row-reverse" : "row", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: c.border }}
    >
      {segs.map((g, k) => (
        <View
          key={k}
          style={{ flex: 1, padding: 10, gap: 4, backgroundColor: c.card, borderColor: c.border, [view.rtl ? "borderRightWidth" : "borderLeftWidth"]: k > 0 ? 1 : 0 }}
        >
          <TargetText size={view.rtl ? 17 : 14}>{view.show(g.target)}</TargetText>
          <Txt variant="caption" color={c.inkSoft}>
            {g.tr}
          </Txt>
        </View>
      ))}
    </View>
  );
}
