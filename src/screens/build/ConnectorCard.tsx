/**
 * BAĞLAÇ kartı — "Burada bir bağlacımız var: -madan önce. Birincisi
 * kahvaltı yapmak, ikincisi duş almak, arada da bağlacımız var."
 *
 * Karşıtlık (ago/before gibi) yalnız bağlaç öğrencinin geçmişinde İLK kez
 * geçtiğinde gelir. Öğrencinin 3. bağlaçlı cümlesinden itibaren bağlacı
 * kendisi bulur: Türkçede bağlaca dokunur, sonra doğru karşılığı tuzağından
 * ayırır. Kartın geri kalanı ondan sonra açılır.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Button, PressableScale, Surface, TargetText, Txt } from "../../components/kit";
import { trapById } from "../../buildmethod";
import type { LanguageId } from "../../languages";
import type { ConnectorCard as Conn } from "../../sentencebuilding";
import { canSplit, connectorSpan, splitOptions, trWords } from "./helpers";
import type { ViewOpts } from "./types";
import { ContrastBox, CueChip, useBuildStyles } from "./ui";

/**
 * Kurma sırası işareti. Bağlantılı cümlede (çünkü; uzatmada ama / bu yüzden)
 * birinci kısım önceki cümlenin kendisidir ve cümlenin KENDİ bağlacı söylenir.
 */
export function buildOrderLine(card: Pick<Conn, "kind" | "tr">, linked = false): string {
  const next = `Önceki cümleyi söyleyip ${card.tr || "bağlaç"} ile devam edeceğiz`;
  if (card.kind === "sub") return "Bağlaçla başlıyorum";
  if (card.kind === "coord") return linked ? next : "Önce birinci kısmı kuruyoruz";
  if (card.kind === "causal") return next;
  return "";
}

/** Türkçe belirtme hâli ünlü uyumuyla: "-madan önce'yi", "ama'yı", "-ken'i". */
export function accusative(word: string): string {
  const w = word.trim();
  const vowels = w.match(/[aeıioöuü]/gi);
  const v = (vowels ? vowels[vowels.length - 1] : "e").toLocaleLowerCase("tr-TR");
  const suf = v === "a" || v === "ı" ? "ı" : v === "e" || v === "i" ? "i" : v === "o" || v === "u" ? "u" : "ü";
  const endsVowel = /[aeıioöuü]$/i.test(w);
  return `${w}'${endsVowel ? "y" : ""}${suf}`;
}

export default function ConnectorCard({
  card,
  tr,
  lang,
  view,
  linked = false,
  onSplit,
}: {
  card: Conn;
  /** Önceki cümleye bağlanan cümle (sentence.linkPrev). */
  linked?: boolean;
  tr: string;
  lang: LanguageId;
  view: ViewOpts;
  /**
   * Öğrenci bağlacı buldu. ok: tuzak çiftinden doğru seçim mi (yanlış seçim
   * tuzak geri çağırma kaybıdır); null: seçim sorulmadı, yalnız bölme yapıldı.
   */
  onSplit: (ok: boolean | null) => void;
}) {
  const { s, c } = useBuildStyles();
  const span = connectorSpan(tr, card);
  const splitting = canSplit(tr, card);
  const [stage, setStage] = useState<"find" | "pick" | "reveal">(splitting ? "find" : "reveal");
  const [wrongTap, setWrongTap] = useState(false);
  const [picked, setPicked] = useState<boolean | null>(null);
  const opts = splitOptions(card, lang);
  // Seçenek sırası bağlaca göre değişsin (hep ilk seçenek doğru olmasın), ama testte kararlı kalsın.
  const order = !opts ? [] : card.tr.length % 2 === 0 ? [opts.right, opts.wrong] : [opts.wrong, opts.right];
  const trap = card.trapId ? trapById(lang, card.trapId) : undefined;

  if (stage === "find") {
    return (
      <Surface raised style={{ gap: 12 }}>
        <CueChip text="Bağlacı sen bul" icon="scissors" />
        <Txt variant="callout" color={c.inkSoft}>
          Bu cümlede bir bağlaç var; cümleyi ikiye ayıran kelimeye dokun.
        </Txt>
        <View style={s.wrap}>
          {trWords(tr).map((w, k) => {
            const hit = !!span && w.start < span[1] && span[0] < w.end;
            return (
              <PressableScale
                key={k}
                accessibilityLabel={`Kelime: ${w.text}`}
                onPress={() => {
                  if (!hit) setWrongTap(true);
                  else if (opts) setStage("pick");
                  else {
                    // Gerçek tuzağı olmayan bağlaçta seçim sorulmaz: bölme yeterli.
                    setStage("reveal");
                    onSplit(null);
                  }
                }}
                style={s.tapWord}
              >
                <Txt variant="bodyStrong">{w.text}</Txt>
              </PressableScale>
            );
          })}
        </View>
        {wrongTap && (
          <Txt variant="caption" color={c.danger}>
            Bu değil — iki eylemi birbirine bağlayan eki ya da kelimeyi ara.
          </Txt>
        )}
      </Surface>
    );
  }

  if (stage === "pick") {
    return (
      <Surface raised style={{ gap: 12 }}>
        <CueChip text="Bağlacı sen bul" icon="scissors" />
        <Txt variant="headline">{`Evet, bağlacımız "${card.tr}". Bunu nasıl vereceğiz?`}</Txt>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {order.map((o) => (
            <Button
              key={o}
              variant="secondary"
              label={view.show(o)}
              accessibilityLabel={`Seçenek: ${o}`}
              style={{ flex: 1 }}
              onPress={() => {
                const ok = o === opts?.right;
                setPicked(ok);
                setStage("reveal");
                onSplit(ok);
              }}
            />
          ))}
        </View>
      </Surface>
    );
  }

  return (
    <Surface raised style={{ gap: 12 }}>
      {picked !== null && (
        <Txt variant="caption" color={picked ? c.accentDark : c.danger} style={{ fontWeight: "800" }}>
          {picked ? "Doğru seçtin." : `Olmadı: ${view.show(opts?.wrong ?? "")} değil.`}
        </Txt>
      )}
      <Txt variant="title3" style={{ fontWeight: "500" }}>
        {"Burada bir bağlacımız var: "}
        <Txt variant="title3" color={c.gold}>
          {card.tr}
        </Txt>
      </Txt>
      {card.part1 && card.part2 ? (
        <Txt variant="callout">
          {"Birincisi "}
          <Txt variant="callout" style={{ fontStyle: "italic", fontWeight: "800" }}>
            {card.part1}
          </Txt>
          {", ikincisi "}
          <Txt variant="callout" style={{ fontStyle: "italic", fontWeight: "800" }}>
            {card.part2}
          </Txt>
          {", arada da bağlacımız var."}
        </Txt>
      ) : null}
      <View style={[s.row, { flexWrap: "wrap" }]}>
        <Txt variant="callout">{accusative(card.tr)}</Txt>
        <TargetText size={view.rtl ? 24 : 19} color={c.accentDark}>
          {view.show(card.target)}
        </TargetText>
        <Txt variant="callout">ile vereceğiz.</Txt>
      </View>
      {!!card.contrast && <ContrastBox text={card.contrast} mini={trap?.mini} />}
      {buildOrderLine(card, linked) ? <CueChip text={buildOrderLine(card, linked)} icon="arrowRight" /> : null}
    </Surface>
  );
}
