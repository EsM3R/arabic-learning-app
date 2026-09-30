/**
 * ADIM kartı — hocanın asıl hamlesi: soru → Türkçe cevap → (sen söyle).
 *
 * Denemeden ÖNCE görünen: sözlü işaret ("Bağlaçla başlıyorum"), soru
 * çipi, Türkçe cevap satırı (yeni parça kalın), bu adımın YENİ KALIBI ve
 * A1–B1'de "Şu ana kadar".
 *
 * Sıfır ön bilgi kuralı: öğrenci hiç görmediği bir kalıbı söyleyemez. Hoca
 * da yeni parçayı ("-madan önce → before") ve NEDENİNİ söylemeden onu
 * sordurmaz. Bu yüzden adımda ilk kez öğretilen taş — hedef karşılığı, neden
 * öyle olduğu ve tuzağı — denemeden ÖNCE gösterilir; öğrenci cümlenin geri
 * kalanını kendisi birleştirir. Daha önce öğrenilmiş (geri gelen) taşlar
 * gösterilmez: onları hatırlaması beklenir.
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
import { altShown, answerLine, blocksAt, glossSegments, recycledAt, stepLabels } from "./helpers";
import type { BuildBlock } from "../../sentencebuilding";
import type { Attempt, ViewOpts } from "./types";
import AskTeacher from "./AskTeacher";
import { ContrastBox, CueChip, NoteRow, QuestionChip, useBuildStyles } from "./ui";
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
  onAsk,
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
  /** "Hocaya sor": bu cümle hakkında soru (verilmezse düğme yok). */
  onAsk?: (question: string) => Promise<string>;
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
            {`Bir önceki cümleyi olduğu gibi söyle; sonra ${sentence.connector?.tr ?? "bağlaç"} ile devam edeceğiz.`}
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
              <NewPattern key={b.key} block={b} lang={lang} view={view} />
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
          judge={attempt.judge}
          why={attempt.why}
        >
          {/* Eksik parça geri bildirimi adım notunu zaten sonuna ekler; iki kez gösterme. */}
          {!!st.note && !attempt.feedback.includes(st.note) && <NoteRow text={st.note} />}
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
      {onAsk && !linked ? (
        <View style={{ marginTop: 12 }}>
          <AskTeacher key={`${sentence.key}-${i}`} onAsk={onAsk} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Bu adımın yeni kalıbı — denemeden önce: "-dıktan sonra → بَعْدَ", neden
 * öyle olduğu ve Türklerin düştüğü tuzak. Hoca da önce parçayı verir, sonra
 * cümleyi söyletir.
 */
export function NewPattern({ block: b, lang, view }: { block: BuildBlock; lang: LanguageId; view: ViewOpts }) {
  const { s, c } = useBuildStyles();
  const trap = (b.trapIds ?? []).map((id) => trapById(lang, id)).find(Boolean);
  const contrast = b.contrast || trap?.text || "";
  const mini = trap?.mini;
  return (
    <View style={{ gap: 8, borderRadius: 14, borderWidth: 1, borderColor: c.goldDeep, padding: 12 }} accessibilityLabel={`Yeni kalıp: ${b.tr}`}>
      <View style={s.row}>
        <Icon name="bulb" size={16} color={c.gold} />
        <Txt variant="caption" color={c.gold} style={{ fontWeight: "800", letterSpacing: 0.4 }}>
          YENİ KALIP
        </Txt>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Txt variant="callout" style={{ fontWeight: "700" }}>
          {b.tr}
        </Txt>
        <Icon name="arrowRight" size={15} color={c.inkSoft} />
        <TargetText size={view.rtl ? 22 : 17}>{view.show(b.target)}</TargetText>
      </View>
      {b.note ? <NoteRow text={`Neden: ${b.note}`} icon="info" /> : null}
      {contrast ? <ContrastBox text={contrast} mini={mini} /> : null}
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
