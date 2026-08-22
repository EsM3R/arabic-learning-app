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
import { colors, radius, shadowLift } from "../theme";

interface Props {
  onDone: (name: string, apiKey: string) => void;
}

export default function SetupScreen({ onDone }: Props) {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");

  const submit = () => {
    if (!name.trim()) {
      Alert.alert("Eksik bilgi", "Lütfen adını yaz.");
      return;
    }
    if (!apiKey.trim().startsWith("sk-ant-")) {
      Alert.alert(
        "API anahtarı hatalı görünüyor",
        "Anthropic API anahtarları 'sk-ant-' ile başlar. Anahtarı console.anthropic.com adresinden alabilirsin."
      );
      return;
    }
    onDone(name.trim(), apiKey.trim());
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView style={styles.container} bounces={false}>
        <LinearGradient
          colors={[colors.deep, colors.deepAlt]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroArabic}>مرحبا</Text>
          <Text style={styles.heroTitle}>Arapça Hoca</Text>
          <Text style={styles.heroSub}>
            Şami ammicesiyle konuş, fusha ile oku.{"\n"}Kişisel yapay zekâ öğretmenin Üstaz,
            seni sıfırdan uzmanlığa taşıyacak.
          </Text>
          <View style={styles.heroBadges}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>🗣️ Konuşma · Ammice</Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>📖 Okuma · Fusha</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.form}>
          <Text style={styles.label}>Adın</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="örn. Mehmet"
            placeholderTextColor={colors.inkFaint}
          />

          <Text style={styles.label}>Anthropic API Anahtarı</Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-ant-…"
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.hint}>
            Anahtar almak için: console.anthropic.com → hesap aç → "API Keys" → "Create Key".
            Anahtar sadece bu cihazda saklanır; istekler doğrudan Anthropic'e gider.
          </Text>

          <TouchableOpacity onPress={submit} activeOpacity={0.85}>
            <LinearGradient
              colors={[colors.accent, colors.accentDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Başlayalım → يلا</Text>
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
  heroArabic: { fontSize: 64, lineHeight: 84, color: colors.goldDeep, fontWeight: "700" },
  heroTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.onDeep,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  heroSub: { fontSize: 14.5, color: colors.onDeepSoft, lineHeight: 22, marginTop: 12 },
  heroBadges: { flexDirection: "row", gap: 8, marginTop: 18 },
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
