/**
 * Ders ekranı testi — uygulamanın en karmaşık ve en çok kullanılan ekranı.
 *
 * Buradaki asıl değer, ÖLÇÜM → PROMPT ZİNCİRİNİ uçtan uca doğrulamak.
 * Bu uygulamanın en sinsi kusur biçimi şuydu: bir ölçüm yapılıyor ama hocaya
 * hiç ulaşmıyor (ilerleme_durumu bir araçtı ve model onu çağırmadıkça hoca
 * öğrencinin konuşup konuşmadığını görmüyordu). Zincirin herhangi bir
 * halkası koparsa hiçbir hata çıkmaz, hoca sadece biraz daha genel konuşur
 * ve kimse fark etmez. Bu dosya halkaları tek tek tutuyor.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import LessonScreen from "../src/screens/LessonScreen";
import { setActiveLanguage } from "../src/languages";
import { addRepairSeen, loadRepairSeen, saveMistakes, saveVocab } from "../src/storage";
import { loadStatsSummary } from "../src/statsStore";
import type { MistakeEntry, Profile, VocabCard } from "../src/types";

/** agenticChat taklidi: çağrıldığı SİSTEM PROMPTUNU yakalar. */
const captured: { system: unknown; calls: number } = { system: null, calls: 0 };
jest.mock("../src/claude", () => ({
  agenticChat: jest.fn(async (system: unknown) => {
    captured.system = system;
    captured.calls += 1;
    return { text: "Merhaba, başlayalım.", actions: [] };
  }),
}));

const profile: Profile = {
  name: "Mehmet",
  apiKey: "sk-x",
  completedModuleIds: [],
  assessment: {
    speakingLevel: "A2",
    readingLevel: "A2",
    weaknesses: [],
    strengths: [],
    updatedAt: "2026-09-12T00:00:00.000Z",
  },
} as unknown as Profile;

function card(over: Partial<VocabCard> = {}): VocabCard {
  return {
    id: `v${Math.random()}`,
    arabic: "كتاب",
    transliteration: "kitab",
    turkish: "kitap",
    track: "okuma",
    addedAt: "2026-09-01T10:00:00.000Z",
    due: "2026-09-02T10:00:00.000Z",
    intervalDays: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    ...over,
  } as VocabCard;
}

function mistake(over: Partial<MistakeEntry> = {}): MistakeEntry {
  return {
    id: "m1",
    topic: "i'râb",
    mistake: "yanlış",
    correction: "doğru",
    explanation: "çünkü",
    resolved: false,
    createdAt: "2026-09-01T10:00:00.000Z",
    timesSeen: 4,
    ...over,
  } as MistakeEntry;
}

/** Sistem promptunun DEĞİŞKEN (hafıza) kısmı. */
function dynamicPrompt(): string {
  const s = captured.system as { dynamic?: string } | null;
  return s?.dynamic ?? "";
}

async function openLesson() {
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
  // Açılışta hoca sohbeti kendi başlatır (KICKOFF).
  await waitFor(() => expect(captured.calls).toBeGreaterThan(0));
}

beforeEach(async () => {
  captured.system = null;
  captured.calls = 0;
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
});

test("açılışta hocayı uygulama başlatır", async () => {
  await openLesson();
  await waitFor(() => expect(screen.getByText(/başlayalım/)).toBeTruthy());
});

test("FOSİLLEŞEN hata hocanın promptuna id'siyle girer", async () => {
  // id olmadan hata_cozuldu çağrılamaz ve hata defteri hiç boşalmaz.
  await saveMistakes([mistake({ id: "m42", timesSeen: 5, mistake: "FOSIL-HATA" })]);
  await openLesson();
  const d = dynamicPrompt();
  expect(d).toMatch(/TEKRARLAYAN HATALAR/);
  expect(d).toMatch(/id=m42/);
  expect(d).toMatch(/FOSIL-HATA/);
});

test("ÖLÇÜLEN ilerleme promptta — araç çağrısına bırakılmıyor", async () => {
  // Asıl kusur buydu: veri yalnız bir araçtı, model çağırmazsa hoca kördü.
  await saveVocab([card(), card(), card()]);
  await openLesson();
  expect(dynamicPrompt()).toMatch(/ÖLÇÜLEN İLERLEME|Henüz ölçülmüş veri yok/);
});

