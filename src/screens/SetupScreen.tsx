import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Icon from "../components/Icon";
import type { IconName } from "../components/Icon";
import { Badge, Button, IconTile, PressableScale, StarPattern, Txt, useInsets } from "../components/kit";
import { LANGUAGE_LIST, LANGUAGE_PACKS, LanguageId } from "../languages";
import { PROVIDER_LIST, ProviderId } from "../providers";
import { arabicText, shadow } from "../theme";
import type { Palette } from "../theme";
import { useTheme } from "../useTheme";

interface Props {
  onDone: (
    name: string,
    apiKey: string,
    languageId: LanguageId,
    providerId: ProviderId,
    voiceKey?: string
  ) => void;
}

const STEPS = 4;

/**
 * İLK AÇILIŞ — dört adım: tanışma, nasıl çalışır, dil, bağlantı.
 * İlk izlenim burada oluşuyor: koyu desenli karşılama, sade adımlar.
 */
export default function SetupScreen({ onDone }: Props) {
  const c = useTheme();
  const styles = makeStyles(c);
  const insets = useInsets();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [languageId, setLanguageId] = useState<LanguageId>("ar");
  // Varsayılan beyin DeepSeek: en ucuz sağlayıcı. Ses ayrıca Gemini'den.
  const [providerId, setProviderId] = useState<ProviderId>("deepseek");
  /** Ses için Gemini anahtarı — isteğe bağlı (ücretsiz kota); beyin Gemini ise zaten var. */
  const [voiceKey, setVoiceKey] = useState("");

  const pack = LANGUAGE_PACKS[languageId];
  const provider = PROVIDER_LIST.find((p) => p.meta.id === providerId) ?? PROVIDER_LIST[0];

  const finish = () => {
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
    onDone(name.trim(), key, languageId, providerId, voiceKey.trim() || undefined);
  };

  const next = () => (step === STEPS - 1 ? finish() : setStep(step + 1));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={styles.container}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
          {step === 0 && <Welcome />}
          {step === 1 && <HowItWorks />}
          {step === 2 && <PickLanguage selected={languageId} onSelect={setLanguageId} />}
          {step === 3 && (
            <Connect
              name={name}
              setName={setName}
              apiKey={apiKey}
              setApiKey={setApiKey}
              providerId={providerId}
              setProviderId={setProviderId}
              voiceKey={voiceKey}
              setVoiceKey={setVoiceKey}
              pack={pack}
            />
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.dots}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {step > 0 ? (
              <Button variant="ghost" label="Geri" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />
            ) : null}
            <Button
              icon={step === STEPS - 1 ? "check" : "arrowRight"}
              label={step === STEPS - 1 ? "Başlayalım" : "Devam"}
              onPress={next}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------------------------------------------------------------- adımlar */

function Welcome() {
  const c = useTheme();
  const styles = makeStyles(c);
  const insets = useInsets();
  return (
    <View>
      <View style={[styles.hero, { paddingTop: insets.top + 48 }]}>
        <StarPattern width="100%" height="100%" color={c.goldDeep} opacity={0.14} />
        <View style={styles.seal}>
          <Text style={[arabicText(40, true), { color: c.onGold, marginTop: 8, transform: [{ rotate: "-45deg" }] }]}>ل</Text>
        </View>
        <Txt variant="display" color={c.onDeep} style={{ marginTop: 20 }}>
          Lisan Hocası
        </Txt>
        <Txt variant="body" color={c.onDeepSoft} style={{ marginTop: 8 }}>
          Sana özel bir yapay zekâ dil öğretmeni. Sıfırdan başlayıp uzmanlığa kadar, kendi hızında.
        </Txt>
      </View>

      <View style={styles.pad}>
        <Point
          icon="mic"
          title="Konuşma ve okuma, ayrı ayrı"
          text="İki parkur birlikte yürür: gerçek hayatta konuşmak ve profesyonel seviyede okumak. Seviyeler bağımsız ölçülür."
        />
        <Point
          icon="user"
          title="Bir hoca, bir ders kitabı değil"
          text="Karşındaki bir alıştırma listesi değil; seninle konuşan, hatanı düzelten, seni tanıyan bir öğretmen."
        />
        <Point
          icon="globe"
          title={`${LANGUAGE_LIST.length} dil, tek uygulama`}
          // Liste elle yazılmıyor: yeni bir dil paketi eklendiğinde bu cümle
          // kendiliğinden doğru kalsın.
          text={`${languageNames()}. Her dilin kendi hocası, müfredatı ve defteri var; aynı anda birden fazlasını çalışabilirsin.`}
        />
      </View>
    </View>
  );
}

function HowItWorks() {
  const c = useTheme();
  const styles = makeStyles(c);
  const insets = useInsets();
  return (
    <View style={[styles.pad, { paddingTop: insets.top + 28 }]}>
      <Txt variant="title1">Nasıl çalışır?</Txt>
      <Txt variant="body" color={c.inkSoft} style={{ marginTop: 6, marginBottom: 20 }}>
        Hocan sadece sohbet etmiyor — arka planda senin için defter tutuyor.
      </Txt>
      <Step n="1" title="Sıfırdan başlar" text="Seviye sınavı yok: A0'dan başlarsın, hocan seni derslerde tanıdıkça seviyeni kendisi yükseltir." />
      <Step n="2" title="Sana özel müfredat kurar" text="Zayıf yönlerine ve gerçek hatalarına göre iki parkurlu bir ders planı hazırlar." />
      <Step n="3" title="Ders yaptıkça defterini tutar" text="Bilmediğin kelimeleri kaydeder, hatalarını not eder, aralıklı tekrar takvimini kendisi kurar." />
      <Step n="4" title="Seviye atlatır" text="Müfredatı bitirdiğinde performansına bakar, hazırsan bir üst seviyenin planını kurar." />
      <View style={styles.noteBox}>
        <Icon name="key" size={18} color={c.accentDark} />
        <Txt variant="callout" style={{ flex: 1 }}>
          Her şey telefonunda kalır. Dersler senin API anahtarınla, doğrudan cihazından çalışır — arada başka
          bir sunucu yok.
        </Txt>
      </View>
    </View>
  );
}

/** "Arapça, İngilizce, … ve Farsça" — paketlerden türetilir. */
function languageNames(): string {
  const names = LANGUAGE_LIST.map((l) => l.label);
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} ve ${names[names.length - 1]}`;
}

function PickLanguage({ selected, onSelect }: { selected: LanguageId; onSelect: (id: LanguageId) => void }) {
  const c = useTheme();
  const styles = makeStyles(c);
  const insets = useInsets();
  return (
    <View style={[styles.pad, { paddingTop: insets.top + 28 }]}>
      <Txt variant="title1">Hangi dili öğreneceksin?</Txt>
      <Txt variant="body" color={c.inkSoft} style={{ marginTop: 6, marginBottom: 18 }}>
        Diğerlerini sonra Profil'den ekleyebilirsin — her dilin ilerlemesi ayrı tutulur.
      </Txt>
      <View style={{ gap: 10 }}>
        {LANGUAGE_LIST.map((l) => {
          const active = l.id === selected;
          const rtl = l.script === "arabic" || l.script === "persian";
          return (
            <PressableScale key={l.id} onPress={() => onSelect(l.id)} accessibilityLabel={l.label}>
              <View style={[styles.langCard, active && styles.langCardOn]}>
                <View style={[styles.langGlyph, active && { backgroundColor: c.accent }]}>
                  <Text
                    style={[
                      rtl ? arabicText(20) : { fontFamily: "Fraunces", fontWeight: "600", fontSize: 19 },
                      { color: active ? "#FFFFFF" : c.accentDark, marginTop: rtl ? 6 : 0 },
                    ]}
                  >
                    {l.avatarLetter}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong" color={active ? c.accentDark : c.ink}>
                    {l.label}
                  </Txt>
                  <Txt variant="caption" color={c.inkSoft}>
                    {l.teacherName} · {l.tracks.konusma.short} + {l.tracks.okuma.short}
                  </Txt>
                </View>
                <View style={[styles.radio, active && styles.radioOn]}>{active && <View style={styles.radioDot} />}</View>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function Connect({
  name,
  setName,
  apiKey,
  setApiKey,
  providerId,
  setProviderId,
  voiceKey,
  setVoiceKey,
  pack,
}: {
  name: string;
  setName: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  providerId: ProviderId;
  setProviderId: (v: ProviderId) => void;
  voiceKey: string;
  setVoiceKey: (v: string) => void;
  pack: (typeof LANGUAGE_PACKS)[LanguageId];
}) {
  const c = useTheme();
  const styles = makeStyles(c);
  const insets = useInsets();
  const provider = PROVIDER_LIST.find((p) => p.meta.id === providerId) ?? PROVIDER_LIST[0];
  return (
    <View style={[styles.pad, { paddingTop: insets.top + 28 }]}>
      <Txt variant="title1">Son adım</Txt>
      <Txt variant="body" color={c.inkSoft} style={{ marginTop: 6, marginBottom: 12 }}>
        {pack.teacherName} sana adınla hitap edecek ve derslerini senin anahtarınla yapacak.
      </Txt>

      <Txt variant="overline" color={c.inkSoft} style={styles.label}>
        ADIN
      </Txt>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="örn. Mehmet" placeholderTextColor={c.inkFaint} />

      <Txt variant="overline" color={c.inkSoft} style={styles.label}>
        MODEL SAĞLAYICISI
      </Txt>
      <View style={styles.provRow}>
        {PROVIDER_LIST.map((p) => {
          const active = p.meta.id === providerId;
          return (
            <PressableScale
              key={p.meta.id}
              onPress={() => setProviderId(p.meta.id)}
              accessibilityLabel={p.meta.label}
              style={[styles.provChip, active && styles.provChipOn]}
            >
              <Txt variant="caption" color={active ? "#FFFFFF" : c.ink} style={{ fontWeight: "800" }}>
                {p.meta.label}
              </Txt>
              {p.meta.experimental && <Badge text="denenmedi" tone="gold" />}
            </PressableScale>
          );
        })}
      </View>
      <Txt variant="caption" color={c.inkSoft} style={{ marginTop: 8 }}>
        {provider.meta.costNote}
      </Txt>

      <Txt variant="overline" color={c.inkSoft} style={styles.label}>
        {`${provider.meta.label} API ANAHTARI`.toLocaleUpperCase("tr-TR")}
      </Txt>
      <TextInput
        style={styles.input}
        value={apiKey}
        onChangeText={setApiKey}
        placeholder={provider.meta.keyPrefix ? `${provider.meta.keyPrefix}…` : "anahtarı yapıştır"}
        placeholderTextColor={c.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Txt variant="caption" color={c.inkSoft} style={{ marginTop: 8, lineHeight: 18 }}>
        Anahtar almak için: {provider.meta.keyHint}
        {"\n"}Anahtar yalnızca bu cihazda saklanır. Sonradan Ayarlar'dan değiştirebilirsin.
      </Txt>

      {providerId !== "gemini" && (
        <>
          <Txt variant="overline" color={c.inkSoft} style={styles.label}>
            HOCANIN SESİ İÇİN GEMİNİ ANAHTARI (İSTEĞE BAĞLI)
          </Txt>
          <TextInput
            style={styles.input}
            value={voiceKey}
            onChangeText={setVoiceKey}
            placeholder="Gemini anahtarı (boş bırakırsan telefon sesi)"
            placeholderTextColor={c.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Txt variant="caption" color={c.inkSoft} style={{ marginTop: 8, lineHeight: 18 }}>
            Hoca gerçek bir ses modeliyle konuşur ve seni o tanır. Gemini'nin ücretsiz kotası bunun için yeter;
            anahtar aistudio.google.com'dan. Boşsa telefonun sesi kullanılır; sonradan Ayarlar'dan ekleyebilirsin.
          </Txt>
        </>
      )}
    </View>
  );
}

function Point({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 14, marginBottom: 18 }}>
      <IconTile icon={icon} tone="accent" size={42} />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="headline">{title}</Txt>
        <Txt variant="callout" color={c.inkSoft}>
          {text}
        </Txt>
      </View>
    </View>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 14, marginBottom: 18 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.goldSoft, alignItems: "center", justifyContent: "center" }}>
        <Txt variant="headline" color={c.gold}>
          {n}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="headline">{title}</Txt>
        <Txt variant="callout" color={c.inkSoft}>
          {text}
        </Txt>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- stiller */

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    hero: {
      backgroundColor: colors.deep,
      paddingHorizontal: 26,
      paddingBottom: 36,
      borderBottomLeftRadius: 32,
      borderBottomRightRadius: 32,
      overflow: "hidden",
    },
    seal: {
      width: 72,
      height: 72,
      borderRadius: 22,
      backgroundColor: colors.goldDeep,
      alignItems: "center",
      justifyContent: "center",
      transform: [{ rotate: "45deg" }],
    },
    pad: { paddingHorizontal: 22, paddingTop: 26 },
    noteBox: {
      flexDirection: "row",
      gap: 10,
      backgroundColor: colors.accentSoft,
      borderRadius: 16,
      padding: 14,
      marginTop: 6,
    },
    langCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 14,
      ...shadow,
    },
    langCardOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    langGlyph: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.inkFaint,
      alignItems: "center",
      justifyContent: "center",
    },
    radioOn: { borderColor: colors.accent },
    radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.accent },
    label: { marginTop: 20, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.card,
      paddingHorizontal: 15,
      paddingVertical: 14,
      fontFamily: "Manrope",
      fontSize: 15.5,
      color: colors.ink,
    },
    provRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    provChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 38,
      paddingHorizontal: 13,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    provChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    footer: { paddingHorizontal: 20, paddingTop: 12, gap: 14, backgroundColor: colors.bg },
    dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
    dotOn: { width: 22, backgroundColor: colors.accent },
  });
}
