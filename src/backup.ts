/**
 * Yedek dosyası — SAF modül (React/RN importu YOK; tests/backup.test.ts).
 *
 * Uygulamanın bütün hafızası AsyncStorage anahtarlarından ibarettir; yedek de
 * bu anahtarların ham dökümüdür. Model hiçbir şey hatırlamaz — hoca her
 * mesajda bu veriyi yeniden okur; dolayısıyla bu dosya geri yüklendiğinde
 * hoca öğrenciyi bıraktığı yerden tanır.
 *
 * API anahtarları yedeğe GİRMEZ: dosya Drive/WhatsApp gibi yerlerde
 * dolaşacak. Geri yüklerken cihazdaki mevcut anahtarlar korunur.
 */
import type { Profile } from "./types";

export const BACKUP_FORMAT = "lisan-hocasi-yedek";
export const BACKUP_VERSION = 1;
export const PROFILE_KEY = "profile.v1";

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  /** Yedeği alan derleme (bilgi amaçlı). */
  app: string;
  /** AsyncStorage anahtarı → ham (JSON) değer. */
  entries: Record<string, string>;
}

/** Profil kaydından cihaza özgü gizli alanları söker. */
export function stripSecrets(profileJson: string): string {
  try {
    const p = JSON.parse(profileJson) as Record<string, unknown>;
    if (!p || typeof p !== "object") return profileJson;
    p.apiKey = "";
    delete p.apiKeys;
    return JSON.stringify(p);
  } catch {
    return profileJson;
  }
}

export function buildBackup(
  entries: [string, string | null][],
  app: string,
  now = new Date()
): BackupFile {
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (value == null) continue;
    out[key] = key === PROFILE_KEY ? stripSecrets(value) : value;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    app,
    entries: out,
  };
}

export function serializeBackup(b: BackupFile): string {
  return JSON.stringify(b);
}

/** Dosya adı: lisan-hocasi-yedek-2026-09-02.json */
export function backupFileName(now = new Date()): string {
  return `lisan-hocasi-yedek-${now.toISOString().slice(0, 10)}.json`;
}

/** Yedek metnini doğrulayarak ayrıştırır; sorun varsa Türkçe hata fırlatır. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Bu dosya bir Lisan Hocası yedeği değil (içerik okunamadı).");
  }
  const b = raw as Partial<BackupFile> | null;
  if (!b || typeof b !== "object" || b.format !== BACKUP_FORMAT) {
    throw new Error("Bu dosya bir Lisan Hocası yedeği değil.");
  }
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) {
    throw new Error(
      "Bu yedek daha yeni bir uygulama sürümüyle alınmış. Önce uygulamayı güncelle."
    );
  }
  if (!b.entries || typeof b.entries !== "object" || Array.isArray(b.entries)) {
    throw new Error("Yedek dosyası bozuk (kayıtlar eksik).");
  }
  const entries: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.entries)) {
    if (typeof v === "string") entries[k] = v;
  }
  if (Object.keys(entries).length === 0) {
    throw new Error("Yedek dosyası boş.");
  }
  if (!entries[PROFILE_KEY]) {
    throw new Error("Yedekte profil kaydı yok — dosya eksik ya da bozuk.");
  }
  return {
    format: BACKUP_FORMAT,
    version: b.version,
    exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "",
    app: typeof b.app === "string" ? b.app : "",
    entries,
  };
}

export interface BackupSummary {
  exportedAt: string;
  name: string;
  vocab: number;
  mistakes: number;
  readings: number;
  chats: number;
  /** Yedekte izi olan diller ("ar" eksiz anahtarlardan, diğerleri ekten). */
  languages: string[];
}

function countList(json: string | undefined): number {
  if (!json) return 0;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

/** Onay diyaloğu için: yedekte ne var? (dil ekli anahtarlar toplanır) */
export function summarizeBackup(b: BackupFile): BackupSummary {
  const e = b.entries;
  const langs = new Set<string>();
  let vocab = 0;
  let mistakes = 0;
  let readings = 0;
  let chats = 0;
  for (const key of Object.keys(e)) {
    // "vocab.v1" (ar) / "vocab.v1.en" / "chat.v1.<id>" / "chat.v1.en.<id>"
    const m = key.match(/^(vocab|mistakes|notes|readings)\.v1(?:\.([a-z]{2}))?$/);
    if (m) {
      langs.add(m[2] ?? "ar");
      if (m[1] === "vocab") vocab += countList(e[key]);
      if (m[1] === "mistakes") mistakes += countList(e[key]);
      if (m[1] === "readings") readings += countList(e[key]);
    }
    if (key.startsWith("chat.v1.")) chats += 1;
  }
  let name = "";
  try {
    const p = e[PROFILE_KEY] ? (JSON.parse(e[PROFILE_KEY]) as Partial<Profile>) : null;
    if (p && typeof p.name === "string") name = p.name;
    if (p && typeof p.activeLanguage === "string") langs.add(p.activeLanguage);
  } catch {
    // profil bozuksa ad boş kalır; geri yükleme yine çalışır
  }
  return {
    exportedAt: b.exportedAt,
    name,
    vocab,
    mistakes,
    readings,
    chats,
    languages: Array.from(langs).sort(),
  };
}

/**
 * Geri yüklenecek profil: yedekteki profil + BU cihazın anahtar/model/
 * sağlayıcı seçimi. Yedekte anahtar yoktur (stripSecrets); cihazda da
 * yoksa (yeni telefon) öğrenci anahtarı ayarlardan yeniden girer.
 */
export function mergeDeviceSecrets(
  backupProfileJson: string | undefined,
  current: Profile | null
): string | undefined {
  if (!backupProfileJson) return undefined;
  if (!current) return backupProfileJson;
  try {
    const p = JSON.parse(backupProfileJson) as Record<string, unknown>;
    if (!p || typeof p !== "object") return backupProfileJson;
    p.apiKey = current.apiKey ?? "";
    if (current.apiKeys) p.apiKeys = current.apiKeys;
    if (current.models) p.models = current.models;
    if (current.provider) p.provider = current.provider;
    return JSON.stringify(p);
  } catch {
    return backupProfileJson;
  }
}
