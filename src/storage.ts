import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LessonQuality } from "./lessonquality";
import { BackupFile, mergeDeviceSecrets } from "./backup";
import type { FluencySession } from "./fluency";
import { FUSHA_MIGRATION_KEY } from "./fusha";
import { runMigrations, SCHEMA_KEY, SCHEMA_VERSION, schemaStatus } from "./schema";
import type { SchemaStatus } from "./schema";
import { getActiveLanguageId, setActiveLanguage } from "./languages";
import {
  Assessment,
  ChatMessage,
  Curriculum,
  MistakeEntry,
  Profile,
  PronunciationSet,
  ReadingText,
  Reminder,
  TeacherNote,
  VocabCard,
} from "./types";

const PROFILE_KEY = "profile.v1";

/**
 * Dil-bazlı anahtar uzayı: her dilin kelime defteri, hata defteri, notları,
 * sohbetleri ve ilerlemesi ayrı tutulur. Arapça, uygulamanın ilk dili olduğu
 * için eski (eksiz) anahtarları kullanmaya devam eder — böylece mevcut
 * kullanıcı verisi göç gerektirmeden aynen korunur.
 */
function langKey(base: string): string {
  const lang = getActiveLanguageId();
  return lang === "ar" ? `${base}.v1` : `${base}.v1.${lang}`;
}

const chatKey = (id: string) => {
  const lang = getActiveLanguageId();
  return lang === "ar" ? `chat.v1.${id}` : `chat.v1.${lang}.${id}`;
};

async function loadList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T[]) : [];
}

async function saveList<T>(key: string, list: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(list));
}

export const loadVocab = () => loadList<VocabCard>(langKey("vocab"));
export const saveVocab = (cards: VocabCard[]) => saveList(langKey("vocab"), cards);
export const loadMistakes = () => loadList<MistakeEntry>(langKey("mistakes"));
export const saveMistakes = (entries: MistakeEntry[]) => saveList(langKey("mistakes"), entries);
export const loadNotes = () => loadList<TeacherNote>(langKey("notes"));
export const saveNotes = (notes: TeacherNote[]) => saveList(langKey("notes"), notes);
export const loadReminders = () => loadList<Reminder>(langKey("reminders"));
export const saveReminders = (reminders: Reminder[]) => saveList(langKey("reminders"), reminders);
/** Okuma Salonu kütüphanesi. Kayıt her zaman pruneReadings ile budanarak yapılmalı. */
export const loadReadings = () => loadList<ReadingText>(langKey("readings"));
export const saveReadings = (list: ReadingText[]) => saveList(langKey("readings"), list);
/** Akıcılık (4/3/2) oturumları. Kayıt pruneSessions ile budanarak yapılmalı. */
export const loadFluency = () => loadList<FluencySession>(langKey("fluency"));
export const saveFluency = (list: FluencySession[]) => saveList(langKey("fluency"), list);

/**
 * DERS KALİTESİ ölçümleri (bkz. src/lessonquality.ts). Dil başına tutulur:
 * hocanın Arapça derste çok Türkçe konuşması, Fransızca dersi hakkında bir
 * şey söylemez. Kayıt pruneQuality ile budanarak yapılmalı.
 */
export const loadLessonQuality = () => loadList<LessonQuality>(langKey("lessonQuality"));
export const saveLessonQuality = (list: LessonQuality[]) =>
  saveList(langKey("lessonQuality"), list);

/**
 * Öğrencinin ŞİMDİYE KADAR kullandığı onarım hamlesi türleri (bkz.
 * src/negotiation.ts). Dil başına tutulur: Fransızcada "anlamadım" demeyi
 * öğrenmiş olmak Rusçada da öğrenmiş olmak demek değildir.
 */
export const loadRepairSeen = () => loadList<string>(langKey("repairSeen"));

