import React, { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from "react-native";
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
import Icon from "../components/Icon";
import { Badge, Button, Chip, ListGroup, PressableScale, SectionLabel, StarPattern, Surface, Txt } from "../components/kit";
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
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";
import { Profile } from "../types";
import { formatTry, usageSummary, UsageSummary } from "../usage";
import { USD_TRY } from "../pricing";
import { budgetStatus, DEFAULT_BUDGET, normalizeLimits } from "../budget";
import { backendFor, previewVoice } from "../neuralVoice";
import { normalizeVoice, voicesFor } from "../voice";
import type { VoiceProvider, VoiceSettings } from "../voice";
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
  // Sınama EKRANDAKİ taslak anahtarlarla: yeni yapıştırılmış, kaydedilmemiş olabilir.
  const voiceBackend = backendFor(voice, { openai: keys.openai, gemini: keys.gemini });
  const voiceReady = voiceBackend !== null;
  const voiceProviderLabel = voice.provider === "gemini" ? "Gemini" : "OpenAI";
  const [previewing, setPreviewing] = useState(false);
  const tryVoice = async () => {
    if (!voiceBackend) return;
    setPreviewing(true);
    try {
      await previewVoice(voiceBackend, getActivePack().greeting);
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

  const warn = (text: string, blocked = false) => (
    <View style={[styles.warnBox, blocked && { backgroundColor: colors.dangerSoft }]}>
      <Icon name="alert" size={16} color={blocked ? colors.danger : colors.gold} />
      <Txt variant="caption" color={colors.ink} style={{ flex: 1, lineHeight: 18 }}>
        {text}
      </Txt>
    </View>
  );

  return (
    // Edge-to-edge modda Android pencereyi klavye için küçültmediğinden
    // behavior her iki platformda da verilmeli.
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.container}>
        <Header
          title="Ayarlar"
          subtitle={`Aktif: ${PROVIDER_LIST.find((p) => p.meta.id === initial)?.meta.label ?? "—"}`}
          onBack={onBack}
        />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {usage && (
            <View style={styles.usageCard}>
              <StarPattern width="100%" height="100%" color={colors.goldDeep} opacity={0.08} />
              <Txt variant="overline" color={colors.goldDeep}>
                TAHMİNİ HARCAMA
              </Txt>
              <View style={styles.usageRow}>
                <View>
                  <Txt variant="title2" color={colors.onDeep}>
                    {formatTry(usage.todayUsd)}
                  </Txt>
                  <Txt variant="caption" color={colors.onDeepSoft}>
                    bugün · {usage.todayCalls} istek
                  </Txt>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Txt variant="title2" color={colors.onDeep}>
                    {formatTry(usage.monthUsd)}
                  </Txt>
                  <Txt variant="caption" color={colors.onDeepSoft}>
                    bu ay · {usage.monthCalls} istek
                  </Txt>
                </View>
              </View>
              <Txt variant="caption" color={colors.onDeepSoft} style={{ fontSize: 11, lineHeight: 15 }}>
                Token sayılarından hesaplanan tahmindir; kesin tutar sağlayıcının faturasıdır. {buildLabel()}
              </Txt>
            </View>
          )}

          {/* Sert tavan: göstermek koruma değil, DURDURMAK korumadır. */}
          <SectionLabel title="Harcama tavanı" style={styles.section} />
          <Surface style={{ gap: 10 }}>
            <Txt variant="caption" color={colors.inkSoft}>
              Tavan dolunca uygulama yeni istek göndermez — ders, okuma metni, telaffuz seti, hepsi durur. 0
              yazarsan o sınır kapanır (önerilmez). Rakamlar tahmindir; kesin tutar sağlayıcının faturasıdır.
            </Txt>
            <View style={styles.budgetRow}>
              <View style={styles.budgetField}>
                <Txt variant="caption" color={colors.inkSoft} style={{ marginBottom: 6 }}>
                  Günlük (TL)
                </Txt>
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
                <Txt variant="caption" color={colors.inkSoft} style={{ marginBottom: 6 }}>
                  Aylık (TL)
                </Txt>
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
            {budget && budget.state !== "ok" && warn(budget.message ?? "", budget.state === "blocked")}
          </Surface>

          <SectionLabel title="Sağlayıcı" style={styles.section} />
          <ListGroup>
            {PROVIDER_LIST.map((p) => {
              const active = p.meta.id === selected;
              const hasKey = (keys[p.meta.id] ?? "").trim().length > 0;
              return (
                <PressableScale key={p.meta.id} onPress={() => setSelected(p.meta.id)} scaleTo={0.985} accessibilityLabel={p.meta.label}>
                  <View style={[styles.providerRow, active && { backgroundColor: colors.accentSoft }]}>
                    <View style={[styles.radio, active && styles.radioOn]}>{active && <View style={styles.radioDot} />}</View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                        <Txt variant="bodyStrong">{p.meta.label}</Txt>
                        {p.meta.experimental && <Badge text="DENENMEDİ" tone="gold" />}
                      </View>
                      <Txt variant="caption" color={colors.inkSoft}>
                        {p.meta.costNote}
                      </Txt>
                    </View>
                    {hasKey && <Icon name="key" size={18} color={colors.accentDark} />}
                  </View>
                </PressableScale>
              );
            })}
          </ListGroup>

          {meta.experimental &&
            warn(
              "Bu sağlayıcı canlı API'ye karşı denenmedi. Aşağıdaki düğmeyle kendin sınayabilirsin; çalışmazsa Anthropic'e geri dön — dersin, kelime defterin ve ilerlemen etkilenmez."
            )}

          {/* Bağlantı sınaması: denenmemiş kod yolunun hatası ders ortasında
              değil BURADA çıksın. */}
          <Button
            variant="secondary"
            size="md"
            icon="zap"
            label={busy === "test" ? "Sınanıyor…" : "Bağlantıyı sına"}
            disabled={busy === "test"}
            onPress={() => void runConnectionTest()}
            style={{ marginTop: 12 }}
          />
          {test && (
            <View style={[styles.testResult, { backgroundColor: test.ok ? colors.accentSoft : colors.dangerSoft }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name={test.ok ? "check" : "close"} size={16} color={test.ok ? colors.accentDark : colors.danger} strokeWidth={2.6} />
                <Txt variant="bodyStrong">{test.title}</Txt>
              </View>
              <Txt variant="caption" color={colors.inkSoft}>
                {test.detail}
              </Txt>
            </View>
          )}

          <SectionLabel title="Model" style={styles.section} />
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
              <Chip key={m} label={m} selected={(models[selected] ?? "") === m} onPress={() => setModels({ ...models, [selected]: m })} />
            ))}
          </View>
          <Txt variant="caption" color={colors.inkSoft} style={styles.hint}>
            Model adları sağlayıcı tarafında değişebilir; çalışmazsa güncel adı sağlayıcının belgelerinden alıp
            buraya yazabilirsin.
          </Txt>

          <SectionLabel title="API anahtarı" style={styles.section} />
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
          <Txt variant="caption" color={colors.inkSoft} style={styles.hint}>
            {meta.keyHint}
            {"\n"}Anahtarlar yalnızca bu cihazda saklanır; istekler doğrudan cihazından sağlayıcıya gider.
          </Txt>

          {/* SES: "ChatGPT akıcı konuşuyor, bizimki robot" şikâyetinin cevabı. */}
          <SectionLabel title="Konuşma Odası beyni" style={styles.section} />
          <Txt variant="caption" color={colors.inkSoft}>
            Konuşmada pahalı olan beyin değil ses. Beyni DeepSeek'ten almak oturumu ≈ 8 TL'ye indirir; ders
            ekranları yine yukarıdaki sağlayıcıyı kullanır.
          </Txt>
          <View style={styles.chips}>
            {(["deepseek", "active"] as const).map((b) => (
              <Chip
                key={b}
                icon={b === "deepseek" ? "wallet" : "sparkles"}
                label={b === "deepseek" ? "DeepSeek (ucuz)" : `Aktif · ${meta.label}`}
                selected={voice.brain === b}
                onPress={() => setVoice({ ...voice, brain: b })}
              />
            ))}
          </View>
          {voice.brain === "deepseek" &&
            !(keys.deepseek ?? "").trim() &&
            warn(
              `DeepSeek anahtarı yok — oda şimdilik ${meta.label} ile konuşur. Anahtar için yukarıdan DeepSeek'i seçip yapıştır, sonra sağlayıcını geri al.`
            )}

          <SectionLabel title="Hocanın sesi" style={styles.section} />
          <View style={[styles.chips, { marginTop: 0 }]}>
            {(["gemini", "openai", "device"] as VoiceProvider[]).map((prov) => (
              <Chip
                key={prov}
                icon={prov === "device" ? "volume" : "sparkles"}
                label={prov === "device" ? "Telefon sesi" : prov === "gemini" ? "Gemini (ücretsiz kota)" : "OpenAI"}
                selected={voice.provider === prov}
                onPress={() => setVoice(normalizeVoice({ ...voice, provider: prov, voiceId: undefined }))}
              />
            ))}
          </View>
          {voice.provider !== "device" && (
            <>
              {!voiceReady &&
                warn(
                  `Ses modeli için ${voiceProviderLabel} anahtarı gerekir (sohbet için başka sağlayıcı kullanmaya devam edebilirsin; anahtar yalnız ses için). Yukarıdan ${voiceProviderLabel}'ı seçip anahtarı yapıştır, sonra sağlayıcını geri değiştir. Anahtar girilene kadar telefon sesi kullanılır.`
                )}
              <View style={styles.chips}>
                {voicesFor(voice.provider).map((v) => (
                  <Chip key={v.id} label={`${v.label} · ${v.note}`} selected={voice.voiceId === v.id} onPress={() => setVoice({ ...voice, voiceId: v.id })} />
                ))}
              </View>
              <ListGroup style={{ marginTop: 12 }}>
                <PressableScale
                  onPress={() => setVoice({ ...voice, transcribe: !voice.transcribe })}
                  scaleTo={0.985}
                  accessibilityLabel="Senin sesini de ses modeli çözsün"
                >
                  <View style={styles.providerRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="bodyStrong">Senin sesini de ses modeli çözsün</Txt>
                      <Txt variant="caption" color={colors.inkSoft}>
                        Arapça ve Farsçada telefonun tanımasından çok daha iyi. Konuşma Odası'nda canlı ara metin
                        yerine sustuğunda çözülür.
                      </Txt>
                    </View>
                    <View style={[styles.toggle, voice.transcribe && styles.toggleOn]}>
                      <View style={[styles.knob, voice.transcribe && styles.knobOn]} />
                    </View>
                  </View>
                </PressableScale>
              </ListGroup>
              <Button
                variant="secondary"
                size="md"
                icon="volume"
                label={previewing ? "Sentezleniyor…" : "Sesi dene"}
                disabled={!voiceReady || previewing}
                onPress={() => void tryVoice()}
                style={{ marginTop: 12 }}
              />
              <Txt variant="caption" color={colors.inkSoft} style={styles.hint}>
                {voice.provider === "gemini"
                  ? "Gemini'nin ücretsiz kotasında ses için ödeme yok (kota aşılırsa istekler reddedilir, telefon sesi devreye girer). Sayaç yine de ücretli tarifeye göre tahmin yazar — tavan ihtiyatlı kalsın diye."
                  : "Hoca ≈ 0,75 TL/dk konuşma, tanıma ≈ 0,15 TL/dk. Harcama tavanına dahildir."}
              </Txt>
            </>
          )}

          <Button label="Kaydet" icon="check" onPress={save} style={{ marginTop: 26 }} />

          <SectionLabel title="Yedek" style={styles.section} />
          <Surface style={{ gap: 12 }}>
            <Txt variant="caption" color={colors.inkSoft} style={{ lineHeight: 18 }}>
              Kelime defterin, hata defterin, hocanın notları, müfredatın, sohbetlerin ve okuma metinlerin tek
              dosyaya çıkar. Dosyayı Drive'a, WhatsApp'ta kendine ya da e-postana at; yeni telefonda "Yedekten
              dön" ile hoca seni bıraktığın yerden tanır. API anahtarın yedeğe girmez.
            </Txt>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button
                variant="gold"
                size="md"
                icon="download"
                label={busy === "export" ? "Hazırlanıyor…" : "Yedek al"}
                onPress={() => void exportBackup()}
                disabled={busy !== null}
                style={{ flex: 1 }}
              />
              <Button
                variant="secondary"
                size="md"
                icon="upload"
                label={busy === "import" ? "Okunuyor…" : "Yedekten dön"}
                onPress={() => void importBackup()}
                disabled={busy !== null}
                style={{ flex: 1 }}
              />
            </View>

            {/* Otomatik anlık görüntü: telefon kaybolursa BUNLAR DA GİDER. */}
            {!!snapInfo && (
              <View style={styles.snapBox}>
                <Txt variant="caption" color={colors.inkFaint}>
                  {snapInfo}
                </Txt>
                <PressableScale onPress={() => void shareSnapshot()} accessibilityLabel="Son anlık görüntüyü dışarı al" haptic={false}>
                  <Txt variant="caption" color={colors.accentDark} style={{ fontWeight: "800", marginTop: 8 }}>
                    Son anlık görüntüyü dışarı al ›
                  </Txt>
                </PressableScale>
              </View>
            )}
          </Surface>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.bg },
    body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 48 },
    section: { marginTop: 24 },
    usageCard: { backgroundColor: colors.deep, borderRadius: 24, padding: 18, gap: 10, overflow: "hidden" },
    usageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    providerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
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
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
    toggle: { width: 46, height: 28, borderRadius: 14, backgroundColor: colors.line, padding: 3 },
    toggleOn: { backgroundColor: colors.accent },
    knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
    knobOn: { transform: [{ translateX: 18 }] },
    snapBox: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
    testResult: { marginTop: 10, padding: 12, borderRadius: 14, gap: 4 },
    warnBox: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: colors.goldSoft,
      borderRadius: 14,
      padding: 12,
      marginTop: 10,
    },
    budgetRow: { flexDirection: "row", gap: 12 },
    budgetField: { flex: 1 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.card,
      paddingHorizontal: 15,
      paddingVertical: 13,
      fontFamily: "Manrope",
      fontSize: 15,
      color: colors.ink,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    hint: { marginTop: 8, lineHeight: 18 },
  });
}
