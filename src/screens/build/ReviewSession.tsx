/**
 * TEK SEFERLİK OTURUM — "Tekrar zamanı", yerleştirme yoklaması, "Sına ve
 * geç" ve yeni basamak yoklaması aynı kartı kullanır: yalnız Türkçe cümle
 * görünür, öğrenci cümlenin TAMAMINI bir kerede söyler (tasarım §6.3–6.5).
 *
 * Kurallar:
 * - Yalnız İLK deneme kaydedilir; kayıt öğrenci karttan AYRILIRKEN yazılır
 *   ki "Ses tanıma yanlış duydu, sayma" onu iz bırakmadan silebilsin.
 * - Kayıtlı cümle yanlışsa saklanan rehberli adımları açılır (hocanın
 *   sorularıyla). Bu yedek PRATİKTİR: doğrusu görüldükten sonraki kurma
 *   bilmek değildir, hiçbir şey saymaz (§6.3, CM-8).
 * - Mikrofon ekranın tek dinleyicisinden gelir (heardRef): iki ayrı ses
 *   tanıma kancası aynı sonucu iki kez işlemesin.
 */
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Ring, Screen, Surface, Txt } from "../../components/kit";
import { checkAnswer } from "../../buildcheck";
import type { LanguageId } from "../../languages";
import type { ScriptId } from "../../scripts";
import type { Swap, TenseFrame } from "../../sentencebuilding";
import { speakTargetWith, stopSpeaking } from "../../speech";
import AnswerDiff from "./AnswerDiff";
import { answerLine } from "./helpers";
import type { Attempt, ViewOpts } from "./types";
import { CueChip, NoteRow, QuestionChip, useBuildStyles } from "./ui";
import VerdictPanel from "./VerdictPanel";
import VoiceFooter from "./VoiceFooter";

export interface SessionItem {
  id: string;
  /** memory: kayıtlı cümle · probe: yoklama cümlesi · retell: eski hikâyeyi anlatma. */
  kind: "memory" | "probe" | "retell";
  /** Gösterilen Türkçe (anlatımda B2+ yalnız sahne adı). */
  tr: string;
  /** Küçük etiket: kalıp adı, "Eski hikâye"… */
  cue?: string;
  target: string;
  swaps: Swap[];
  alts?: string[];
  /** Cümlenin zaman çerçevesi (setten ya da kalıptan): zaman tuzağı tekrarda da yakalanır. */
  tense?: TenseFrame;
  translit?: string;
  /** Yanlışta açılan rehberli yedek (yalnız pratik). */
  steps?: { question: string; trPiece: string; trSoFar?: string; target: string; note: string }[];
  /** İlerlemeye sayılır mı (son setten ısınma sayılmaz). */
  counted: boolean;
  /** Yoklamada kalıbın kimliği. */
  pid?: string;
  /** Anlatımda eski setin kimliği ve cümlesi. */
  setId?: string;
  si?: number;
}

export interface SessionAnswer {
  item: SessionItem;
  ok: 0 | 0.5 | 1;
  trap?: string;
  spoken: boolean;
}

/** Ekranın ortak mikrofon/klavye durumu (VoiceFooter'a gider). */
export interface SessionFooterBase {
  listening: boolean;
  partial: string;
  error: string | null;
  keyboard: boolean;
  answer: string;
  rtl: boolean;
  onToggleKeyboard: () => void;
  onChange: (t: string) => void;
  onSubmit: () => void;
  onMicIn: () => void;
  onMicOut: () => void;
}

type Stage = "ask" | "steps" | "summary";