/** Yeni bir kategori ekler; zaten varsa yazma yapmaz. */
export async function addRepairSeen(categories: string[]): Promise<string[]> {
  if (categories.length === 0) return loadRepairSeen();
  const current = await loadRepairSeen();
  const merged = Array.from(new Set([...current, ...categories]));
  if (merged.length === current.length) return current;
  await saveList(langKey("repairSeen"), merged);
  return merged;
}

/** Kelime sınavı modu tercihi ("yaz" | "soyle") — dil-bağımsız UI ayarı. */
export async function loadReviewMode(): Promise<string | null> {
  return AsyncStorage.getItem("reviewMode.v1");
}
export async function saveReviewMode(mode: string): Promise<void> {
  await AsyncStorage.setItem("reviewMode.v1", mode);
}

/**
 * Ders sohbeti tercihleri — dil-bağımsız UI ayarı.
 * voice: hoca cevabını sesli okusun + sustuktan sonra mikrofon kendi açılsın.
 * textScale: yazı boyutu çarpanı.
 */
export interface ChatPrefs {
  voice: boolean;
  textScale: number;
}
export const TEXT_SCALES = [0.9, 1, 1.15, 1.3, 1.45];
export const DEFAULT_CHAT_PREFS: ChatPrefs = { voice: true, textScale: 1 };

export async function loadChatPrefs(): Promise<ChatPrefs> {
  const raw = await AsyncStorage.getItem("chatPrefs.v1");
  if (!raw) return DEFAULT_CHAT_PREFS;
  try {
    const p = JSON.parse(raw) as Partial<ChatPrefs>;
    return {
      voice: typeof p.voice === "boolean" ? p.voice : DEFAULT_CHAT_PREFS.voice,
      textScale:
        typeof p.textScale === "number" && TEXT_SCALES.includes(p.textScale)
          ? p.textScale
          : DEFAULT_CHAT_PREFS.textScale,
    };
  } catch {
    return DEFAULT_CHAT_PREFS;
  }
}
export async function saveChatPrefs(prefs: ChatPrefs): Promise<void> {
  await AsyncStorage.setItem("chatPrefs.v1", JSON.stringify(prefs));
}

/**
 * CÜMLE KURMA: kalıp ilerlemesi ve kayıtlı setler (dil başına). Setler
 * saklanır ki aynı set tekrar tekrar çalışılabilsin — her açılışta yeniden
 * üretmek hem para hem tekrar fırsatı kaybı olurdu.
 */
export async function loadBuildProgress<T>(): Promise<T> {
  const raw = await AsyncStorage.getItem(langKey("buildProgress"));
  return (raw ? JSON.parse(raw) : {}) as T;
}
export async function saveBuildProgress(map: unknown): Promise<void> {
  await AsyncStorage.setItem(langKey("buildProgress"), JSON.stringify(map));
}
export const loadBuildSets = <T>() => loadList<T>(langKey("buildSets"));
export const saveBuildSets = <T>(list: T[]) => saveList(langKey("buildSets"), list);

/** Shadowing öz-notları (SRS değil; kuyruk sıralamasını etkiler). */
export async function loadShadowNotes<T>(): Promise<T> {
  const raw = await AsyncStorage.getItem(langKey("shadowNotes"));
  return (raw ? JSON.parse(raw) : {}) as T;
}
export async function saveShadowNotes(map: unknown): Promise<void> {
  await AsyncStorage.setItem(langKey("shadowNotes"), JSON.stringify(map));
}

/** Öğrencinin son çalışma zamanı — uyanış kontrolü buna bakar. */
export async function touchLastActivity(): Promise<void> {
  await AsyncStorage.setItem(langKey("lastActivity"), new Date().toISOString());
}

export async function loadLastActivity(): Promise<string | null> {
  return AsyncStorage.getItem(langKey("lastActivity"));
}

export interface WakeCheck {
  at: string;
  message: string;
}

