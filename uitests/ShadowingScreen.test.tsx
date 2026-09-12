/**
 * Gölgeleme (shadowing) ekranı testi.
 *
 * Shadowing'in tekniği tek cümleyle: model konuşurken ÜSTÜNE konuşmak ve
 * aynı cümleyi hız artırarak birkaç tur tekrarlamak. Protokolün iki sayısal
 * şartı var — turların gerçekten artması ve hızın turla birlikte yükselmesi.
 * İkisi de kırıldığında ekran çalışıyor görünür: kayıt alınır, ses çalar,
 * düğmeler işler. Sadece alıştırma, sıradan bir "dinle-tekrarla" hâline
 * düşer. Bu yüzden burada ölçülen şey görsel değil, TTS'e giden HIZ.
 *
 * İkinci mesele malzeme: bu ekran hiç API çağırmaz, cümleleri okuma
 * metinlerinden ve telaffuz setinden devşirir. Malzeme yokken öğrenciyi boş
 * bir ekranla bırakmak yerine nereden geleceğini söylemesi gerekir.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import ShadowingScreen from "../src/screens/ShadowingScreen";
import { setActiveLanguage } from "../src/languages";
import { PASS_RATES } from "../src/shadowing";
import type { ShadowNotesMap } from "../src/shadowing";
import { loadShadowNotes, savePronunciationSet, saveReadings } from "../src/storage";
import { flushStats, loadStatsSummary } from "../src/statsStore";
import type { PronunciationSet, ReadingText } from "../src/types";

type Btn = { text?: string; onPress?: () => void; style?: string };
const alerts: { title?: string; body?: string; buttons?: Btn[] }[] = [];
function lastAlert() {
  return alerts[alerts.length - 1];
}

/** Son TTS çağrısının hızı — protokolün ölçülebilir tek yeri. */
function lastSpokenRate(): number | undefined {
  const Speech = require("expo-speech");
  const calls = Speech.speak.mock.calls;
  return calls.length ? calls[calls.length - 1][1]?.rate : undefined;
}

function pron(): PronunciationSet {
  return {
    createdAt: "2026-09-10T08:00:00.000Z",
    items: [{ arabic: "بَاب", transliteration: "bâb", turkish: "kapı", tip: "Düz b." }],
    minimalPairs: [],
  };
}

function reading(over: Partial<ReadingText> = {}): ReadingText {
  return {
    id: "r1",
    topic: "ev",
    level: "A2",
    length: "orta",
    coldStart: false,
    createdAt: "2026-09-10T08:00:00.000Z",
    knownRatio: 0.96,
    complianceRatio: 0.98,
    unplannedUnknown: [],
    reviewCardIds: [],
    addedWordIds: [],
    finishedAt: "2026-09-11T08:00:00.000Z",
    title: "فِي البَيْت",
    titleTr: "Evde",
    sentences: [
      { target: "البَيْتُ كَبِيرٌ جِدًّا.", translit: "el-beytu kebîrun cidden", tr: "Ev çok büyük." },
    ],
    newWords: [],
    usedReviewWords: [],
    questions: [],
    productionTask: { instruction: "x", example: "y" },
    ...over,
  } as ReadingText;
}

beforeEach(async () => {
  alerts.length = 0;
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  const Speech = require("expo-speech");
  Speech.speak.mockClear();
  const rec = (global as unknown as { __recorder: Record<string, unknown> }).__recorder;
  rec.isRecording = false;
  rec.uri = null;
  rec.permission = true;
  rec.prepared = 0;
  jest
    .spyOn(Alert, "alert")
    .mockImplementation((title?: string, body?: string, buttons?: Btn[]) => {
      alerts.push({ title, body, buttons });
    });
});

async function open() {
  render(
    <ShadowingScreen onBack={() => {}} onOpenPronunciation={() => {}} onOpenReading={() => {}} />
  );
  await act(async () => {});
}

