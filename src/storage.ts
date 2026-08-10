import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ChatMessage,
  MistakeEntry,
  Profile,
  PronunciationSet,
  Reminder,
  TeacherNote,
  VocabCard,
} from "./types";

const PROFILE_KEY = "profile.v1";
const VOCAB_KEY = "vocab.v1";
const MISTAKES_KEY = "mistakes.v1";
const NOTES_KEY = "notes.v1";
const PRONUNCIATION_KEY = "pronunciation.v1";
const REMINDERS_KEY = "reminders.v1";
const chatKey = (id: string) => `chat.v1.${id}`;

async function loadList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T[]) : [];
}

async function saveList<T>(key: string, list: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(list));
}

export const loadVocab = () => loadList<VocabCard>(VOCAB_KEY);
export const saveVocab = (cards: VocabCard[]) => saveList(VOCAB_KEY, cards);
export const loadMistakes = () => loadList<MistakeEntry>(MISTAKES_KEY);
export const saveMistakes = (entries: MistakeEntry[]) => saveList(MISTAKES_KEY, entries);
export const loadNotes = () => loadList<TeacherNote>(NOTES_KEY);
export const saveNotes = (notes: TeacherNote[]) => saveList(NOTES_KEY, notes);
export const loadReminders = () => loadList<Reminder>(REMINDERS_KEY);
export const saveReminders = (reminders: Reminder[]) => saveList(REMINDERS_KEY, reminders);

export async function loadPronunciationSet(): Promise<PronunciationSet | null> {
  const raw = await AsyncStorage.getItem(PRONUNCIATION_KEY);
  return raw ? (JSON.parse(raw) as PronunciationSet) : null;
}

export async function savePronunciationSet(set: PronunciationSet): Promise<void> {
  await AsyncStorage.setItem(PRONUNCIATION_KEY, JSON.stringify(set));
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

export async function resetAll(): Promise<void> {
  await AsyncStorage.clear();
}