export async function loadWakeCheck(): Promise<WakeCheck | null> {
  const raw = await AsyncStorage.getItem(langKey("wakeCheck"));
  return raw ? (JSON.parse(raw) as WakeCheck) : null;
}

export async function saveWakeCheck(check: WakeCheck): Promise<void> {
  await AsyncStorage.setItem(langKey("wakeCheck"), JSON.stringify(check));
}

export async function loadPronunciationSet(): Promise<PronunciationSet | null> {
  const raw = await AsyncStorage.getItem(langKey("pronunciation"));
  return raw ? (JSON.parse(raw) as PronunciationSet) : null;
}

export async function savePronunciationSet(set: PronunciationSet): Promise<void> {
  await AsyncStorage.setItem(langKey("pronunciation"), JSON.stringify(set));
}

export async function loadProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as Profile) : null;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function loadChat(id: string): Promise<ChatMessage[]> {
  const raw = await AsyncStorage.getItem(chatKey(id));
  return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
}

export async function saveChat(id: string, messages: ChatMessage[]): Promise<void> {
  await AsyncStorage.setItem(chatKey(id), JSON.stringify(messages));
}

// ---------------------------------------------------------------------------
// Dil değiştirme: aktif dilin ilerlemesi (seviye + müfredat + tamamlananlar)
// kendi deposuna yazılır, hedef dilinki yüklenir. Profildeki isim ve API
// anahtarı ortaktır.
// ---------------------------------------------------------------------------

interface LanguageProgress {
  assessment?: Assessment;
  curriculum?: Curriculum;
  completedModuleIds: string[];
}

const progKey = (lang: string) => `langprog.v1.${lang}`;

export async function switchLanguageProgress(
  profile: Profile,
  targetId: string
): Promise<Profile> {
  const currentId = getActiveLanguageId();
  if (currentId === targetId) return profile;

  const currentProgress: LanguageProgress = {
    assessment: profile.assessment,
    curriculum: profile.curriculum,
    completedModuleIds: profile.completedModuleIds,
  };
  await AsyncStorage.setItem(progKey(currentId), JSON.stringify(currentProgress));

  setActiveLanguage(targetId);
  const raw = await AsyncStorage.getItem(progKey(getActiveLanguageId()));
  const target: LanguageProgress = raw
    ? (JSON.parse(raw) as LanguageProgress)
    : { completedModuleIds: [] };

  const next: Profile = {
    ...profile,
    activeLanguage: getActiveLanguageId(),
    assessment: target.assessment,
    curriculum: target.curriculum,
    completedModuleIds: target.completedModuleIds ?? [],
  };
  await saveProfile(next);
  return next;
}

export async function resetAll(): Promise<void> {
  await AsyncStorage.clear();
}

/**
 * Ammice → fusha geçişi yapıldı mı. Tek seferlik: bayrak konduktan sonra
 * "konusma" parkuru artık SÖZLÜ FUSHA demektir ve o kartlar silinmez
 * (bkz. src/fusha.ts).
 */
export async function loadFushaMigrated(): Promise<boolean> {
  return (await AsyncStorage.getItem(FUSHA_MIGRATION_KEY)) === "1";
}

export async function saveFushaMigrated(): Promise<void> {
  await AsyncStorage.setItem(FUSHA_MIGRATION_KEY, "1");
}

/**
 * Modül sohbetlerini siler. Yeni müfredat da "k1", "o1"... id'lerini
 * ürettiği için eski sohbetler silinmezse A1'in "k1" dersi A0'ın "k1"
 * transkriptiyle açılır ve hoca eski dersin üstüne konuşur.
 */
export async function clearModuleChats(): Promise<void> {
  const lang = getActiveLanguageId();
  const prefix = lang === "ar" ? "chat.v1.module." : `chat.v1.${lang}.module.`;
  const keys = await AsyncStorage.getAllKeys();
  const targets = keys.filter((k) => k.startsWith(prefix));
  if (targets.length > 0) await AsyncStorage.multiRemove(targets);
}

