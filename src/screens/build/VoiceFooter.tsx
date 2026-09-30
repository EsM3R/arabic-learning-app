/**
 * SES ÖNCELİKLİ alt çubuk: varsayılan büyük "basılı tut ve söyle" mikrofonu.
 * Klavye yalnız yedek (sessiz ortam, mikrofon yok). Yöntemin amacı
 * konuşmak; yazarak kurulan cümle ağızda otomatikleşmez.
 */
import React from "react";
import { TextInput, View } from "react-native";
import type { IconName } from "../../components/Icon";
import { Button, IconButton, Txt, Wave } from "../../components/kit";
import { useBuildStyles } from "./ui";

export interface FooterAction {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
}

export default function VoiceFooter({
  listen,
  listening,
  partial,
  error,
  keyboard,
  answer,
  rtl,
  onToggleKeyboard,
  onChange,
  onSubmit,
  onMicIn,
  onMicOut,
  dontKnow,
  primary,
  secondary,
}: {
  /** Cevap bekleniyor mu (mikrofon/klavye görünür). */
  listen: boolean;
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
  /** "Bilmiyorum" (ya da karta özgü kaçış: "Adım adım kur", "Geç"). */
  dontKnow?: FooterAction;
  /** Cevap beklenmiyorken ana düğme (Devam, Bir daha söyle…). */
  primary?: FooterAction;
  secondary?: FooterAction;
}) {
  const { s, c } = useBuildStyles();
  if (!listen) {
    return (
      <View style={{ flexDirection: "row", gap: 10 }}>
        {secondary ? (
          <Button variant="ghost" icon={secondary.icon} label={secondary.label} onPress={secondary.onPress} disabled={secondary.disabled} style={{ paddingHorizontal: 14 }} />
        ) : null}
        {primary ? (
          <Button icon={primary.icon} label={primary.label} onPress={primary.onPress} disabled={primary.disabled} style={{ flex: 1 }} />
        ) : null}
      </View>
    );
  }
  if (keyboard) {
    return (
      <View style={{ gap: 10 }}>
        <TextInput
          style={[s.input, rtl && s.rtl]}
          value={answer}
          onChangeText={onChange}
          placeholder="Cümlenin tamamını yaz"
          placeholderTextColor={c.inkFaint}
          autoCapitalize="sentences"
          autoCorrect={false}
          onSubmitEditing={onSubmit}
        />
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <IconButton icon="mic" label="Sesle cevapla" variant="outline" size={50} onPress={onToggleKeyboard} />
          {dontKnow ? <Button variant="ghost" label={dontKnow.label} onPress={dontKnow.onPress} style={{ paddingHorizontal: 14 }} /> : null}
          <Button label="Kontrol et" disabled={!answer.trim()} onPress={onSubmit} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={[s.row, { justifyContent: "center", minHeight: 22 }]}>
        {listening ? (
          <>
            <Wave active color={c.accent} />
            <Txt variant="callout" color={c.inkSoft} style={{ fontStyle: "italic", flexShrink: 1 }} numberOfLines={2}>
              {partial || "Dinliyorum — bırakınca biter"}
            </Txt>
          </>
        ) : error ? (
          <Txt variant="caption" color={c.danger} center>
            {error}
          </Txt>
        ) : (
          <Txt variant="caption" color={c.inkFaint} center>
            Basılı tut, cümlenin tamamını söyle, bırak.
          </Txt>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, alignItems: "flex-start" }}>
          <IconButton icon="keyboard" label="Klavyeyle yaz" variant="outline" size={48} onPress={onToggleKeyboard} />
        </View>
        <IconButton
          icon={listening ? "stop" : "mic"}
          label="Basılı tut ve söyle"
          variant="deep"
          size={76}
          iconSize={32}
          onPressIn={onMicIn}
          onPressOut={onMicOut}
        />
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          {dontKnow ? <Button variant="ghost" size="md" label={dontKnow.label} onPress={dontKnow.onPress} style={{ paddingHorizontal: 12 }} /> : null}
        </View>
      </View>
    </View>
  );
}
