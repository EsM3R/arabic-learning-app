/**
 * Telaffuz Stüdyosu testi.
 *
 * Bu ekran uygulamanın KONUŞMA hedefine en yakın duran yeri ve düzeni bir
 * araştırma iddiası taşıyor (HVPT): önce algı, sonra üretim; uyaran çeşitli
 * sunulur; tekrar turunda cevap tarafı çevrilir. Bu kuralların hiçbiri
 * kırıldığında ekran bozuk GÖRÜNMEZ — sadece alıştırma işe yaramaz hâle
 * gelir. Örnek: cevap tarafı çevrilmezse öğrenci ikinci turda dinlemeden
 * "soldaki doğruydu" diye geçer ve kulak hiç eğitilmez.
 *
 * Bir de dürüstlük dikişi var: ses tanıma bir TELAFFUZ PUANI değil. Ekran
 * bunu her hükümde söylemek zorunda; söylemezse öğrenciye yalan söylemiş
 * oluruz.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import PronunciationScreen from "../src/screens/PronunciationScreen";
import { setActiveLanguage } from "../src/languages";
import { savePronunciationSet } from "../src/storage";
import { flushStats, loadStatsSummary } from "../src/statsStore";
import type { Profile, PronunciationSet } from "../src/types";

const mockGenPron = jest.fn();
jest.mock("../src/claude", () => ({
  generatePronunciationSet: (...args: unknown[]) => mockGenPron(...args),
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

function set(over: Partial<PronunciationSet> = {}): PronunciationSet {
  return {
    createdAt: "2026-09-10T08:00:00.000Z",
    items: [
      { arabic: "عَيْن", transliteration: "ayn", turkish: "göz", tip: "Boğazdan ع." },
      { arabic: "بَاب", transliteration: "bâb", turkish: "kapı", tip: "Düz b." },
    ],
    minimalPairs: [
      {
        a: { word: "قَلْب", translit: "kalb" },
        b: { word: "كَلْب", translit: "kelb" },
        focus: "ق vs ك",
        tip: "ق dilin kökünden çıkar.",
        playIndex: 0,
      },
    ],
    ...over,
  };
}

type Btn = { text?: string; onPress?: () => void; style?: string };
const alerts: { title?: string; body?: string; buttons?: Btn[] }[] = [];
function lastAlert() {
  return alerts[alerts.length - 1];
}
function pressAlert(label: RegExp) {
  const btn = lastAlert()?.buttons?.find((b) => label.test(b.text ?? ""));
  if (!btn) throw new Error(`Uyarıda "${label}" düğmesi yok: ${JSON.stringify(lastAlert())}`);
  act(() => {
    btn.onPress?.();
  });
}

function hear(text: string) {
  const d = (global as unknown as { __dictation: { opts: { onResult: (t: string) => void } } })
    .__dictation;
  act(() => {
    d.opts.onResult(text);
  });
}

beforeEach(async () => {
  alerts.length = 0;
  mockGenPron.mockReset();
  mockGenPron.mockImplementation(async () => set());
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  jest
    .spyOn(Alert, "alert")
    .mockImplementation((title?: string, body?: string, buttons?: Btn[]) => {
      alerts.push({ title, body, buttons });
    });
});

async function open() {
  render(<PronunciationScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.queryByText(/hazırlıyor/)).toBeNull());
}

/** Kulak turunu atlayıp kayıt turuna geçer. */
async function toRecordingRound() {
  fireEvent.press(screen.getByText(/Doğru|kalb/i)); // tek soruyu cevapla
  await waitFor(() => expect(screen.getByText(/Sonraki ›/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Sonraki ›/));
  await waitFor(() => expect(screen.getByText(/Kayıt turuna geç/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Kayıt turuna geç/));
  await waitFor(() => expect(screen.getByText(/Basılı tut/)).toBeTruthy());
}

// --- para -------------------------------------------------------------------

test("set YOKKEN ekranı açmak istek harcamaz, önce sorar", async () => {
  await open();
  await waitFor(() => expect(screen.getByText(/Telaffuz setin hazır değil/)).toBeTruthy());
  expect(screen.getByText(/API isteği/)).toBeTruthy();
  expect(mockGenPron).not.toHaveBeenCalled();
});

test("yeni set ONAY ister; vazgeçilirse istek atılmaz", async () => {
  await savePronunciationSet(set());
  await open();
  fireEvent.press(screen.getByText(/Yeni Set/));
  pressAlert(/Vazgeç/);
  await act(async () => {});
  expect(mockGenPron).not.toHaveBeenCalled();
});

test("üretim hatasında ekran 'hazırlanıyor'da ASILI KALMAZ, yeniden denenebilir", async () => {
  // Gerçek kusurdu: Alert kapanınca ekran sonsuza kadar yükleniyor kalıyordu.
  mockGenPron.mockRejectedValueOnce(new Error("Kota bitti"));
  await open();
  fireEvent.press(screen.getByText(/Set hazırla/));
  await waitFor(() => expect(screen.getByText(/Kota bitti/)).toBeTruthy());
  expect(screen.getByText(/Tekrar dene/)).toBeTruthy();

  fireEvent.press(screen.getByText(/Tekrar dene/));
  await waitFor(() => expect(screen.getByText(/kulak turu/)).toBeTruthy());
});

// --- HVPT düzeni ------------------------------------------------------------

test("kayıtlı set KULAK turuyla başlar — algı üretimden önce", async () => {
  await savePronunciationSet(set());
  await open();
  await waitFor(() => expect(screen.getByText(/kulak turu 1 \/ 1/)).toBeTruthy());
  expect(screen.getByText(/önce kulak/)).toBeTruthy();
  expect(screen.queryByText(/Basılı tut/)).toBeNull(); // üretim henüz açılmadı
});

test("ayırt etme turu OLMAYAN eski set kayıt turuyla açılır", async () => {
  // Eski kayıtlarda minimalPairs yok; ekran boş kulak turunda kilitlenmemeli.
  await savePronunciationSet(set({ minimalPairs: undefined }));
  await open();
  await waitFor(() => expect(screen.getByText(/kayıt turu 1 \/ 2/)).toBeTruthy());
});

test("cevap KİLİTLENİR ve ayırt etme sayaçları artar", async () => {
  await savePronunciationSet(set());
  await open();
  await waitFor(() => expect(screen.getByText("قَلْب")).toBeTruthy());

  fireEvent.press(screen.getByText("قَلْب")); // playIndex 0, round 0 → doğru
  await waitFor(() => expect(screen.getByText(/Doğru!/)).toBeTruthy());
  fireEvent.press(screen.getByText("كَلْب")); // ikinci deneme yok sayılmalı
  expect(screen.getByText(/Doğru!/)).toBeTruthy();

  await flushStats();
  const stats = await loadStatsSummary();
  expect(stats.total.discrimination).toBe(1);
  expect(stats.total.discriminationCorrect).toBe(1);
});

test("YANLIŞ seçimde çalınan kelime söylenir ve doğru sayılmaz", async () => {
  await savePronunciationSet(set());
  await open();
  await waitFor(() => expect(screen.getByText("كَلْب")).toBeTruthy());
  fireEvent.press(screen.getByText("كَلْب")); // yanlış taraf
  await waitFor(() => expect(screen.getByText(/Çalınan: قَلْب/)).toBeTruthy());

  await flushStats();
  const stats = await loadStatsSummary();
  expect(stats.total.discrimination).toBe(1);
  expect(stats.total.discriminationCorrect ?? 0).toBe(0);
});

test("TEKRAR turunda cevap tarafı ÇEVRİLİR — ezberle geçilemez", async () => {
  // Bu kırılırsa ekran kusursuz görünür ama kulak hiç eğitilmez: öğrenci
  // ikinci turda dinlemeden aynı tarafa basıp geçer.
  await savePronunciationSet(set());
  await open();
  await waitFor(() => expect(screen.getByText("قَلْب")).toBeTruthy());
  fireEvent.press(screen.getByText("قَلْب"));
  await waitFor(() => expect(screen.getByText(/Doğru!/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Sonraki ›/));
  await waitFor(() => expect(screen.getByText(/Kulak turunu tekrarla/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Kulak turunu tekrarla/));

  await waitFor(() => expect(screen.getByText(/kulak turu 1 \/ 1/)).toBeTruthy());
  fireEvent.press(screen.getByText("قَلْب")); // geçen turun doğrusu
  await waitFor(() => expect(screen.getByText(/Çalınan: كَلْب/)).toBeTruthy());
});

test("kulak turu özeti skoru verir ama SUÇLAMAZ", async () => {
  await savePronunciationSet(set());
  await open();
  await waitFor(() => expect(screen.getByText("كَلْب")).toBeTruthy());
  fireEvent.press(screen.getByText("كَلْب")); // yanlış
  fireEvent.press(screen.getByText(/Sonraki ›/));
  await waitFor(() => expect(screen.getByText(/Kulak turu bitti/)).toBeTruthy());
  expect(screen.getByText(/0 \/ 1/)).toBeTruthy();
  expect(screen.getByText(/kulak tekrarla eğitilir/)).toBeTruthy();
});

// --- kayıt turu -------------------------------------------------------------

test("sesli deneme sayılır ve hüküm TELAFFUZ PUANI OLMADIĞINI söyler", async () => {
  await savePronunciationSet(set());
  await open();
  await waitFor(() => expect(screen.getByText("قَلْب")).toBeTruthy());
  await toRecordingRound();

  hear("عين");
  await waitFor(() => expect(screen.getByText(/telaffuz puanı değil/)).toBeTruthy());
  await flushStats();
  const stats = await loadStatsSummary();
  expect(stats.total.spoken).toBe(1);
  expect(stats.total.spokenCorrect).toBe(1);
});

test("ANLAŞILMAYAN deneme konuşma sayar ama DOĞRU saymaz", async () => {
  await savePronunciationSet(set());
  await open();
  await waitFor(() => expect(screen.getByText("قَلْب")).toBeTruthy());
  await toRecordingRound();

  hear("شجرة"); // hedefle alakasız
  await waitFor(() => expect(screen.getByText(/telaffuz puanı değil/)).toBeTruthy());
  await flushStats();
  const stats = await loadStatsSummary();
  expect(stats.total.spoken).toBe(1);
  expect(stats.total.spokenCorrect ?? 0).toBe(0);
});

test("kelime değişince önceki hüküm SİLİNİR", async () => {
  // Kalan hüküm yeni kelimeye aitmiş gibi okunurdu — sessiz ve yanıltıcı.
  await savePronunciationSet(set());
  await open();
  await waitFor(() => expect(screen.getByText("قَلْب")).toBeTruthy());
  await toRecordingRound();

  hear("عين");
  await waitFor(() => expect(screen.getByText(/telaffuz puanı değil/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Sonraki ›/));
  await waitFor(() => expect(screen.getByText("بَاب")).toBeTruthy());
  expect(screen.queryByText(/telaffuz puanı değil/)).toBeNull();
});

test("kayıt mikrofon İZNİ olmadan başlamaz ve sebebini söyler", async () => {
  const rec = (global as unknown as { __recorder: { permission: boolean; prepared: number } })
    .__recorder;
  rec.permission = false;
  rec.prepared = 0;
  try {
    await savePronunciationSet(set());
    await open();
    await waitFor(() => expect(screen.getByText("قَلْب")).toBeTruthy());
    await toRecordingRound();

    fireEvent.press(screen.getByText(/Kendini kaydet/));
    await waitFor(() => expect(lastAlert()?.title).toMatch(/Mikrofon izni/));
    expect(rec.prepared).toBe(0); // izinsiz kayıt hazırlığı bile yapılmadı
  } finally {
    rec.permission = true;
  }
});
