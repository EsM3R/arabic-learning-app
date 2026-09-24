import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LANGUAGE_LIST, LANGUAGE_PACKS, LanguageId } from "../languages";
import { PROVIDER_LIST, ProviderId } from "../providers";
import { colors, radius, shadow, shadowLift } from "../theme";
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

export default function SetupScreen({ onDone }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [languageId, setLanguageId] = useState<LanguageId>("ar");
  // Varsayılan beyin DeepSeek: en ucuz sağlayıcı. Ses ayrıca OpenAI'dan.
  const [providerId, setProviderId] = useState<ProviderId>("deepseek");
  /** Ses için Gemini anahtarı — isteğe bağlı (ücretsiz kota); beyin Gemini ise zaten var. */
  const [voiceKey, setVoiceKey] = useState("");

  const pack = LANGUAGE_PACKS[languageId];
  const provider =
    PROVIDER_LIST.find((p) => p.meta.id === providerId) ?? PROVIDER_LIST[0];

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
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {step === 0 && <Welcome />}
          {step === 1 && <HowItWorks />}
          {step === 2 && (
            <PickLanguage selected={languageId} onSelect={setLanguageId} />
          )}
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

        <View style={styles.footer}>
          <View style={styles.dots}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
            ))}
          </View>
          <View style={styles.navRow}>
            {step > 0 ? (
              <TouchableOpacity style={styles.back} onPress={() => setStep(step - 1)}>
                <Text style={styles.backText}>Geri</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <TouchableOpacity onPress={next} activeOpacity={0.85} style={{ flex: 2 }}>
              <LinearGradient
                colors={[colors.accent, colors.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.nextButton}
              >
                <Text style={styles.nextText}>
                  {step === STEPS - 1 ? `Başlayalım ${pack.flag}` : "Devam"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------------------------------------------------------------- adımlar */

function Welcome() {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View>
      <LinearGradient
        colors={[colors.deep, colors.deepAlt]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.bubbles}>
          <View style={styles.bubbleOutline} />
          <View style={styles.bubbleFilled}>
            <View style={styles.bubbleDots}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.bubbleDot} />
              ))}
            </View>
          </View>
        </View>
        <Text style={styles.heroTitle}>Lisan Hocası</Text>
        <Text style={styles.heroSub}>
          Sana özel bir yapay zekâ dil öğretmeni. Sıfırdan başlayıp uzmanlığa kadar,
          kendi hızında.
        </Text>
      </LinearGradient>

      <View style={styles.pad}>
        <Point
          icon="🗣️"
          title="Konuşma ve okuma, ayrı ayrı"
          text="İki parkur birlikte yürür: gerçek hayatta konuşmak ve profesyonel seviyede okumak. Seviyeler bağımsız ölçülür."
        />
        <Point
          icon="🎓"
          title="Bir hoca, bir ders kitabı değil"
          text="Karşındaki bir alıştırma listesi değil; seninle konuşan, hatanı düzelten, seni tanıyan bir öğretmen."
        />
        <Point
          icon="🌍"
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
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.pad}>
      <Text style={styles.stepTitle}>Nasıl çalışır?</Text>
      <Text style={styles.stepLead}>
        Hocan sadece sohbet etmiyor — arka planda senin için defter tutuyor.
      </Text>
      <Step
        n="1"
        title="Sıfırdan başlar"
        text="Seviye sınavı yok: A0'dan başlarsın, hocan seni derslerde tanıdıkça seviyeni kendisi yükseltir."
      />
      <Step
        n="2"
        title="Sana özel müfredat kurar"
        text="Zayıf yönlerine ve gerçek hatalarına göre iki parkurlu bir ders planı hazırlar."
      />
      <Step
        n="3"
        title="Ders yaptıkça defterini tutar"
        text="Bilmediğin kelimeleri kaydeder, hatalarını not eder, aralıklı tekrar takvimini kendisi kurar."
      />
      <Step
        n="4"
        title="Seviye atlatır"
        text="Müfredatı bitirdiğinde performansına bakar, hazırsan bir üst seviyenin planını kurar."
      />
      <View style={styles.noteBox}>
        <Text style={styles.noteText}>
          Her şey telefonunda kalır. Dersler senin API anahtarınla, doğrudan cihazından
          çalışır — arada başka bir sunucu yok.
        </Text>
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

