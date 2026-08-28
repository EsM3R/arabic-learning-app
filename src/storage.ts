import AsyncStorage from "@react-native-async-storage/async-storage";
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
