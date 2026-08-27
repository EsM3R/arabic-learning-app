import { LinearGradient } from "expo-linear-gradient";
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
import { LANGUAGE_LIST, LANGUAGE_PACKS, LanguageId } from "../languages";
import { PROVIDER_LIST, ProviderId } from "../providers";
import { colors, radius, shadowLift } from "../theme";

interface Props {
  onDone: (
    name: string,
    apiKey: string,
    languageId: LanguageId,
    providerId: ProviderId
  ) => void;
}

export default function SetupScreen({ onDone }: Props) {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [languageId, setLanguageId] = useState<LanguageId>("ar");
  const [providerId, setProviderId] = useState<ProviderId>("anthropic");
  const pack = LANGUAGE_PACKS[languageId];
  const provider =
    PROVIDER_LIST.find((p) => p.meta.id === providerId) ?? PROVIDER_LIST[0];

  const submit = () => {
    if (!name.trim()) {
      Alert.alert("Eksik bilgi", "Lütfen adını yaz.");
      return;
    }
    const key = apiKey.trim();
    if (!key) {
      Alert.alert("Anahtar eksik", `${provider.meta.label} API anahtarını gir.`);
      return;
    }
    if (provider.meta.keyPrefix && !key.startsWith(provider.meta.keyPrefix)) {
      Alert.alert(
        "API anahtarı hatalı görünüyor",
        `${provider.meta.label} anahtarları "${provider.meta.keyPrefix}" ile başlar.\n\n${provider.meta.keyHint}`
      );
      return;
    }
    onDone(name.trim(), key, languageId, providerId);
  };

  return (
    // Edge-to-edge modda Android pencereyi klavye için küçültmediğinden
    // behavior her iki platformda da verilmeli.
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        style={styles.container}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[colors.deep, colors.deepAlt]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroGreeting}>{pack.greeting}</Text>
          <Text style={styles.heroTitle}>Lisan Hocası</Text>
          <Text style={styles.heroSub}>
            Kişisel yapay zekâ öğretmenin {pack.teacherName}, seni {pack.label.toLowerCase()}de
            sıfırdan uzmanlığa taşıyacak — konuşma ve okuma odaklı, sana özel müfredatla.
          </Text>
          <View style={styles.heroBadges}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>
                {pack.tracks.konusma.icon} {pack.tracks.konusma.title}
              </Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>
                {pack.tracks.okuma.icon} {pack.tracks.okuma.title}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.form}>
          <Text style={styles.label}>Hangi dili öğrenmek istiyorsun?</Text>
          <View style={styles.langRow}>
            {LANGUAGE_LIST.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.langChip, languageId === l.id && styles.langChipActive]}
                onPress={() => setLanguageId(l.id)}
              >
                <Text style={styles.langFlag}>{l.flag}</Text>
                <Text
                  style={[styles.langLabel, languageId === l.id && styles.langLabelActive]}
                >
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            Diğer dilleri sonra panelden ekleyebilirsin — her dilin müfredatı ve kelime defteri
            ayrı tutulur.
          </Text>

          <Text style={styles.label}>Adın</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="örn. Mehmet"
            placeholderTextColor={colors.inkFaint}
          />

          <Text style={styles.label}>Model sağlayıcısı</Text>
          <View style={styles.provRow}>
            {PROVIDER_LIST.map((p) => {
              const active = p.meta.id === providerId;
              return (
                <TouchableOpacity
                  key={p.meta.id}
                  style={[styles.provChip, active && styles.provChipActive]}
                  onPress={() => setProviderId(p.meta.id)}
                >
                  <Text style={[styles.provText, active && styles.provTextActive]}>
                    {p.meta.label}
                  </Text>
                  {p.meta.experimental && <Text style={styles.provBeta}>denenmedi</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.hint}>{provider.meta.costNote}</Text>

          <Text style={[styles.label, { marginTop: 16 }]}>
            {provider.meta.label} API Anahtarı
          </Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder={provider.meta.keyPrefix ? `${provider.meta.keyPrefix}…` : "anahtarı yapıştır"}
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.hint}>
            Anahtar almak için: {provider.meta.keyHint}
            {"\n"}Anahtar sadece bu cihazda saklanır; istekler doğrudan cihazından
            sağlayıcıya gider. Sonradan panelden değiştirebilirsin.
          </Text>

          <TouchableOpacity onPress={submit} activeOpacity={0.85}>
            <LinearGradient
              colors={[colors.accent, colors.accentDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Başlayalım {pack.flag}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },
  hero: {
    paddingTop: 96,
    paddingBottom: 40,
    paddingHorizontal: 28,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroGreeting: { fontSize: 56, lineHeight: 76, color: colors.goldDeep, fontWeight: "700" },
  heroTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.onDeep,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  heroSub: { fontSize: 14.5, color: colors.onDeepSoft, lineHeight: 22, marginTop: 12 },
  heroBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  heroBadge: {
    backgroundColor: "rgba(243,239,228,0.12)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(243,239,228,0.22)",
  },
  heroBadgeText: { color: colors.onDeep, fontSize: 12.5, fontWeight: "700" },
  form: { padding: 24, paddingTop: 28 },
  label: { fontSize: 13, fontWeight: "800", color: colors.ink, marginBottom: 7 },
  langRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  langChip: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingVertical: 12,
  },
  langChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  langFlag: { fontSize: 26 },
  langLabel: { fontSize: 13, fontWeight: "700", color: colors.inkSoft },
  langLabelActive: { color: colors.accent },
  provRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  provChip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.card,
    paddingHorizontal: 13,
    paddingVertical: 9,
    alignItems: "center",
  },
  provChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  provText: { fontSize: 13, fontWeight: "700", color: colors.inkSoft },
  provTextActive: { color: colors.accent },
  provBeta: { fontSize: 9, fontWeight: "800", color: colors.gold, marginTop: 1 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15.5,
    color: colors.ink,
    marginBottom: 18,
  },
  hint: { fontSize: 12, color: colors.inkSoft, lineHeight: 18, marginBottom: 28 },
  button: {
    borderRadius: radius.lg,
    paddingVertical: 17,
    alignItems: "center",
    ...shadowLift,
  },
  buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
});