export default function ReviewSession({
  items,
  header,
  lang,
  script,
  tense,
  view,
  footerBase,
  heardRef,
  onClearAnswer,
  onAnswer,
  onDone,
  intro,
}: {
  items: SessionItem[];
  header: React.ReactNode;
  lang: LanguageId;
  script: ScriptId;
  tense?: TenseFrame;
  view: ViewOpts;
  footerBase: SessionFooterBase;
  /** Ekran duyulanı buraya yollar (sesle: n-best listesi; yazıyla: tek metin). */
  heardRef: React.MutableRefObject<((given: string[], spoken: boolean) => void) | null>;
  onClearAnswer: () => void;
  /** Kart bırakılınca ilk denemenin sonucu (silinmediyse). */
  onAnswer: (a: SessionAnswer) => void;
  /** Özet ekranından "Bitti". */
  onDone: (answers: SessionAnswer[]) => void;
  /** Oturumun başında bir kez gösterilen açıklama. */
  intro?: string;
}) {
  const { c } = useBuildStyles();
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<Stage>(items.length ? "ask" : "summary");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [voided, setVoided] = useState(false);
  const pending = useRef<SessionAnswer | null>(null);
  const answers = useRef<SessionAnswer[]>([]);
  const [si, setStepIdx] = useState(0);
  const [stepAttempt, setStepAttempt] = useState<Attempt | null>(null);

  const item = items[idx];

  const ctxFor = (spoken: boolean, prev?: string) => ({ lang, script, spoken, swaps: item?.swaps ?? [], tense: item?.tense ?? tense, prev });

  const toAttempt = (r: NonNullable<ReturnType<typeof checkAnswer>>, spoken: boolean, revealed = false): Attempt => {
    const a: Attempt = { verdict: r.verdict, revealed, feedback: r.feedback, expected: r.expected, spoken };
    if (spoken) a.heard = r.heard;
    if (r.trapId) a.trapId = r.trapId;
    return a;
  };

  const heard = (given: string[], spoken: boolean) => {
    if (!item) return;
    if (stage === "ask") {
      if (attempt) return;
      const r = checkAnswer(item.target, item.alts ?? [], spoken ? given : given[0] ?? "", ctxFor(spoken));
      // Boş ya da yalnız noktalama: deneme sayılmaz.
      if (!r) return;
      const a = toAttempt(r, spoken);
      setAttempt(a);
      const res: SessionAnswer = { item, ok: r.credit, spoken };
      if (r.trapId) res.trap = r.trapId;
      pending.current = res;
      // Doğruyu duymak kulağa yerleştirir; yanlışta adımlar birlikte kuracak.
      if (r.verdict !== "yanlis") speakTargetWith(r.expected);
      return;
    }
    if (stage === "steps" && item.steps) {
      if (stepAttempt) return;
      const st = item.steps[si];
      const prev = si > 0 ? item.steps[si - 1].target : undefined;
      const r = checkAnswer(st.target, [], spoken ? given : given[0] ?? "", { ...ctxFor(spoken, prev), note: st.note });
      if (!r) return;
      setStepAttempt(toAttempt(r, spoken));
      speakTargetWith(r.expected);
    }
  };
  heardRef.current = heard;
  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;
  useEffect(
    () => () => {
      heardRef.current = null;
      // Oturumdan geri çıkılırsa verilmiş ilk cevap kaybolmasın (silinmediyse yazılır).
      const p = pending.current;
      pending.current = null;
      if (p) answerRef.current(p);
    },
    [heardRef]
  );

  /** Bekleyen ilk denemeyi yazar ("sayma" basılmadıysa). */
  const commit = () => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    answers.current.push(p);
    onAnswer(p);
  };

  const nextItem = () => {
    commit();
    stopSpeaking();
    onClearAnswer();
    setAttempt(null);
    setVoided(false);
    setStepAttempt(null);
    setStepIdx(0);
    if (idx + 1 < items.length) {
      setIdx(idx + 1);
      setStage("ask");
    } else {
      setStage("summary");
    }
  };

  const toSteps = () => {
    commit();
    stopSpeaking();
    onClearAnswer();
    setStepIdx(0);
    setStepAttempt(null);
    setStage("steps");
  };

  /** "Bilmiyorum": yanlış sayılır, doğrusu açılır. */
  const reveal = () => {
    if (!item || attempt) return;
    pending.current = { item, ok: 0, spoken: false };
    // Kayıtlı cümlede doğrusu söylenmez, adımlar onu birlikte kurar.
    if (item.steps?.length) {
      toSteps();
      return;
    }
    setAttempt({ verdict: "yanlis", revealed: true, feedback: "", expected: item.target, spoken: false });
    speakTargetWith(item.target);
  };

  const voidAttempt = () => {
    stopSpeaking();
    pending.current = null;
    setAttempt(null);
    setVoided(true);
    onClearAnswer();
  };

  const stepNext = () => {
    stopSpeaking();
    onClearAnswer();
    setStepAttempt(null);
    if (item?.steps && si + 1 < item.steps.length) setStepIdx(si + 1);
    else nextItem();
  };

  const stepReveal = () => {
    const st = item?.steps?.[si];
    if (!st || stepAttempt) return;
    setStepAttempt({ verdict: "yanlis", revealed: true, feedback: "", expected: st.target, spoken: false });
    speakTargetWith(st.target);
  };

  // ------------------------------------------------------------------ özet
  if (stage === "summary" || !item) {
    const list = answers.current;
    const ok = list.filter((a) => a.ok > 0).length;
    const pct = list.length ? Math.round((ok / list.length) * 100) : 0;
    return (
      <Screen
        header={header}
        footer={<VoiceFooter {...footerBase} listen={false} primary={{ label: "Bitti", icon: "check", onPress: () => onDone(list) }} />}
      >
        <Surface raised style={{ alignItems: "center", gap: 12 }}>
          <Ring progress={pct / 100} size={84} stroke={7} color={c.accent} track={c.line} label={`%${pct}`} />
          <Txt variant="title3" center>
            {list.length ? `${list.length} cümleden ${ok}'i ilk seferde doğru` : "Bu turda cümle yoktu"}
          </Txt>
          <Txt variant="callout" color={c.inkSoft} center>
            Yalnız ilk denemeler sayıldı; adım adım kurduğun yedekler pratikti.
          </Txt>
        </Surface>
      </Screen>
    );
  }

  const show = (t: string) => view.show(t);
  const total = items.length;
  const progressLine = (
    <View style={{ flexDirection: "row", gap: 4, marginBottom: 16 }}>
      {items.map((x, i) => (
        <View key={x.id} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < idx ? c.accent : i === idx ? c.goldDeep : c.line }} />
      ))}
    </View>
  );

  // ------------------------------------------------------------------ rehberli yedek
  if (stage === "steps" && item.steps?.length) {
    const st = item.steps[si];
    const line = st.trSoFar ? answerLine(st.trSoFar, st.trPiece) : { before: st.trPiece, bold: "", after: "" };
    const footer = stepAttempt ? (
      <VoiceFooter {...footerBase} listen={false} primary={{ label: si + 1 < item.steps.length ? "Devam" : "Sıradaki", icon: "arrowRight", onPress: stepNext }} />
    ) : (
      <VoiceFooter {...footerBase} listen dontKnow={{ label: "Bilmiyorum", onPress: stepReveal }} />
    );
    return (
      <Screen header={header} footer={footer}>
        {progressLine}
        <Surface raised style={{ gap: 12 }}>
          <CueChip text={`Adım adım · ${si + 1}/${item.steps.length} · pratik`} icon="layers" />
          <Txt variant="callout" color={c.inkSoft}>
            {item.tr}
          </Txt>
          {st.question ? <QuestionChip text={st.question} /> : null}
          {st.trPiece || st.trSoFar ? (
            // Soru → Türkçe cevap (yeni parça vurgulu) → sen söyle: hocanın sırası.
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
          ) : null}
        </Surface>
        {stepAttempt && (
          <VerdictPanel
            verdict={stepAttempt.verdict}
            revealed={stepAttempt.revealed}
            heard={stepAttempt.spoken ? stepAttempt.heard : undefined}
            feedback={stepAttempt.feedback}
            answer={<AnswerDiff expected={stepAttempt.expected} prev={si > 0 ? item.steps[si - 1].target : undefined} lang={lang} rtl={view.rtl} harakat={view.harakat} />}
            onListen={() => speakTargetWith(stepAttempt.expected)}
          >
            {st.note ? <NoteRow text={st.note} /> : null}
          </VerdictPanel>
        )}
      </Screen>
    );
  }

  // ------------------------------------------------------------------ tek seferde
  const ok = !!attempt && attempt.verdict !== "yanlis" && !attempt.revealed;
  const canFallback = !!item.steps?.length;
  const onVoid = attempt && attempt.spoken && !attempt.revealed && !voided ? voidAttempt : undefined;
  let footer: React.ReactNode;
  if (!attempt) footer = <VoiceFooter {...footerBase} listen dontKnow={{ label: "Bilmiyorum", onPress: reveal }} />;
  else if (!ok && canFallback)
    footer = (
      <VoiceFooter
        {...footerBase}
        listen={false}
        primary={{ label: "Adım adım kur", icon: "layers", onPress: toSteps }}
        secondary={{ label: "Geç", onPress: nextItem }}
      />
    );
  else footer = <VoiceFooter {...footerBase} listen={false} primary={{ label: idx + 1 < total ? "Sıradaki" : "Bitir", icon: "arrowRight", onPress: nextItem }} />;

  return (
    <Screen header={header} footer={footer}>
      {progressLine}
      {intro && idx === 0 && !attempt ? (
        <Txt variant="callout" color={c.inkSoft} style={{ marginBottom: 12 }}>
          {intro}
        </Txt>
      ) : null}
      <Surface raised style={{ gap: 12 }}>
        <CueChip text={item.kind === "retell" ? "Eski hikâyeni anlat" : "Tek seferde söyle"} icon={item.kind === "retell" ? "message" : "target"} />
        {item.cue ? (
          <Txt variant="caption" color={c.inkSoft}>
            {item.cue}
          </Txt>
        ) : null}
        <Txt variant="title3" style={{ fontWeight: "500" }}>
          {item.tr}
        </Txt>
        {!attempt && (
          <Txt variant="callout" color={c.inkSoft}>
            Cümlenin tamamını bir kerede söyle.
          </Txt>
        )}
      </Surface>
      {attempt &&
        (ok || !canFallback ? (
          <VerdictPanel
            verdict={attempt.verdict}
            revealed={attempt.revealed}
            heard={attempt.spoken ? attempt.heard : undefined}
            feedback={attempt.feedback}
            answer={<AnswerDiff expected={attempt.expected} lang={lang} rtl={view.rtl} harakat={view.harakat} />}
            translit={item.translit ? show(item.translit) : undefined}
            onListen={() => speakTargetWith(attempt.expected)}
            onVoid={onVoid}
          />
        ) : (
          // Kayıtlı cümle yanlışsa doğrusu gösterilmez: adımlar onu birlikte kuracak.
          <VerdictPanel
            verdict="yanlis"
            revealed={attempt.revealed}
            title={attempt.revealed ? "Adım adım kuralım" : "Olmadı — adım adım kuralım"}
            heard={attempt.spoken ? attempt.heard : undefined}
            onVoid={onVoid}
          />
        ))}
    </Screen>
  );
}