test("MÜZAKERE araç çantası ve onarım durumu promptta", async () => {
  await openLesson();
  const d = dynamicPrompt();
  expect(d).toMatch(/MÜZAKERE ARAÇ ÇANTASI/);
  expect(d).toMatch(/KASITLI ANLAMAMA/);
  // Hiç onarım yapmamış öğrenci için uyarı sert olmalı.
  expect(d).toMatch(/HİÇ onarım hamlesi yapmadı/);
});

test("onarım hamlesi kullanılınca prompt bunu SONRAKİ turda bilir", async () => {
  await openLesson();
  await addRepairSeen(["anlamadim", "tekrar"]);
  captured.calls = 0;

  fireEvent.changeText(screen.getByPlaceholderText(/buraya yaz/i), "merhaba");
  fireEvent.press(screen.getByText("↑")); // gönder düğmesi
  await waitFor(() => expect(captured.calls).toBeGreaterThan(0));

  const d = dynamicPrompt();
  expect(d).toMatch(/anlamadığını söyleme/);
  expect(d).not.toMatch(/HİÇ onarım hamlesi yapmadı/);
});

test("öğrenci onarım kalıbı yazınca KAYDEDİLİR", async () => {
  // Ölçülmeyen davranış öğretilemez: bu zincir koparsa hoca öğrencinin
  // refleksi kazandığını asla göremez.
  await openLesson();
  fireEvent.changeText(screen.getByPlaceholderText(/buraya yaz/i), "لَمْ أَفْهَمْ");
  fireEvent.press(screen.getByText("↑")); // gönder düğmesi

  await waitFor(async () => {
    expect(await loadRepairSeen()).toContain("anlamadim");
  });
  const stats = await loadStatsSummary();
  expect(stats.total.repairUsed).toBeGreaterThan(0);
});

test("sıradan cümle onarım sayılmaz — ölçüm şişmez", async () => {
  await openLesson();
  fireEvent.changeText(screen.getByPlaceholderText(/buraya yaz/i), "ذَهَبْتُ إِلَى السُّوقِ");
  fireEvent.press(screen.getByText("↑")); // gönder düğmesi
  await waitFor(() => expect(captured.calls).toBeGreaterThan(1));
  expect(await loadRepairSeen()).toEqual([]);
});

test("hedef alfabede yazılan cümle ÜRETİM sayılır", async () => {
  await openLesson();
  fireEvent.changeText(screen.getByPlaceholderText(/buraya yaz/i), "أَنَا فِي الْبَيْتِ");
  fireEvent.press(screen.getByText("↑")); // gönder düğmesi
  await waitFor(async () => {
    const stats = await loadStatsSummary();
    expect(stats.total.produced).toBeGreaterThan(0);
  });
});

test("TÜRKÇE yazılan cümle üretim sayılmaz — dürüst metrik", async () => {
  // Latin dillerde ayrım yapılamadığı için sayılmıyor; Arapçada da Türkçe
  // yazınca sayılmamalı, yoksa "ürettiğin cümle" sayacı yalan söyler.
  await openLesson();
  fireEvent.changeText(screen.getByPlaceholderText(/buraya yaz/i), "bugün markete gittim");
  fireEvent.press(screen.getByText("↑")); // gönder düğmesi
  await waitFor(() => expect(captured.calls).toBeGreaterThan(1));
  const stats = await loadStatsSummary();
  expect(stats.total.produced ?? 0).toBe(0);
});

test("sistem promptu SABİT ve DEĞİŞKEN diye ayrılıyor — önbellek buna bağlı", async () => {
  // Hafıza sabit kısma karışırsa önbellek ön-eki her turda bozulur ve
  // maliyet sessizce katlanır (bkz. src/caching.ts).
  await saveMistakes([mistake({ mistake: "SIZINTI-TESTI" })]);
  await openLesson();
  const s = captured.system as { stable: string; dynamic: string };
  expect(typeof s.stable).toBe("string");
  expect(s.stable.length).toBeGreaterThan(200);
  expect(s.stable).not.toMatch(/SIZINTI-TESTI/);
  expect(s.dynamic).toMatch(/SIZINTI-TESTI/);
});