/** Bir turu baştan sona oynar: üstüne konuş → durdur → incele. */
async function runOnePass() {
  fireEvent.press(screen.getByText(/Üstüne Konuş/));
  await waitFor(() => expect(screen.getByText(/Durdur/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Durdur/));
  await waitFor(() => expect(screen.getByText(/Kaydımı dinle/)).toBeTruthy());
}

// --- malzeme ----------------------------------------------------------------

test("malzeme yokken boş ekran değil YOL gösterilir", async () => {
  await open();
  await waitFor(() => expect(screen.getByText(/Gölgelenecek cümle yok/)).toBeTruthy());
  expect(screen.getByText(/Okuma Salonu'na git/)).toBeTruthy();
  expect(screen.getByText(/Telaffuz Stüdyosu'na git/)).toBeTruthy();
});

test("cümleler okuma metinlerinden ve telaffuz setinden devşirilir", async () => {
  await saveReadings([reading()]);
  await savePronunciationSet(pron());
  await open();
  await waitFor(() => expect(screen.getByText(/1 \/ 2/)).toBeTruthy());
  expect(screen.getByText("البَيْتُ كَبِيرٌ جِدًّا.")).toBeTruthy();
  expect(screen.getByText(/Okumadan/)).toBeTruthy();
});

// --- protokol ---------------------------------------------------------------

test("3'lü döngü VARSAYILAN AÇIK ve tur sayacı görünür", async () => {
  // Tekrarlı protokol shadowing'in asıl faydası; kapalı gelirse öğrenci
  // farkında olmadan tek turluk bir egzersiz yapar.
  await saveReadings([reading()]);
  await open();
  await waitFor(() => expect(screen.getByText(/tur 1\/3/)).toBeTruthy());
});

test("HIZ turla birlikte artar — protokolün ölçülebilir şartı", async () => {
  await saveReadings([reading()]);
  await open();
  await waitFor(() => expect(screen.getByText(/Önce dinle/)).toBeTruthy());

  fireEvent.press(screen.getByText(/Önce dinle/));
  expect(lastSpokenRate()).toBe(PASS_RATES[0]);

  await runOnePass();
  fireEvent.press(screen.getByText(/Devam → \(tur 2\)/));
  await waitFor(() => expect(screen.getByText(/tur 2\/3/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Önce dinle/));
  expect(lastSpokenRate()).toBe(PASS_RATES[1]);

  await runOnePass();
  fireEvent.press(screen.getByText(/Devam → \(tur 3\)/));
  await waitFor(() => expect(screen.getByText(/tur 3\/3/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Önce dinle/));
  expect(lastSpokenRate()).toBe(PASS_RATES[2]);
});

test("üçüncü turdan SONRA not sorulur — döngü sonsuza gitmez", async () => {
  await saveReadings([reading()]);
  await open();
  await waitFor(() => expect(screen.getByText(/Üstüne Konuş/)).toBeTruthy());

  for (let pass = 1; pass <= 3; pass += 1) {
    await runOnePass();
    fireEvent.press(screen.getByText(/Devam →/));
    await act(async () => {});
  }
  await waitFor(() => expect(screen.getByText(/Kendine not ver/)).toBeTruthy());
});

test("döngü KAPATILINCA tek turda nota geçilir", async () => {
  await saveReadings([reading()]);
  await open();
  await waitFor(() => expect(screen.getByText(/🔁 3x/)).toBeTruthy());
  fireEvent.press(screen.getByText(/🔁 3x/)); // döngüyü kapat
  await waitFor(() => expect(screen.queryByText(/tur 1\/3/)).toBeNull());

  await runOnePass();
  fireEvent.press(screen.getByText("Devam →"));
  await waitFor(() => expect(screen.getByText(/Kendine not ver/)).toBeTruthy());
});

// --- kayıt ve sayaç ---------------------------------------------------------

test("tamamlanan gölgeleme SAYILIR", async () => {
  await saveReadings([reading()]);
  await open();
  await waitFor(() => expect(screen.getByText(/Üstüne Konuş/)).toBeTruthy());
  await runOnePass();
  await flushStats();
  expect((await loadStatsSummary()).total.shadowed).toBe(1);
});

test("mikrofon izni YOKSA kayıt başlamaz ve sebebi söylenir", async () => {
  const rec = (global as unknown as { __recorder: { permission: boolean; prepared: number } })
    .__recorder;
  rec.permission = false;
  try {
    await saveReadings([reading()]);
    await open();
    await waitFor(() => expect(screen.getByText(/Üstüne Konuş/)).toBeTruthy());
    fireEvent.press(screen.getByText(/Üstüne Konuş/));
    await waitFor(() => expect(lastAlert()?.title).toMatch(/Mikrofon izni/));
    expect(rec.prepared).toBe(0);
    expect(screen.getByText(/Üstüne Konuş/)).toBeTruthy(); // adım ilerlemedi
  } finally {
    rec.permission = true;
  }
});

test("SESSİZ kayıt yolu da çalışır — TTS+kayıt çakışan cihazlar için", async () => {
  await saveReadings([reading()]);
  await open();
  await waitFor(() => expect(screen.getByText(/Sadece kaydet/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Sadece kaydet/));
  await waitFor(() => expect(screen.getByText(/Durdur/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Durdur/));
  await waitFor(() => expect(screen.getByText(/Kaydımı dinle/)).toBeTruthy());
});

// --- not ve kuyruk ----------------------------------------------------------

test("verilen not DİSKE yazılır ve sıradaki cümleye geçilir", async () => {
  // Not kaydedilmezse "tekrar lazım" dedikleri bir daha öne gelmez; kuyruk
  // her açılışta aynı sırayla tekrar eder ve ekran öğrenmez.
  await saveReadings([reading()]);
  await savePronunciationSet(pron());
  await open();
  await waitFor(() => expect(screen.getByText(/1 \/ 2/)).toBeTruthy());

  await runOnePass();
  fireEvent.press(screen.getByText(/Devam →/));
  await act(async () => {});
  await runOnePass();
  fireEvent.press(screen.getByText(/Devam →/));
  await act(async () => {});
  await runOnePass();
  fireEvent.press(screen.getByText(/Devam →/));
  await waitFor(() => expect(screen.getByText(/Tekrar lazım/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Tekrar lazım/));

  await waitFor(async () => {
    const notes = await loadShadowNotes<ShadowNotesMap>();
    const entries = Object.values(notes);
    expect(entries).toHaveLength(1);
    expect(entries[0].lastNote).toBe(0);
    expect(entries[0].tries).toBe(1);
  });
  await waitFor(() => expect(screen.getByText(/2 \/ 2/)).toBeTruthy());
});

test("kuyruk bitince oturum kapanır ve baştan alınabilir", async () => {
  await saveReadings([reading()]);
  await open();
  await waitFor(() => expect(screen.getByText(/Üstüne Konuş/)).toBeTruthy());
  for (let pass = 1; pass <= 3; pass += 1) {
    await runOnePass();
    fireEvent.press(screen.getByText(/Devam →/));
    await act(async () => {});
  }
  fireEvent.press(screen.getByText(/Süper/));
  await waitFor(() => expect(screen.getByText(/Oturum bitti/)).toBeTruthy());

  fireEvent.press(screen.getByText(/Baştan/));
  await waitFor(() => expect(screen.getByText(/Üstüne Konuş/)).toBeTruthy());
});
