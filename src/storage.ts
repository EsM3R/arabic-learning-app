import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChatMessage, Profile } from "./types";

const PROFILE_KEY = "profile.v1";
const chatKey = (id: string) => `chat.v1.${id}`;

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