// ---------------------------------------------------------------------------
// Yedek: uygulamanın bütün hafızası bu anahtarlardır (bkz. src/backup.ts).
// ---------------------------------------------------------------------------

/** Depodaki HER anahtarı ham haliyle döker. */
export async function dumpAllEntries(): Promise<[string, string | null][]> {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet([...keys]);
  return pairs.map(([k, v]) => [k, v]);
}

/**
 * Yedekten dönüş: depo TAMAMEN yedektekiyle değiştirilir; yalnız bu cihazın
 * API anahtarı / model seçimi korunur (yedekte anahtar yoktur).
 */
export async function restoreFromBackup(b: BackupFile, current: Profile | null): Promise<void> {
  const merged0 = { ...b.entries };
  const merged = mergeDeviceSecrets(merged0[PROFILE_KEY], current);
  if (merged) merged0[PROFILE_KEY] = merged;
  // Eski bir yedek eski biçimde olabilir: göç zinciri yazmadan ÖNCE çalışır,
  // yoksa bugünkü kod eski biçimi okumaya çalışır ve sessizce yanlış okur.
  const migrated = runMigrations(merged0, b.schema ?? 1);
  await AsyncStorage.clear();
  await AsyncStorage.multiSet(Object.entries(migrated.entries));
  await AsyncStorage.setItem(SCHEMA_KEY, String(migrated.version));
}

// ---------------------------------------------------------------------------
// Şema sürümü ve göç (bkz. src/schema.ts)
// ---------------------------------------------------------------------------

export async function loadSchemaVersion(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(SCHEMA_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface SchemaCheck {
  status: SchemaStatus;
  /** Uygulanan göçlerin notları. */
  applied: string[];
}

/**
 * Açılışta çağrılır. Üç durum:
 * - "gelecekten": VERİYE DOKUNULMAZ, çağıran öğrenciyi uyarır.
 * - "bos": ilk kurulum ya da damgadan önceki sürüm → bugünün sürümü damgalanır.
 *   Damgasız veri, damgalama öncesi biçimden gelir ve o biçim bugünküyle
 *   aynıdır; göç gerekmez.
 * - "goc-gerekli": zincir çalışır, ulaşılan sürüm damgalanır (yarım kalırsa
 *   eksik sürüm damgalanır ve bir sonraki açılışta kaldığı yerden devam eder).
 */
export async function ensureSchema(): Promise<SchemaCheck> {
  const stored = await loadSchemaVersion();
  const status = schemaStatus(stored);
  if (status === "gelecekten") return { status, applied: [] };
  if (status === "guncel") return { status, applied: [] };
  if (status === "bos") {
    await AsyncStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
    return { status, applied: [] };
  }

  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet([...keys]);
  const entries: Record<string, string> = {};
  for (const [k, v] of pairs) if (v != null) entries[k] = v;

  const result = runMigrations(entries, stored ?? 1);
  const changed = Object.entries(result.entries).filter(([k, v]) => entries[k] !== v);
  if (changed.length > 0) await AsyncStorage.multiSet(changed);
  await AsyncStorage.setItem(SCHEMA_KEY, String(result.version));
  return { status, applied: result.applied };
}

// ---------------------------------------------------------------------------
// Yedek hatırlatması — veri yalnız bu telefonda duruyor (bkz. src/backup.ts)
// ---------------------------------------------------------------------------

const LAST_EXPORT_KEY = "lastExport.v1";

export async function loadLastExportAt(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_EXPORT_KEY);
}

export async function saveLastExportAt(): Promise<void> {
  await AsyncStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
}

const LAST_SNAPSHOT_KEY = "lastSnapshot.v1";

export async function loadLastSnapshotAt(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SNAPSHOT_KEY);
}

export async function saveLastSnapshotAt(at: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SNAPSHOT_KEY, at);
}
