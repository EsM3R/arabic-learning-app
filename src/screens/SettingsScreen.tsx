import React, { useEffect, useMemo, useState } from "react";
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
import { latestSnapshotUri, listSnapshots } from "../snapshots";
import { snapshotStatus } from "../autobackup";
import { testConnection } from "../claude";
import { classifyError } from "../connectiontest";
import type { TestResult } from "../connectiontest";
import {
  dumpAllEntries,
  loadLastSnapshotAt,
  restoreFromBackup,
  saveLastExportAt,
} from "../storage";
import { colors, radius, shadow, shadowLift } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
import { Profile } from "../types";
import { formatTry, usageSummary, UsageSummary } from "../usage";
import { USD_TRY } from "../pricing";
import { budgetStatus, DEFAULT_BUDGET, normalizeLimits } from "../budget";
import { previewVoice } from "../openaiVoice";
import { neuralVoiceActive, normalizeVoice, OPENAI_VOICES } from "../voice";
import type { VoiceSettings } from "../voice";
import { getActivePack } from "../languages";
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
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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

  // Tavan alanları metin olarak tutulur: kullanıcı yazarken alanı boşaltabilir,
  // sayıya çevirmek kaydetme anında yapılır (yazarken 0'a düşmesin).
  const savedLimits = normalizeLimits(profile.budget);
  const [daily, setDaily] = useState(String(savedLimits.dailyTry));
  const [monthly, setMonthly] = useState(String(savedLimits.monthlyTry));
  const draftLimits = normalizeLimits({
    dailyTry: daily.trim() === "" ? savedLimits.dailyTry : Number(daily),
    monthlyTry: monthly.trim() === "" ? savedLimits.monthlyTry : Number(monthly),
  });
  const budget = usage ? budgetStatus(usage, draftLimits, USD_TRY) : null;

  // Ses tercihi. Ses modeli OpenAI anahtarı ister; anahtar yoksa tercih
  // kaydedilir ama telefon sesi kullanılır — bunu ekran açıkça söyler.
  const [voice, setVoice] = useState<VoiceSettings>(() => normalizeVoice(profile.voice));
  const openaiDraftKey = (keys.openai ?? "").trim();
  const voiceReady = neuralVoiceActive(voice, openaiDraftKey);
  const [previewing, setPreviewing] = useState(false);
  const tryVoice = async () => {
    setPreviewing(true);
    try {
      await previewVoice(openaiDraftKey, voice.voiceId, getActivePack().greeting);
    } catch (e) {
      Alert.alert("Ses denenemedi", errText(e));
    } finally {
      setPreviewing(false);
    }
  };

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
      budget: draftLimits,
      voice,
      // Eski alan Anthropic anahtarıyla uyumlu kalsın
      apiKey: trimmedKeys.anthropic ?? profile.apiKey,
    });
    onBack();
  };

  const [busy, setBusy] = useState<"export" | "import" | "test" | null>(null);
  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

  /**
   * Yedek al: depodaki her şey (API anahtarları HARİÇ) tek JSON dosyasına
   * yazılır ve Android paylaşım sayfası açılır — Drive, WhatsApp, e-posta...
   */
  /** Son bağlantı sınaması sonucu (null = henüz sınanmadı). */
  const [test, setTest] = useState<TestResult | null>(null);
  /** Otomatik anlık görüntü durumu — Ayarlar açılınca okunur. */
  const [snapInfo, setSnapInfo] = useState<string>("");

  useEffect(() => {
    void (async () => {
      const [lastAt, names] = await Promise.all([
        loadLastSnapshotAt(),
        Promise.resolve(listSnapshots()),
      ]);
      setSnapInfo(snapshotStatus(lastAt, names.length));
    })();
  }, []);

  /** Son otomatik anlık görüntüyü dışarı paylaş — bir dokunuşla kurtarma. */
  const shareSnapshot = async () => {
    const uri = latestSnapshotUri();
    if (!uri) {
      Alert.alert("Anlık görüntü yok", "Henüz otomatik anlık görüntü alınmamış.");
      return;
    }
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Paylaşım kullanılamıyor", `Dosya şurada:\n${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: "Anlık görüntüyü nereye kaydedelim?",
      });
      await saveLastExportAt();
    } catch (e) {
      Alert.alert("Paylaşılamadı", errText(e));
    }
  };

  const runConnectionTest = async () => {
    setBusy("test");
    setTest(null);
    try {
      // Sınama EKRANDAKİ değerlerle yapılmalı: kullanıcı anahtarı yeni
      // yapıştırmış ama kaydetmemiş olabilir.
      const draft: Profile = {
        ...profile,
        provider: selected,
        apiKeys: { ...(profile.apiKeys ?? {}), ...keys },
        models: { ...(profile.models ?? {}), ...models },
      };
      setTest(await testConnection(draft, selected));
    } catch (e) {
      setTest(classifyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  };

  const exportBackup = async () => {
    setBusy("export");
    try {
      const backup = buildBackup(await dumpAllEntries(), buildLabel());
      const file = new File(Paths.cache, backupFileName());
      if (file.exists) file.delete(); // aynı gün ikinci yedek: eskisinin üstüne
      file.create();
      file.write(serializeBackup(backup));
      if (!(await Sharing.isAvailableAsync())) {
        await saveLastExportAt();
        Alert.alert("Paylaşım kullanılamıyor", `Yedek şuraya yazıldı:\n${file.uri}`);
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Yedeği nereye kaydedelim?",
      });
      // Hatırlatma sayacı burada sıfırlanır: dosya gerçekten dışarı çıktı.
      await saveLastExportAt();
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

          {/* Sert tavan: göstermek koruma değil, DURDURMAK korumadır. */}
          <Text style={styles.label}>Harcama tavanı</Text>
          <Text style={styles.hint}>
            Tavan dolunca uygulama yeni istek göndermez — ders, okuma metni, telaffuz
            seti, hepsi durur. 0 yazarsan o sınır kapanır (önerilmez). Rakamlar
            tahmindir; kesin tutar sağlayıcının faturasıdır.
          </Text>
          <View style={styles.budgetRow}>
            <View style={styles.budgetField}>
              <Text style={styles.budgetLabel}>Günlük (TL)</Text>
              <TextInput
                style={styles.input}
                value={daily}
                onChangeText={setDaily}
                keyboardType="number-pad"
                placeholder={String(DEFAULT_BUDGET.dailyTry)}
                placeholderTextColor={colors.inkFaint}
              />
            </View>
            <View style={styles.budgetField}>
              <Text style={styles.budgetLabel}>Aylık (TL)</Text>
              <TextInput
                style={styles.input}
                value={monthly}
                onChangeText={setMonthly}
                keyboardType="number-pad"
                placeholder={String(DEFAULT_BUDGET.monthlyTry)}
                placeholderTextColor={colors.inkFaint}
              />
            </View>
          </View>
          {budget && budget.state !== "ok" && (
            <View style={[styles.warnBox, budget.state === "blocked" && styles.blockBox]}>
              <Text style={styles.warnText}>{budget.message}</Text>
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
                Bu sağlayıcı canlı API'ye karşı denenmedi. Aşağıdaki düğmeyle kendin
                sınayabilirsin; çalışmazsa Anthropic'e geri dön — dersin, kelime
                defterin ve ilerlemen etkilenmez.
              </Text>
            </View>
          )}

          {/* Bağlantı sınaması: denenmemiş kod yolunun hatası ders ortasında
              değil BURADA çıksın. Ders açıp uzun bir bekleyişin sonunda
              patlamak en pahalı hata bildirim biçimidir. */}
          <TouchableOpacity
            style={[styles.testButton, busy === "test" && styles.testButtonOff]}
            disabled={busy === "test"}
            onPress={() => void runConnectionTest()}
            activeOpacity={0.85}
          >
            <Text style={styles.testButtonText}>
              {busy === "test" ? "Sınanıyor…" : "🔌 Bağlantıyı sına"}
            </Text>
          </TouchableOpacity>
          {test && (
            <View style={[styles.testResult, test.ok ? styles.testOk : styles.testBad]}>
              <Text style={styles.testTitle}>
                {test.ok ? "✓ " : "✕ "}
                {test.title}
              </Text>
              <Text style={styles.testDetail}>{test.detail}</Text>
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

          {/* SES: "ChatGPT akıcı konuşuyor, bizimki robot" şikâyetinin cevabı.
              Onlarda ses sunucudaki ses modelinden gelir; burada aynı modele
              gidiliyor. Telefon sesi yedek olarak duruyor. */}
          <Text style={[styles.label, { marginTop: 20 }]}>Konuşma Odası beyni</Text>
          <Text style={styles.hint}>
            Konuşmada pahalı olan beyin değil ses. Beyni DeepSeek'ten almak oturumu
            ≈ 8 TL'ye indirir; ders ekranları yine yukarıdaki sağlayıcıyı kullanır.
          </Text>
          <View style={styles.chips}>
            {(["deepseek", "active"] as const).map((b) => (
              <TouchableOpacity
                key={b}
                style={[styles.chip, voice.brain === b && styles.chipOn]}
                onPress={() => setVoice({ ...voice, brain: b })}
              >
                <Text style={[styles.chipText, voice.brain === b && styles.chipTextOn]}>
                  {b === "deepseek" ? "🪙 DeepSeek (ucuz)" : `🧠 ${meta.label}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {voice.brain === "deepseek" && !(keys.deepseek ?? "").trim() && (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                DeepSeek anahtarı yok — oda şimdilik {meta.label} ile konuşur. Anahtar için
                yukarıdan DeepSeek'i seçip yapıştır, sonra sağlayıcını geri al.
              </Text>
            </View>
          )}

          <Text style={[styles.label, { marginTop: 20 }]}>Hocanın sesi</Text>
          <View style={styles.chips}>
            {(["device", "openai"] as const).map((prov) => (
              <TouchableOpacity
                key={prov}
                style={[styles.chip, voice.provider === prov && styles.chipOn]}
                onPress={() => setVoice({ ...voice, provider: prov })}
              >
                <Text style={[styles.chipText, voice.provider === prov && styles.chipTextOn]}>
                  {prov === "device" ? "📱 Telefon sesi" : "✨ OpenAI ses modeli"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {voice.provider === "openai" && (
            <>
              {!voiceReady && (
                <View style={styles.warnBox}>
                  <Text style={styles.warnText}>
                    Ses modeli için OpenAI anahtarı gerekir (sohbet için Claude kullanmaya devam
                    edebilirsin; anahtar yalnız ses için). Yukarıdan OpenAI'ı seçip anahtarı
                    yapıştır, sonra sağlayıcını geri değiştir. Anahtar girilene kadar telefon
                    sesi kullanılır.
                  </Text>
                </View>
              )}
              <View style={styles.chips}>
                {OPENAI_VOICES.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.chip, voice.voiceId === v.id && styles.chipOn]}
                    onPress={() => setVoice({ ...voice, voiceId: v.id })}
                  >
                    <Text style={[styles.chipText, voice.voiceId === v.id && styles.chipTextOn]}>
                      {v.label} · {v.note}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.row, voice.transcribe && styles.rowActive]}
                onPress={() => setVoice({ ...voice, transcribe: !voice.transcribe })}
                activeOpacity={0.85}
              >
                <View style={[styles.radio, voice.transcribe && styles.radioOn]}>
                  {voice.transcribe && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Senin sesini de ses modeli çözsün</Text>
                  <Text style={styles.rowMeta}>
                    Arapça ve Farsçada telefonun tanımasından çok daha iyi. Konuşma Odası'nda
                    canlı ara metin yerine sustuğunda çözülür. ≈ 0,15 TL/dk.
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.testButton, (!voiceReady || previewing) && styles.testButtonOff]}
                disabled={!voiceReady || previewing}
                onPress={() => void tryVoice()}
                activeOpacity={0.85}
              >
                <Text style={styles.testButtonText}>
                  {previewing ? "Sentezleniyor…" : "🔊 Sesi dene"}
                </Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                Hoca ≈ 0,75 TL/dk konuşma. Harcama tavanına dahildir.
              </Text>
            </>
          )}

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

            {/* Otomatik anlık görüntü: uygulama kendi verisini bozarsa geri
                dönülecek nokta. Telefon kaybolursa BUNLAR DA GİDER — durum
                metni bunu açıkça söylüyor, yanlış güven vermesin. */}
            {!!snapInfo && (
              <View style={styles.snapBox}>
                <Text style={styles.snapText}>{snapInfo}</Text>
                <TouchableOpacity onPress={() => void shareSnapshot()} activeOpacity={0.85}>
                  <Text style={styles.snapLink}>Son anlık görüntüyü dışarı al ›</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Stiller paletin FONKSİYONU: karanlık modda renkler değişir ama yapı
 * (ölçü, yerleşim, yazı tipi) aynı kalır. Parametre adı bilinçli olarak
 * `colors` — gövdedeki bütün jetonlar olduğu gibi çalışsın diye.
 */
function makeStyles(colors: Palette) {
  return StyleSheet.create({
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
  snapBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  snapText: { fontSize: 12, lineHeight: 18, color: colors.inkFaint },
  snapLink: { fontSize: 13, fontWeight: "800", color: colors.accent, marginTop: 8 },
  testButton: {
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 12,
    alignItems: "center",
  },
  testButtonOff: { opacity: 0.5 },
  testButtonText: { color: colors.accent, fontWeight: "800", fontSize: 14 },
  testResult: { marginTop: 10, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  testOk: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  testBad: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  testTitle: { fontWeight: "800", fontSize: 14, color: colors.ink },
  testDetail: { fontSize: 13, lineHeight: 19, color: colors.inkSoft, marginTop: 4 },
  warnBox: {
    backgroundColor: colors.goldSoft,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  warnText: { fontSize: 12.5, color: colors.ink, lineHeight: 19 },
  /** Tavan DOLDUĞUNDA uyarı sarısı yetmez: bu bir engel, uyarı değil. */
  blockBox: { backgroundColor: colors.dangerSoft },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: "transparent" },
  chipTextOn: { color: colors.accentDark, fontWeight: "800" },
  budgetRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  budgetField: { flex: 1 },
  budgetLabel: { fontSize: 11.5, color: colors.inkSoft, fontWeight: "700", marginBottom: 6 },
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
}