function PickLanguage({
  selected,
  onSelect,
}: {
  selected: LanguageId;
  onSelect: (id: LanguageId) => void;
}) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.pad}>
      <Text style={styles.stepTitle}>Hangi dili öğreneceksin?</Text>
      <Text style={styles.stepLead}>
        Diğerlerini sonra panelden ekleyebilirsin — her dilin ilerlemesi ayrı tutulur.
      </Text>
      {LANGUAGE_LIST.map((l) => {
        const active = l.id === selected;
        return (
          <TouchableOpacity
            key={l.id}
            style={[styles.langCard, active && styles.langCardOn]}
            onPress={() => onSelect(l.id)}
            activeOpacity={0.85}
          >
            <Text style={styles.langFlag}>{l.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.langName, active && { color: colors.accentDark }]}>
                {l.label}
              </Text>
              <Text style={styles.langTeacher}>
                {l.teacherName} · {l.tracks.konusma.short} + {l.tracks.okuma.short}
              </Text>
            </View>
            <View style={[styles.radio, active && styles.radioOn]}>
              {active && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        );
      })}
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
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const provider =
    PROVIDER_LIST.find((p) => p.meta.id === providerId) ?? PROVIDER_LIST[0];
  return (
    <View style={styles.pad}>
      <Text style={styles.stepTitle}>Son adım</Text>
      <Text style={styles.stepLead}>
        {pack.teacherName} sana adınla hitap edecek ve derslerini senin anahtarınla
        yapacak.
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
              style={[styles.provChip, active && styles.provChipOn]}
              onPress={() => setProviderId(p.meta.id)}
            >
              <Text style={[styles.provText, active && { color: colors.accent }]}>
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
        placeholder={
          provider.meta.keyPrefix ? `${provider.meta.keyPrefix}…` : "anahtarı yapıştır"
        }
        placeholderTextColor={colors.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Text style={styles.hint}>
        Anahtar almak için: {provider.meta.keyHint}
        {"\n"}Anahtar yalnızca bu cihazda saklanır. Sonradan panelden
        değiştirebilirsin.
      </Text>

      {providerId !== "gemini" && (
        <>
          <Text style={[styles.label, { marginTop: 16 }]}>
            Hocanın sesi için Gemini anahtarı (isteğe bağlı, ücretsiz)
          </Text>
          <TextInput
            style={styles.input}
            value={voiceKey}
            onChangeText={setVoiceKey}
            placeholder="Gemini anahtarı (boş bırakırsan telefon sesi)"
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.hint}>
            Konuşma Odası'nda hoca gerçek bir ses modeliyle konuşur ve seni o tanır.
            Gemini'nin ücretsiz kotası bunun için yeter; anahtar aistudio.google.com'dan.
            Boşsa telefonun sesi kullanılır; sonradan Ayarlar'dan ekleyebilirsin.
          </Text>
        </>
      )}
    </View>
  );
}

function Point({ icon, title, text }: { icon: string; title: string; text: string }) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.point}>
      <Text style={styles.pointIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.pointTitle}>{title}</Text>
        <Text style={styles.pointText}>{text}</Text>
      </View>
    </View>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.point}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pointTitle}>{title}</Text>
        <Text style={styles.pointText}>{text}</Text>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- stiller */

/**
 * Stiller paletin FONKSİYONU: karanlık modda renkler değişir ama yapı aynı
 * kalır. Parametre adı bilinçli olarak `colors` — gövdedeki jetonlar
 * olduğu gibi çalışsın diye.
 */
function makeStyles(colors: Palette) {
  return StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 24 },
  pad: { padding: 24, paddingTop: 64 },

  hero: {
    paddingTop: 80,
    paddingBottom: 34,
    paddingHorizontal: 26,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  bubbles: { height: 78, marginBottom: 14 },
  bubbleOutline: {
    position: "absolute",
    right: 4,
    top: 0,
    width: 62,
    height: 44,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: colors.onDeep,
  },
  bubbleFilled: {
    position: "absolute",
    left: 0,
    top: 26,
    width: 78,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.goldDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleDots: { flexDirection: "row", gap: 7 },
  bubbleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.deep },
  heroTitle: { fontSize: 32, fontWeight: "800", color: colors.onDeep, letterSpacing: -0.5 },
  heroSub: { fontSize: 15, color: colors.onDeepSoft, lineHeight: 23, marginTop: 8 },

  stepTitle: { fontSize: 25, fontWeight: "800", color: colors.ink, letterSpacing: -0.4 },
  stepLead: { fontSize: 14.5, color: colors.inkSoft, lineHeight: 22, marginTop: 8, marginBottom: 22 },

  point: { flexDirection: "row", gap: 14, marginBottom: 20, alignItems: "flex-start" },
  pointIcon: { fontSize: 24, width: 30, textAlign: "center" },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: colors.accentDark, fontWeight: "800", fontSize: 14 },
  pointTitle: { fontSize: 15.5, fontWeight: "800", color: colors.ink },
  pointText: { fontSize: 13.5, color: colors.inkSoft, lineHeight: 20, marginTop: 3 },

  noteBox: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 4,
  },
  noteText: { fontSize: 12.5, color: colors.accentDark, lineHeight: 19 },

  langCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 11,
    ...shadow,
  },
  langCardOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  langFlag: { fontSize: 30 },
  langName: { fontSize: 16.5, fontWeight: "800", color: colors.ink },
  langTeacher: { fontSize: 12.5, color: colors.inkSoft, marginTop: 2 },
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
  provRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  provChip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.card,
    paddingHorizontal: 13,
    paddingVertical: 9,
    alignItems: "center",
  },
  provChipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  provText: { fontSize: 13, fontWeight: "700", color: colors.inkSoft },
  provBeta: { fontSize: 9, fontWeight: "800", color: colors.gold, marginTop: 1 },
  hint: { fontSize: 12, color: colors.inkSoft, lineHeight: 18 },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 7, marginBottom: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent, width: 20 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { flex: 1, paddingVertical: 16, alignItems: "center" },
  backText: { color: colors.inkSoft, fontSize: 15, fontWeight: "700" },
  nextButton: {
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    ...shadowLift,
  },
  nextText: { color: "#FFFFFF", fontSize: 16.5, fontWeight: "800" },
});
}
