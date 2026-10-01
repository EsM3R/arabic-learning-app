/**
 * "1 dakikada anlat" — ileri seviye paragraf anlatımı.
 *
 * Adım adım kurulan cümleler en sonda TEK SEFERDE, bağlaçlarla birbirine
 * bağlanarak anlatılır. Hoca anlatımı dinler ve raporlar: kaç cümle
 * anlatıldı, hangi bağlaçlar kullanıldı, önemli hatalar ve NEDENLERİ, bir
 * sonraki anlatımın tek hedefi.
 *
 * Mikrofon ekranın ortak dikte kancasıdır; duyulan metin bindHeard ile buraya
 * yönlendirilir.
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import Icon from "../../components/Icon";
import { Button, Chip, Ring, Surface, TargetText, Txt, Wave } from "../../components/kit";
import type { StoryReport } from "../../claude";
import { wordCount } from "../../fluency";
import type { ScriptId } from "../../scripts";
import { ltrLine } from "../../richtext";
import type { DictationState } from "../../useDictation";
import type { ViewOpts } from "./types";
import { useBuildStyles } from "./ui";

export const STORY_SECONDS = 60;

type Stage = "hazir" | "konus" | "bakiyor" | "rapor";

export default function StoryTellView({
  sentences,
  view,
  script,
  hideCues,
  dictation,
  bindHeard,
  onEvaluate,
  onListen,
  onDone,
}: {
  sentences: { tr: string; target: string }[];
  view: ViewOpts;
  script: ScriptId;
  /** İleri seviyede ipuçları başta gizli. */
  hideCues: boolean;
  dictation: DictationState;
  bindHeard: (fn: ((text: string) => void) | null) => void;
  onEvaluate: (transcript: string, seconds: number) => Promise<StoryReport>;
  onListen: (target: string) => void;
  onDone: () => void;
}) {
  const { s, c } = useBuildStyles();
  const [stage, setStage] = useState<Stage>("hazir");
  const [cues, setCues] = useState(!hideCues);
  const [left, setLeft] = useState(STORY_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<StoryReport | null>(null);
  const [said, setSaid] = useState("");
  const [secs, setSecs] = useState(0);
  const heard = useRef("");
  const lastPartial = useRef("");
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    bindHeard((t) => {
      heard.current = t;
    });
    return () => {
      alive.current = false;
      bindHeard(null);
      if (ticker.current) clearInterval(ticker.current);
      if (settle.current) clearTimeout(settle.current);
    };
    // bindHeard ekranın sabit yönlendiricisi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dictation.partial) lastPartial.current = dictation.partial;
  }, [dictation.partial]);

  const begin = () => {
    heard.current = "";
    lastPartial.current = "";
    setError(null);
    setReport(null);
    setLeft(STORY_SECONDS);
    setStage("konus");
    startedAt.current = Date.now();
    dictation.start();
    let remaining = STORY_SECONDS;
    ticker.current = setInterval(() => {
      remaining -= 1;
      setLeft(remaining);
      if (remaining <= 0) finish();
    }, 1000);
  };

  const finish = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    dictation.stop();
    const seconds = Math.max(1, Math.min(STORY_SECONDS, Math.round((Date.now() - startedAt.current) / 1000)));
    // Tanıma "end" olayını gecikmeli verir; son parçayı kaçırmamak için bekle.
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      if (!alive.current) return;
      const text = (heard.current || lastPartial.current).trim();
      if (!text) {
        setError("Ses duyulmadı. Mikrofona yakın konuşup bir daha dene.");
        setStage("hazir");
        return;
      }
      setSaid(text);
      setSecs(seconds);
      setStage("bakiyor");
      onEvaluate(text, seconds)
        .then((r) => {
          if (!alive.current) return;
          setReport(r);
          setStage("rapor");
        })
        .catch((e: unknown) => {
          if (!alive.current) return;
          setError(`Hoca değerlendiremedi: ${e instanceof Error ? e.message : String(e)}`);
          setStage("hazir");
        });
    }, 900);
  };

  const cueList = (
    <View style={{ gap: 8 }}>
      {sentences.map((x, i) => (
        <View key={i} style={[s.row, { alignItems: "flex-start" }]}>
          <Txt variant="caption" color={c.inkFaint} style={{ width: 18 }}>
            {`${i + 1}.`}
          </Txt>
          <Txt variant="callout" style={{ flex: 1 }}>
            {x.tr}
          </Txt>
        </View>
      ))}
    </View>
  );

  if (stage === "hazir") {
    return (
      <View style={{ gap: 14 }}>
        <Surface raised style={{ gap: 12 }}>
          <View style={s.row}>
            <Icon name="timer" size={18} color={c.gold} />
            <Txt variant="headline" style={{ flex: 1 }}>
              1 dakikada anlat
            </Txt>
          </View>
          <Txt variant="callout" color={c.inkSoft}>
            Adım adım kurduğun cümleleri şimdi tek seferde anlat. Cümleleri bağlaçlarla birbirine bağla: "and", "then", "because", "after
            that"… Takılırsan durma, bildiğin kadarıyla devam et.
          </Txt>
          {cues ? cueList : null}
          <Chip label={cues ? "İpuçlarını gizle" : "Türkçe ipuçlarını göster"} icon={cues ? "eyeOff" : "eye"} onPress={() => setCues(!cues)} />
        </Surface>
        {error ? (
          <Txt variant="callout" color={c.danger}>
            {error}
          </Txt>
        ) : null}
        <Button icon="mic" label="Başla (60 sn)" onPress={begin} />
        <Button variant="ghost" size="md" label="Vazgeç" onPress={onDone} />
      </View>
    );
  }

  if (stage === "konus") {
    const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    return (
      <View style={{ gap: 14 }}>
        <View style={[s.deepCard, { alignItems: "center", gap: 10 }]}>
          <Txt variant="overline" color={c.goldDeep}>
            ANLATIYORSUN
          </Txt>
          <Txt variant="display" color={c.onDeep} accessibilityLabel="Kalan süre">
            {mm}
          </Txt>
          <Wave active={dictation.listening} color={c.goldDeep} />
          <Txt variant="caption" color={c.onDeepSoft} center>
            {dictation.listening ? "Dinliyorum — konuşmaya devam et" : "Mikrofon açılıyor…"}
          </Txt>
        </View>
        {dictation.partial ? (
          <TargetText size={view.rtl ? 20 : 16}>{view.show(dictation.partial)}</TargetText>
        ) : null}
        {cues ? <Surface style={{ gap: 8 }}>{cueList}</Surface> : null}
        <Button icon="check" label="Bitirdim" onPress={finish} />
      </View>
    );
  }

  if (stage === "bakiyor" || !report) {
    return (
      <View style={{ alignItems: "center", gap: 12, paddingVertical: 40 }}>
        <ActivityIndicator color={c.accent} />
        <Txt variant="callout" color={c.inkSoft}>
          Hoca anlatımını dinliyor…
        </Txt>
      </View>
    );
  }

  const wpm = Math.round((wordCount(said, script) / Math.max(1, secs)) * 60);
  return (
    <View style={{ gap: 14 }}>
      <View style={[s.deepCard, { alignItems: "center" }]}>
        <Ring progress={report.score / 100} size={84} stroke={7} color={c.goldDeep} track={c.onDeepTrack} label={`${report.score}`} labelColor={c.onDeep} />
        <Txt variant="title2" color={c.onDeep} center style={{ marginTop: 12 }}>
          {`${report.covered.length} / ${sentences.length} cümleyi anlattın`}
        </Txt>
        <Txt variant="caption" color={c.onDeepSoft} center style={{ marginTop: 6 }}>
          {`${secs} sn · dakikada ${wpm} kelime`}
        </Txt>
      </View>

      {report.praise ? (
        <Surface style={{ gap: 6 }}>
          <View style={s.row}>
            <Icon name="star" size={16} color={c.gold} />
            <Txt variant="caption" color={c.gold} style={{ fontWeight: "800" }}>
              İYİ YAPTIĞIN
            </Txt>
          </View>
          <Txt variant="callout">{ltrLine(view.show(report.praise))}</Txt>
        </Surface>
      ) : null}

      <Surface style={{ gap: 8 }}>
        <Txt variant="caption" color={c.inkSoft} style={{ fontWeight: "800" }}>
          KULLANDIĞIN BAĞLAÇLAR
        </Txt>
        {report.links.length ? (
          <View style={s.wrap}>
            {report.links.map((l) => (
              <Chip key={l} label={view.show(l)} />
            ))}
          </View>
        ) : (
          <Txt variant="callout" color={c.inkSoft}>
            Cümleleri birbirine bağlamadın; bir dahakine "and", "then" gibi bağlaçlar dene.
          </Txt>
        )}
      </Surface>

      {report.fixes.length > 0 && (
        <Surface style={{ gap: 12 }}>
          <Txt variant="caption" color={c.inkSoft} style={{ fontWeight: "800" }}>
            DÜZELTMELER VE NEDENLERİ
          </Txt>
          {report.fixes.map((f, i) => (
            <View key={i} style={{ gap: 4 }}>
              {f.said ? (
                <Txt variant="callout" color={c.danger} style={{ textDecorationLine: "line-through" }}>
                  {ltrLine(view.show(f.said))}
                </Txt>
              ) : null}
              <View style={s.row}>
                <Icon name="check" size={15} color={c.accentDark} strokeWidth={2.6} />
                <TargetText size={view.rtl ? 19 : 15} style={{ flex: 1 }}>
                  {view.show(f.better)}
                </TargetText>
              </View>
              {f.why ? (
                <Txt variant="caption" color={c.inkSoft}>
                  {ltrLine(view.show(f.why))}
                </Txt>
              ) : null}
            </View>
          ))}
        </Surface>
      )}

      {report.next ? (
        <Surface style={{ gap: 6 }}>
          <View style={s.row}>
            <Icon name="target" size={16} color={c.accentDark} />
            <Txt variant="caption" color={c.accentDark} style={{ fontWeight: "800" }}>
              BİR SONRAKİ HEDEFİN
            </Txt>
          </View>
          <Txt variant="callout">{ltrLine(view.show(report.next))}</Txt>
        </Surface>
      ) : null}

      <Surface style={{ gap: 10 }}>
        <Txt variant="caption" color={c.inkSoft} style={{ fontWeight: "800" }}>
          HİKÂYENİN DOĞRUSU
        </Txt>
        {sentences.map((x, i) => (
          <View key={i} style={{ gap: 2 }}>
            <View style={s.row}>
              <Icon name={report.covered.includes(i) ? "check" : "close"} size={14} color={report.covered.includes(i) ? c.accentDark : c.inkFaint} strokeWidth={2.6} />
              <Txt variant="caption" color={c.inkSoft} style={{ flex: 1 }}>
                {x.tr}
              </Txt>
              <Button variant="ghost" size="sm" icon="volume" label="Dinle" accessibilityLabel={`${i + 1}. cümleyi dinle`} onPress={() => onListen(x.target)} />
            </View>
            <TargetText size={view.rtl ? 19 : 15}>{view.show(x.target)}</TargetText>
          </View>
        ))}
        <Txt variant="caption" color={c.inkFaint}>
          {ltrLine(`Duyduğum: ${view.show(said)}`)}
        </Txt>
      </Surface>

      <Button icon="replay" label="Bir daha anlat" onPress={begin} />
      <Button variant="secondary" size="md" label="Bitti" onPress={onDone} />
    </View>
  );
}
