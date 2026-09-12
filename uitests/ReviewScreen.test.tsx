/**
 * Kelime Defteri ekran testi.
 *
 * Burası uygulamanın ÖĞRENME MOTORU: FSRS takvimi buradaki notlarla ilerler.
 * Yanlış notlanan bir kart sessizce yanlış tarihe atılır — ne hata çıkar ne
 * uyarı; öğrenci aylar sonra "bunu biliyordum, niye hiç sormuyor" ya da
 * tersini yaşar. Bu yüzden buradaki kural şu: KANITA dayanan not otomatik,
 * kanıtsız not öğrenciye bırakılır.
 *
 * Test edilen dikişler:
 * - yeni kart önce TANIMA yönünde görülür (görmeden üretim istenmez),
 * - doğru üretim otomatik "Bildim" verir ve takvimi ilerletir,
 * - tanıma yönündeki sesli deneme kartı NOTLAMAZ (kelime ekranda duruyor),
 * - bilinemeyen kart oturum içinde geri döner,
 * - sayaçlar doğru artar.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import ReviewScreen from "../src/screens/ReviewScreen";
import { setActiveLanguage } from "../src/languages";
import { loadVocab, saveVocab } from "../src/storage";
import { loadStatsSummary } from "../src/statsStore";
import type { VocabCard } from "../src/types";

let seq = 0;
function card(over: Partial<VocabCard> = {}): VocabCard {
  seq += 1;
  return {
    id: `v${seq}`,
    arabic: "بَيْت",
    transliteration: "beyt",
    turkish: "ev",
    track: "okuma",
    addedAt: "2026-09-01T10:00:00.000Z",
    due: "2026-09-01T10:00:00.000Z", // vadesi geçmiş → kuyruğa girer
    intervalDays: 1,
    ease: 2.5,
    reps: 3,
    lapses: 0,
    ...over,
  } as VocabCard;
}

function hear(text: string) {
  const d = (global as unknown as { __dictation: { opts: { onResult: (t: string) => void } } })
    .__dictation;
  act(() => {
    d.opts.onResult(text);
  });
}

async function open() {
  render(<ReviewScreen onBack={() => {}} />);
  await waitFor(() => expect(screen.queryByText(/Kelime Defteri/)).toBeTruthy());
}

beforeEach(async () => {
  seq = 0;
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
});

test("defter boşken suçlayıcı değil YÖNLENDİRİCİ mesaj çıkar", async () => {
  await open();
  await waitFor(() => expect(screen.getByText(/Defter henüz boş/)).toBeTruthy());
  expect(screen.getByText(/ders yaptıkça/)).toBeTruthy();
});

test("HİÇ çalışılmamış kart önce TANIMA yönünde gösterilir", async () => {
  // Görmediği kelimeyi üretmesini istemek öğrenciyi boşuna yıldırır.
  await saveVocab([card({ reps: 0 })]);
  await open();
  await waitFor(() => expect(screen.getByText(/Yeni kelime — önce tanı/)).toBeTruthy());
  expect(screen.getByText("بَيْت")).toBeTruthy();
});

test("çalışılmış kart ÜRETİM yönünde sorulur — Türkçesi gösterilir, hedef gizlenir", async () => {
  await saveVocab([card({ reps: 5, turkish: "ev" })]);
  await open();
  await waitFor(() => expect(screen.queryByText(/Yeni kelime/)).toBeNull());
  expect(screen.getByText("ev")).toBeTruthy();
  expect(screen.queryByText("بَيْت")).toBeNull(); // cevap sızmamalı
});

test("DOĞRU üretim otomatik 'Bildim' verir ve takvimi ilerletir", async () => {
  // Eşleşme kanıttır: öğrenciye ayrıca "bildin mi?" diye sormak hem gereksiz
  // bir dokunuş hem de dürüstlüğü sınayan sahte bir soru olurdu.
  await saveVocab([card({ reps: 5, arabic: "بَيْت", turkish: "ev" })]);
  const before = (await loadVocab())[0];
  await open();
  await waitFor(() => expect(screen.getByText("Kontrol Et")).toBeTruthy());

  fireEvent.changeText(screen.getByPlaceholderText(/yaz/i), "بيت");
  fireEvent.press(screen.getByText("Kontrol Et"));

  await waitFor(() => expect(screen.getByText(/Doğru!/)).toBeTruthy());
  await waitFor(async () => {
    const after = (await loadVocab())[0];
    expect(after.reps).toBeGreaterThan(before.reps);
    expect(new Date(after.due).getTime()).toBeGreaterThan(new Date(before.due).getTime());
  });
});

test("OKUNUŞLA yazan da doğru sayılır ve bu söylenir", async () => {
  // Arap klavyesi olmayan öğrenci okunuşla yazarak da kelimeyi geri çağırmış
  // olur; amaç yazım sınavı değil.
  await saveVocab([card({ reps: 5, arabic: "بَيْت", transliteration: "beyt", turkish: "ev" })]);
  await open();
  await waitFor(() => expect(screen.getByText("Kontrol Et")).toBeTruthy());
  fireEvent.changeText(screen.getByPlaceholderText(/yaz/i), "beyt");
  fireEvent.press(screen.getByText("Kontrol Et"));
  await waitFor(() => expect(screen.getByText(/okunuşuyla yazdın/)).toBeTruthy());
});

test("YANLIŞ cevapta otomatik not VERİLMEZ, öğrenciye bırakılır", async () => {
  await saveVocab([card({ reps: 5, arabic: "بَيْت", turkish: "ev" })]);
  const before = (await loadVocab())[0];
  await open();
  await waitFor(() => expect(screen.getByText("Kontrol Et")).toBeTruthy());
  fireEvent.changeText(screen.getByPlaceholderText(/yaz/i), "شَجَرَة");
  fireEvent.press(screen.getByText("Kontrol Et"));

  await waitFor(() => expect(screen.getByText(/Doğrusu:/)).toBeTruthy());
  const after = (await loadVocab())[0];
  expect(after.reps).toBe(before.reps); // kart notlanmadı
  expect(screen.getByText(/Bilemedim/)).toBeTruthy(); // not sırası öğrencide
});

test("bilinemeyen kart oturum İÇİNDE geri döner", async () => {
  // Unutulan kelimeyi ertesi güne bırakmak, o oturumun kazancını çöpe atar.
  await saveVocab([card({ reps: 5, turkish: "ev" }), card({ reps: 5, turkish: "kapı" })]);
  await open();
  await waitFor(() => expect(screen.getByText("0 / 2")).toBeTruthy());

  fireEvent.press(screen.getByText("Kontrol Et"));
  fireEvent.changeText(screen.getByPlaceholderText(/yaz/i), "yanlış");
  fireEvent.press(screen.getByText("Kontrol Et"));
  await waitFor(() => expect(screen.getByText(/Bilemedim/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Bilemedim/));

  // Kart kuyruğun sonuna döndü: toplam azalmadı.
  await waitFor(() => expect(screen.getByText("0 / 2")).toBeTruthy());
});

test("TANIMA yönündeki sesli deneme kartı NOTLAMAZ", async () => {
  // Kelime ekranda duruyor: okuyup söylemek hatırlama değil telaffuz
  // denemesidir. Notlansaydı takvim sahte kanıtla ilerlerdi.
  await saveVocab([card({ reps: 0, arabic: "بَيْت" })]);
  const before = (await loadVocab())[0];
  await open();
  await waitFor(() => expect(screen.getByText(/Yeni kelime/)).toBeTruthy());

  hear("بيت");
  await waitFor(async () => {
    const stats = await loadStatsSummary();
    expect(stats.total.spoken).toBeGreaterThan(0);
  });
  const after = (await loadVocab())[0];
  expect(after.reps).toBe(before.reps);
  expect(after.due).toBe(before.due);
});

test("ÜRETİM yönünde doğru sesli cevap hem notlar hem üretim sayar", async () => {
  await saveVocab([card({ reps: 5, arabic: "بَيْت", transliteration: "beyt" })]);
  const before = (await loadVocab())[0];
  await open();
  await waitFor(() => expect(screen.getByText("Kontrol Et")).toBeTruthy());

  hear("بيت");
  await waitFor(async () => {
    const after = (await loadVocab())[0];
    expect(after.reps).toBeGreaterThan(before.reps);
  });
  const stats = await loadStatsSummary();
  expect(stats.total.spokenCorrect).toBeGreaterThan(0);
  expect(stats.total.produced).toBeGreaterThan(0);
});

test("ses tanıma hükmü 'Doğru' değil ANLAŞILDI der", async () => {
  // Ölçülen şey telaffuz puanı değil anlaşılırlık; "doğru telaffuz ettin"
  // demek öğrenciye yalan söylemek olurdu.
  await saveVocab([card({ reps: 0, arabic: "بَيْت" })]);
  await open();
  await waitFor(() => expect(screen.getByText(/Yeni kelime/)).toBeTruthy());
  hear("بيت");
  await waitFor(() => expect(screen.getByText(/Anlaşıldı/)).toBeTruthy());
  expect(screen.getByText(/telaffuz puanı değil/)).toBeTruthy();
});

test("vadesi GELMEMİŞ kart oturuma girmez", async () => {
  const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
  await saveVocab([card({ due: future })]);
  await open();
  await waitFor(() => expect(screen.getByText(/Bugünlük bitti/)).toBeTruthy());
});
