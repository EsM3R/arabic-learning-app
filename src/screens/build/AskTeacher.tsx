/**
 * "Hocaya sor": çalışılan cümle hakkında soru. Hazır sorular ("Neden böyle?")
 * tek dokunuşla, serbest soru yazarak. Cevap hocanın üslubuyla ve BU cümle
 * üzerinden gelir.
 *
 * Denemeden SONRA görünür: önceden sorulursa cevap söyletmez, okutur.
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import Icon from "../../components/Icon";
import { Chip, IconButton, PressableScale, Txt } from "../../components/kit";
import RichText from "../../components/RichText";
import { useBuildStyles } from "./ui";

export const ASK_PRESETS = ["Neden böyle kuruldu?", "Bu kelime burada ne işe yarıyor?", "Başka nasıl söylenir?"];

interface QA {
  q: string;
  a?: string;
  error?: string;
}

export default function AskTeacher({
  onAsk,
  presets = ASK_PRESETS,
}: {
  onAsk: (question: string) => Promise<string>;
  presets?: string[];
}) {
  const { s, c } = useBuildStyles();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [items, setItems] = useState<QA[]>([]);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );

  const ask = (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setOpen(true);
    setText("");
    setBusy(true);
    const idx = items.length;
    setItems((xs) => [...xs, { q }]);
    onAsk(q)
      .then((a) => alive.current && setItems((xs) => xs.map((x, k) => (k === idx ? { ...x, a } : x))))
      .catch((e: unknown) => {
        if (!alive.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setItems((xs) => xs.map((x, k) => (k === idx ? { ...x, error: msg } : x)));
      })
      .finally(() => alive.current && setBusy(false));
  };

  if (!open) {
    return (
      <PressableScale onPress={() => setOpen(true)} accessibilityLabel="Hocaya sor" style={{ alignSelf: "flex-start" }}>
        <View style={[s.row, { backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: c.border }]}>
          <Icon name="message" size={16} color={c.accentDark} />
          <Txt variant="caption" color={c.accentDark} style={{ fontWeight: "800" }}>
            Hocaya sor · Neden böyle?
          </Txt>
        </View>
      </PressableScale>
    );
  }

  const asked = new Set(items.map((x) => x.q));
  return (
    <View style={{ gap: 10, backgroundColor: c.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.border }}>
      <View style={s.row}>
        <Icon name="message" size={16} color={c.accentDark} />
        <Txt variant="caption" color={c.accentDark} style={{ fontWeight: "800", flex: 1 }}>
          Hocaya sor
        </Txt>
      </View>
      {items.map((x, k) => (
        <View key={k} style={{ gap: 6 }}>
          <Txt variant="callout" style={{ fontWeight: "700" }}>
            {x.q}
          </Txt>
          {x.a ? (
            <RichText content={x.a} style={{ fontSize: 15, lineHeight: 22, color: c.ink }} scaleScript />
          ) : x.error ? (
            <Txt variant="caption" color={c.danger}>
              {`Cevap gelmedi: ${x.error}`}
            </Txt>
          ) : (
            <View style={s.row}>
              <ActivityIndicator size="small" color={c.accent} />
              <Txt variant="caption" color={c.inkSoft}>
                Hoca düşünüyor…
              </Txt>
            </View>
          )}
        </View>
      ))}
      <View style={s.wrap}>
        {presets
          .filter((p) => !asked.has(p))
          .map((p) => (
            <Chip key={p} label={p} onPress={() => ask(p)} />
          ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          style={[s.input, { flex: 1, fontSize: 15, paddingVertical: 10, borderWidth: 1, borderColor: c.border }]}
          value={text}
          onChangeText={setText}
          placeholder="Sorunu yaz"
          placeholderTextColor={c.inkFaint}
          accessibilityLabel="Hocaya sorun"
          onSubmitEditing={() => ask(text)}
          returnKeyType="send"
        />
        <IconButton icon="arrowRight" label="Soruyu gönder" variant="deep" disabled={busy || !text.trim()} onPress={() => ask(text)} />
      </View>
    </View>
  );
}
