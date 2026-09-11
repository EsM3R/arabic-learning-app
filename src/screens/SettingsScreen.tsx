import React, { useEffect, useState } from "react";
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
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  backupFileName,
  buildBackup,
  parseBackup,
  serializeBackup,
  summarizeBackup,
} from "../backup";
import Header from "../components/Header";
import { isLanguageId, LANGUAGE_PACKS } from "../languages";
import { isProviderId, keyFor, modelFor, PROVIDER_LIST, ProviderId } from "../providers";
import { dumpAllEntries, restoreFromBackup } from "../storage";
import { colors, radius, shadow, shadowLift } from "../theme";
import { Profile } from "../types";
import { formatTry, usageSummary, UsageSummary } from "../usage";
import { buildLabel } from "../buildInfo";

interface Props {
  profile: Profile;
  onSave: (next: Profile) => void;
  /** Yedekten dönüldü — depo baştan yazıldı, uygulama kendini yeniden yüklemeli. */
  onRestored: () => void;
  onBack: () => void;
}

/** Yedekteki dil kodunu okunur ada çevirir ("ru" → "Rusça"). */
function languageLabel(id: string): string {
  return isLanguageId(id) ? LANGUAGE_PACKS[id].label : id;
}

export default function SettingsScreen({ profile, onSave, onRestored, onBack }: Props) {
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

  const [usage, setUsage] = useState<UsageSummary | null>(null);
  useEffect(() => {
    void usageSummary().then(setUsage);
  }, []);

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

  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

  /**
   * Yedek al: depodaki her şey (API anahtarları HARİÇ) tek JSON dosyasına
   * yazılır ve Android paylaşım sayfası açılır — Drive, WhatsApp, e-posta...
   */
  const exportBackup = async () => {
    setBusy("export");
    try {
      const backup = buildBackup(await dumpAllEntries(), buildLabel());
      const file = new File(Paths.cache, backupFileName());
      if (file.exists) file.delete(); // aynı gün ikinci yedek: eskisinin üstüne
      file.create();
      file.write(serializeBackup(backup));
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Paylaşım kullanılamıyor", `Yedek şuraya yazıldı:\n${file.uri}`);
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Yedeği nereye kaydedelim?",
      });
    } catch (e) {
      Alert.alert("Yedek alınamadı", errText(e));
    } finally {
      setBusy(null);
    }
  };

  /** Yedekten dön: dosya seç → doğrula → özetle ve onay al → depoyu değiştir → yeniden yükle. */
  const importBackup = async () => {
    setBusy("import");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const text = await new File(picked.assets[0].uri).text();
      const backup = parseBackup(text);
      const s = summarizeBackup(backup);
      const when = s.exportedAt
        ? new Date(s.exportedAt).toLocaleDateString("tr-TR")
        : "tarih yok";
      Alert.alert(
        "Yedekten dön",
        `Yedek: ${s.name || "isimsiz"} · ${when}\n` +
          `${s.vocab} kelime · ${s.mistakes} hata · ${s.readings} okuma metni · ${s.chats} sohbet\n` +
          `Diller: ${s.languages.map(languageLabel).join(", ") || "—"}\n\n` +
          "Bu cihazdaki HER ŞEY silinip yedektekiyle değiştirilecek. API anahtarın ve model seçimin bu cihazda kalır.",
        [
          { text: "Vazgeç", style: "cancel" },
          {
            text: "Evet, geri yükle",
            style: "destructive",
            onPress: () =>
              void (async () => {
                try {
                  await restoreFromBackup(backup, profile);
                  onRestored();
                } catch (e) {
                  Alert.alert("Geri yükleme başarısız", errText(e));
                }
              })(),
          },
        ]
      );
    } catch (e) {
      Alert.alert("Yedek okunamadı", errText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    // Edge-to-edge modda Android pencereyi klavye için küçültmediğinden
    // behavior her iki platformda da verilmeli.
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.container}>
        <Header
          title="Ayarlar"
          subtitle={`Aktif: ${
            PROVIDER_LIST.find((p) => p.meta.id === initial)?.meta.label ?? "—"
          }`}
          onBack={onBack}
        />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {usage && (
            <View style={styles.usageCard}>
              <Text style={styles.usageTitle}>TAHMİNİ HARCAMA</Text>
              <View style={styles.usageRow}>
                <View>
                  <Text style={styles.usageBig}>{formatTry(usage.todayUsd)}</Text>
                  <Text style={styles.usageSmall}>bugün · {usage.todayCalls} istek</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.usageBig}>{formatTry(usage.monthUsd)}</Text>
                  <Text style={styles.usageSmall}>bu ay · {usage.monthCalls} istek</Text>
                </View>
              </View>
              <Text style={styles.usageNote}>
                Token sayılarından hesaplanan tahmindir; kesin tutar sağlayıcının
                faturasıdır. {buildLabel()}
              </Text>
            </View>
          )}

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

          <View style={styles.backupCard}>
            <Text style={styles.backupTitle}>💾 Yedek</Text>
            <Text style={styles.backupText}>
              Kelime defterin, hata defterin, hocanın notları, müfredatın, sohbetlerin
              ve okuma metinlerin tek dosyaya çıkar. Dosyayı Drive'a, WhatsApp'ta kendine
              ya da e-postana at; yeni telefonda "Yedekten dön" ile hoca seni bıraktığın
              yerden tanır. API anahtarın yedeğe girmez.
            </Text>
            <View style={styles.backupRow}>
              <TouchableOpacity
                style={[styles.backupButton, busy && styles.backupButtonOff]}
                onPress={() => void exportBackup()}
                disabled={busy !== null}
                activeOpacity={0.85}
              >
                <Text style={styles.backupButtonText}>
                  {busy === "export" ? "Hazırlanıyor…" : "Yedek al"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.backupButton, styles.backupButtonAlt, busy && styles.backupButtonOff]}
                onPress={() => void importBackup()}
                disabled={busy !== null}
                activeOpacity={0.85}
              >
                <Text style={[styles.backupButtonText, styles.backupButtonAltText]}>
                  {busy === "import" ? "Okunuyor…" : "Yedekten dön"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
  usageCard: {
    backgroundColor: colors.deep,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 20,
    ...shadow,
  },
  usageTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.goldDeep,
    letterSpacing: 1,
    marginBottom: 10,
  },
  usageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  usageBig: { fontSize: 22, fontWeight: "800", color: colors.onDeep },
  usageSmall: { fontSize: 11.5, color: colors.onDeepSoft, marginTop: 1 },
  usageNote: {
    fontSize: 10.5,
    color: colors.onDeepSoft,
    lineHeight: 15,
    marginTop: 12,
  },
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
  backupCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 28,
    ...shadow,
  },
  backupTitle: { fontSize: 15, fontWeight: "800", color: colors.ink, marginBottom: 6 },
  backupText: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 },
  backupRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  backupButton: {
    flex: 1,
    backgroundColor: colors.goldSoft,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
  },
  backupButtonAlt: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backupButtonOff: { opacity: 0.5 },
  backupButtonText: { color: colors.gold, fontSize: 13, fontWeight: "800" },
  backupButtonAltText: { color: colors.accentDark },
});
