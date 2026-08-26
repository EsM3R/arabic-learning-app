/**
 * Hata görünürlüğü.
 *
 * Release APK'da (Expo Go'nun aksine) kırmızı hata ekranı yoktur: yakalanmayan
 * bir hata uygulamayı sessizce kapatır ve kullanıcı hiçbir şey göremez. Bu
 * modül hataları toplar; ErrorBoundary de onları ekranda gösterir, böylece
 * hata metni okunabilir ve kopyalanabilir olur.
 */

type Listener = (entry: ErrorEntry) => void;

export interface ErrorEntry {
  message: string;
  stack?: string;
  context?: string;
  fatal: boolean;
  at: string;
}

const listeners: Listener[] = [];
const history: ErrorEntry[] = [];
const MAX_HISTORY = 20;

export function describeError(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) {
    return { message: e.message || e.name || "Bilinmeyen hata", stack: e.stack };
  }
  if (typeof e === "string") return { message: e };
  try {
    return { message: JSON.stringify(e) };
  } catch {
    return { message: String(e) };
  }
}

export function reportError(e: unknown, context?: string, fatal = false): ErrorEntry {
  const { message, stack } = describeError(e);
  const entry: ErrorEntry = {
    message,
    stack,
    context,
    fatal,
    at: new Date().toISOString(),
  };
  history.push(entry);
  if (history.length > MAX_HISTORY) history.shift();
  for (const l of listeners) {
    try {
      l(entry);
    } catch {
      // Dinleyicinin hatası hata bildirimini bozmasın
    }
  }
  return entry;
}

export function subscribeErrors(l: Listener): () => void {
  listeners.push(l);
  return () => {
    const i = listeners.indexOf(l);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function errorHistory(): ErrorEntry[] {
  return [...history];
}

let installed = false;

/**
 * React ağacının dışında oluşan hataları (async, olay yöneticileri, zamanlayıcı)
 * yakalar. Bunlar ErrorBoundary'ye düşmez; yakalanmazsa uygulama kapanır.
 */
export function installGlobalErrorHandler(): void {
  if (installed) return;
  installed = true;

  const utils = (globalThis as any).ErrorUtils;
  if (utils && typeof utils.setGlobalHandler === "function") {
    const previous =
      typeof utils.getGlobalHandler === "function" ? utils.getGlobalHandler() : undefined;
    utils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      reportError(error, "yakalanmayan hata", Boolean(isFatal));
      if (typeof previous === "function") {
        try {
          previous(error, isFatal);
        } catch {
          // Önceki yönetici patlarsa bizim kaydımız yine de duruyor
        }
      }
    });
  }
}
