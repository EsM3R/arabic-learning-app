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
} from "react-native";
import { colors } from "../theme";

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
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.logo}>مرحبا</Text>
        <Text style={styles.title}>Arapça Hoca</Text>
        <Text style={styles.subtitle}>
          Şami ammicesiyle konuş, fusha ile oku. Kişisel yapay zekâ öğretmenin Üstaz seni
          sıfırdan uzmanlığa taşıyacak.
        </Text>

        <Text style={styles.label}>Adın</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="örn. Mehmet"
          placeholderTextColor={colors.inkSoft}
        />

        <Text style={styles.label}>Anthropic API Anahtarı</Text>
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="sk-ant-…"
          placeholderTextColor={colors.inkSoft}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Text style={styles.hint}>
          Anahtar almak için: console.anthropic.com → hesap aç → "API Keys" → "Create Key".
          Anahtar sadece bu cihazda saklanır, istekler doğrudan Anthropic'e gider.
        </Text>

        <TouchableOpacity style={styles.button} onPress={submit}>
          <Text style={styles.buttonText}>Başlayalım → يلا</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 80 },
  logo: { fontSize: 56, textAlign: "center", color: colors.accent, marginBottom: 4 },
  title: {
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
    color: colors.ink,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    color: colors.inkSoft,
    lineHeight: 22,
    marginBottom: 32,
  },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 16,
  },
  hint: { fontSize: 12, color: colors.inkSoft, lineHeight: 18, marginBottom: 28 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
});
