/**
 * Sesli ders: ders sohbeti mesajlaşma değil konuşma gibi aksın.
 *
 * Tutulan halkalar: hoca cevabı seslenir (telefon sesiyle yalnız hedef dil),
 * hoca susunca mikrofon kendi açılır, söylenen kendiliğinden gider; kapalıyken
 * eski düzen (yazı kutusuna düşer); yazı boyutu tercihi kalıcıdır.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LessonScreen from "../src/screens/LessonScreen";
import { setActiveLanguage } from "../src/languages";
import { isSpoken } from "../src/speechinput";
import type { ChatMessage, Profile } from "../src/types";

const mockCalls: ChatMessage[][] = [];
let mockReply = "Güzel. أَهْلًا وَسَهْلًا. Şimdi sen söyle.";
jest.mock("../src/claude", () => ({
  agenticChat: jest.fn(async (_system: unknown, history: ChatMessage[]) => {
    mockCalls.push(history);
    return { text: mockReply, actions: [] };
  }),
}));

type Dictation = { opts: { onResult: (t: string) => void } | null; started: number; stopped: number };
const dictation = () => (global as unknown as { __dictation: Dictation }).__dictation;
const speak = Speech.speak as jest.Mock;

const profile = {
  name: "Mehmet",
  apiKey: "sk-x",
  completedModuleIds: [],
  assessment: { speakingLevel: "A1", readingLevel: "A1", weaknesses: [], strengths: [], summary: "" },
} as unknown as Profile;

async function open() {
  render(
    <LessonScreen
      profile={profile}
      module={null}
      onBack={() => {}}
      onCompleteModule={() => {}}
      onProfileChange={() => {}}
      onNavigate={() => {}}
    />
  );
  await waitFor(() => expect(mockCalls.length).toBeGreaterThan(0));
}

beforeEach(async () => {
  mockCalls.length = 0;
  mockReply = "Güzel. أَهْلًا وَسَهْلًا. Şimdi sen söyle.";
  setActiveLanguage("ar");
  await AsyncStorage.clear();
  speak.mockReset();
  // Telefon TTS'i cümleyi hemen "bitirsin" — kuyruk zinciri test içinde aksın.
  speak.mockImplementation((_t: string, o?: { onDone?: () => void }) => o?.onDone?.());
  const d = dictation();
  d.started = 0;
  d.stopped = 0;
});

test("hoca cevabı seslenir — telefon sesi Türkçeyi atlar, yalnız hedef dili okur", async () => {
  await open();
  await waitFor(() => expect(speak).toHaveBeenCalled());
  const said = speak.mock.calls.map((c) => c[0] as string);
  expect(said.some((t) => t.includes("أَهْلًا"))).toBe(true);
  expect(said.some((t) => /Güzel|Şimdi/.test(t))).toBe(false);
});

test("hoca susunca mikrofon kendi açılır, söylenen kendiliğinden gider", async () => {
  await open();
  await waitFor(() => expect(dictation().started).toBeGreaterThan(0));
  await act(async () => {
    dictation().opts!.onResult("أنا بخير");
  });
  await waitFor(() => expect(mockCalls.length).toBe(2));
  const last = mockCalls[1][mockCalls[1].length - 1];
  expect(last.role).toBe("user");
  expect(isSpoken(last.content)).toBe(true);
});

test("sesli ders kapatılınca ses yok, söylenen yazı kutusuna düşer", async () => {
  await open();
  await waitFor(() => expect(speak).toHaveBeenCalled());
  fireEvent.press(screen.getByLabelText("Yazarak cevap ver"));
  await waitFor(() => expect(screen.getByLabelText("Sesli derse geç")).toBeTruthy());
  const raw = await AsyncStorage.getItem("chatPrefs.v1");
  expect(JSON.parse(raw!).voice).toBe(false);

  await act(async () => {
    dictation().opts!.onResult("أنا بخير");
  });
  expect(mockCalls.length).toBe(1); // gönderilmedi
  expect(screen.getByDisplayValue("أنا بخير")).toBeTruthy();
});

test("yazı boyutu büyütülür ve tercih kalıcıdır", async () => {
  await open();
  fireEvent.press(screen.getByLabelText("Yazı boyutu"));
  await waitFor(async () => {
    const raw = await AsyncStorage.getItem("chatPrefs.v1");
    expect(JSON.parse(raw!).textScale).toBe(1.15);
  });
});

test("Latin dilde ses modeli yoksa sesli ders açılmaz (Türkçe İngilizce aksanla okunmasın)", async () => {
  setActiveLanguage("en");
  mockReply = "Good. Now you say it.";
  await open();
  // Sesli ders yok: yazılı düzen, basılı tut-konuş mikrofonu
  await waitFor(() => expect(screen.getByLabelText("Basılı tutarak konuş")).toBeTruthy());
  expect(screen.queryByLabelText("Sesli derse geç")).toBeNull();
  expect(speak).not.toHaveBeenCalled();
});

test("Dersi Tamamla onay kutusu yerine ders sonu özetini açar; özet modülü kapatır", async () => {
  const done: string[] = [];
  const mod = { id: "k2", track: "konusma", title: "Kendini tanıt", description: "", level: "A1", objectives: [] };
  render(
    <LessonScreen
      profile={profile}
      module={mod as never}
      onBack={() => {}}
      onCompleteModule={(id) => done.push(id)}
      onProfileChange={() => {}}
      onNavigate={() => {}}
    />
  );
  await waitFor(() => expect(mockCalls.length).toBeGreaterThan(0));
  fireEvent.press(screen.getByLabelText("Dersi Tamamla"));
  await waitFor(() => expect(screen.getByText("Ders tamam")).toBeTruthy());
  expect(screen.getByText(/kez sesle konuştun/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Derse devam et"));
  await waitFor(() => expect(screen.getByLabelText("Dersi Tamamla")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Dersi Tamamla"));
  fireEvent.press(await screen.findByLabelText("Dersi tamamla"));
  expect(done).toEqual(["k2"]);
});
