import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Header from "../components/Header";
import { isProviderId, keyFor, modelFor, PROVIDER_LIST, ProviderId } from "../providers";
import { colors, radius, shadow, shadowLift } from "../theme";
import { Profile } from "../types";

interface Props {
  profile: Profile;
  onSave: (next: Profile) => void;
  onBack: () => void;
}

export default function SettingsScreen({ profile, onSave, onBack }: Props) {
  // Depodan gelen değer bilinmeyen bir metin olabilir (eski/bozuk kayıt).
  // Doğrulamadan kullanırsak aşağıdaki find() undefined döner ve ekran çöker.
  const initial: ProviderId = isProviderId(profile.provider)
    ? profile.provider
    : "anthropic";
  const [selected, setSelected] = useState<ProviderId>(initial);
  // Tüm sağlayıcıların anahtar/model taslakları burada tutulur; kaydederken
  // hepsi birden yazılır, böylece bir sağlayıcıdan diğerine geçince
  // öbürünün anahtarı kaybolmaz.
  const [keys, setKeys] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of PROVIDER_LIST) out[p.meta.id] = keyFor(profile, p.meta.id);
    return out;
  });
  const [models, setModels] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of PROVIDER_LIST) out[p.meta.id] = modelFor(profile, p.meta.id);
    return out;
  });

  const current =
    PROVIDER_LIST.find((p) => p.meta.id === selected) ?? PROVIDER_LIST[0];
  const meta = current.meta;

  const save = () => {
    const key = (keys[selected] ?? "").trim();
    if (!key) {
      Alert.alert(
        "Anahtar eksik",
        `${meta.label} ile ders yapabilmek için önce API anahtarını girmelisin.`
      );
      return;
    }
    if (meta.keyPrefix && !key.startsWith(meta.keyPrefix)) {
      Alert.alert(
        "Anahtar hatalı görünüyor",
        `${meta.label} anahtarları "${meta.keyPrefix}" ile başlar. Yine de kaydetmek istersen anahtarı kontrol et.`
      );
      return;
    }
    const trimmedKeys: Record<string, string> = {};
    for (const [k, v] of Object.entries(keys)) if (v.trim()) trimmedKeys[k] = v.trim();
    const trimmedModels: Record<string, string> = {};
    for (const [k, v] of Object.entries(models)) if (v.trim()) trimmedModels[k] = v.trim();

    onSave({
      ...profile,
      provider: selected,
      apiKeys: trimmedKeys,
      models: trimmedModels,
      // Eski alan Anthropic anahtarıyla uyumlu kalsın
      apiKey: trimmedKeys.anthropic ?? profile.apiKey,
    });
    onBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Header
          title="Model ve Anahtarlar"
          subtitle={`Aktif: ${
            PROVIDER_LIST.find((p) => p.meta.id === initial)?.meta.label ?? "—"
          }`}
          onBack={onBack}
        />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.label}>Sağlayıcı</Text>
          {PROVIDER_LIST.map((p) => {
            const active = p.meta.id === selected;
            const hasKey = (keys[p.meta.id] ?? "").trim().length > 0;
            return (
              <TouchableOpacity
                key={p.meta.id}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => setSelected(p.meta.id)}
                activeOpacity={0.85}
              >
                <View style={[styles.radio, active && styles.radioOn]}>
                  {active && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTitleLine}>
                    <Text style={styles.rowTitle}>{p.meta.label}</Text>
                    {p.meta.experimental && (
                      <Text style={styles.betaTag}>DENENMEDİ</Text>
                    )}
                  </View>
                  <Text style={styles.rowMeta}>{p.meta.costNote}</Text>
                </View>
                {hasKey && <Text style={styles.keyOk}>✓ anahtar</Text>}
              </TouchableOpacity>
            );
          })}

          {meta.experimental && (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                Bu sağlayıcı canlı API'ye karşı denenmedi. Çalışmazsa Anthropic'e geri
                dön — dersin, kelime defterin ve ilerlemen etkilenmez.
              </Text>
            </View>
          )}

          <Text style={[styles.label, { marginTop: 20 }]}>Model</Text>
          <TextInput
            style={styles.input}
            value={models[selected] ?? ""}
            onChangeText={(v) => setModels({ ...models, [selected]: v })}
            placeholder={meta.defaultModel}
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.chips}>
            {meta.models.map((m) => (
              <TouchableOpacity
                key={m}
                style={styles.chip}
                onPress={() => setModels({ ...models, [selected]: m })}
              >
                <Text style={styles.chipText}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            Model adları sağlayıcı tarafında değişebilir; çalışmazsa güncel adı
            sağlayıcının belgelerinden alıp buraya yazabilirsin.
          </Text>

          <Text style={[styles.label, { marginTop: 16 }]}>API Anahtarı</Text>
          <TextInput
            style={styles.input}
            value={keys[selected] ?? ""}
            onChangeText={(v) => setKeys({ ...keys, [selected]: v })}
            placeholder={meta.keyPrefix ? `${meta.keyPrefix}…` : "anahtarı yapıştır"}
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.hint}>
            {meta.keyHint}
            {"\n"}Anahtarlar yalnızca bu cihazda saklanır; istekler doğrudan
            cihazından sağlayıcıya gider.
          </Text>

          <TouchableOpacity style={styles.saveButton} onPress={save} activeOpacity={0.85}>
            <Text style={styles.saveText}>Kaydet</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 18, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: "800", color: colors.ink, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 9,
    ...shadow,
  },
  rowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.inkFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.accent },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  betaTag: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.gold,
    backgroundColor: colors.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rowMeta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  keyOk: { fontSize: 11, fontWeight: "800", color: colors.accent },
  warnBox: {
    backgroundColor: colors.goldSoft,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  warnText: { fontSize: 12.5, color: colors.ink, lineHeight: 19 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.ink,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipText: { fontSize: 12, color: colors.accentDark, fontWeight: "700" },
  hint: { fontSize: 12, color: colors.inkSoft, lineHeight: 18, marginTop: 8 },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 26,
    ...shadowLift,
  },
  saveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
