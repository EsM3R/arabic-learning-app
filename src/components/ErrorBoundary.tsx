import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { buildLabel } from "../buildInfo";
import {
  describeError,
  ErrorEntry,
  installGlobalErrorHandler,
  reportError,
  subscribeErrors,
} from "../errorLog";
import { colors, radius, shadowLift } from "../theme";

interface Props {
  children: React.ReactNode;
}

interface State {
  entry: ErrorEntry | null;
}

/**
 * Release APK'da hata görünürlüğü.
 *
 * Expo Go kırmızı hata ekranı gösterir; bağımsız APK göstermez — uygulama
 * sessizce kapanır ve elde hiçbir bilgi kalmaz. Bu bileşen hem render
 * hatalarını (componentDidCatch) hem de ağaç dışındaki ölümcül hataları
 * (ErrorUtils) yakalayıp ekranda okunabilir/kopyalanabilir biçimde gösterir.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { entry: null };
  private unsubscribe?: () => void;

  static getDerivedStateFromError(error: unknown): State {
    const { message, stack } = describeError(error);
    return {
      entry: {
        message,
        stack,
        context: "ekran çizilirken",
        fatal: true,
        at: new Date().toISOString(),
      },
    };
  }

  componentDidMount(): void {
    installGlobalErrorHandler();
    this.unsubscribe = subscribeErrors((entry) => {
      // Ölümcül olmayanlar uygulamayı kesmez; sadece ölümcül olanda ekrana geç.
      if (entry.fatal) this.setState((s) => (s.entry ? s : { entry }));
    });
  }

  componentWillUnmount(): void {
    this.unsubscribe?.();
  }

  componentDidCatch(error: unknown): void {
    reportError(error, "ekran çizilirken", true);
  }

  private reset = () => this.setState({ entry: null });

  render(): React.ReactNode {
    const { entry } = this.state;
    if (!entry) return this.props.children;

    const detail = [
      entry.context ? `Nerede: ${entry.context}` : null,
      `Mesaj: ${entry.message}`,
      `Derleme: ${buildLabel()}`,
      `Zaman: ${entry.at}`,
      entry.stack ? `\nİz:\n${entry.stack}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.emoji}>🛠️</Text>
          <Text style={styles.title}>Uygulama bir hataya takıldı</Text>
          <Text style={styles.lead}>
            Aşağıdaki metni kopyalayıp (uzun basıp seç) bana gönderirsen sebebini
            bulup düzeltirim. Verilerin duruyor — silinmedi.
          </Text>

          <View style={styles.card}>
            <Text style={styles.detail} selectable>
              {detail}
            </Text>
          </View>

          <TouchableOpacity style={styles.button} onPress={this.reset} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Tekrar dene</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Tekrar denemek çözmezse uygulamayı kapatıp açman yeterli; verilerin
            telefonda kayıtlı kalır.
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 24, paddingTop: 80, paddingBottom: 40 },
  emoji: { fontSize: 44, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink, marginBottom: 8 },
  lead: { fontSize: 14, color: colors.inkSoft, lineHeight: 21, marginBottom: 18 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 20,
  },
  detail: {
    fontSize: 12,
    color: colors.ink,
    lineHeight: 18,
    fontFamily: undefined,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    ...shadowLift,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  hint: { fontSize: 12, color: colors.inkSoft, lineHeight: 18, marginTop: 14 },
});
