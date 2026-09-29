/**
 * Hata Defteri testi.
 *
 * Küçük ekran ama tek işi var ve o iş yanlış yapılırsa fark edilmez:
 * kayıtları DOĞRU SIRADA ve TAM göstermek. Hocanın yazdığı hata, düzeltme ve
 * gerekçe üçlüsünden biri ekrana gelmezse kart işe yaramaz — kişi neyi
 * yanlış yaptığını ya neyin doğru olduğunu bilemez. Çözülmüş kayıtlar da
 * silinmez: neyi aştığını görmek, defterin yarısı kadar değerlidir.
 */
import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import MistakesScreen from "../src/screens/MistakesScreen";
import { setActiveLanguage } from "../src/languages";
import { saveMistakes } from "../src/storage";
import type { MistakeEntry } from "../src/types";

function mistake(over: Partial<MistakeEntry> = {}): MistakeEntry {
  return {
    id: "m1",
    topic: "i'râb",
    mistake: "الكتابُ",
    correction: "الكتابَ",
    explanation: "Mef'ûl mansûbtur.",
    resolved: false,
    createdAt: "2026-09-01T10:00:00.000Z",
    timesSeen: 1,
    ...over,
  } as MistakeEntry;
}

beforeEach(async () => {
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
});

async function open() {
  render(<MistakesScreen onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/Hata Defteri/)).toBeTruthy());
}

test("defter boşken suçlayıcı değil AÇIKLAYICI mesaj çıkar", async () => {
  await open();
  await waitFor(() => expect(screen.getByText(/Defter tertemiz/)).toBeTruthy());
  expect(screen.getByText(/hocan buraya kendisi kaydedecek/)).toBeTruthy();
});

test("kartın ÜÇ parçası da görünür: hata, düzeltme, gerekçe", async () => {
  // Biri eksik kalırsa kart öğretmez; sadece "bir şeyi yanlış yaptın" der.
  await saveMistakes([mistake()]);
  await open();
  await waitFor(() => expect(screen.getByText(/الكتابُ/)).toBeTruthy());
  expect(screen.getByText(/الكتابَ/)).toBeTruthy();
  expect(screen.getByText(/Mef'ûl mansûbtur/)).toBeTruthy();
  expect(screen.getByText("i'râb")).toBeTruthy();
});

test("EN YENİ kayıt üstte olur", async () => {
  await saveMistakes([
    mistake({ id: "m1", topic: "eski konu" }),
    mistake({ id: "m2", topic: "yeni konu" }),
  ]);
  await open();
  const topics = await waitFor(() => screen.getAllByText(/konu$/i));
  expect(topics[0].props.children).toBe("yeni konu");
});

test("ÇÖZÜLMÜŞ kayıt silinmez, işaretlenir", async () => {
  // Neyi aştığını görmek defterin yarısı kadar değerli.
  await saveMistakes([mistake({ resolved: true })]);
  await open();
  await waitFor(() => expect(screen.getByText(/ÇÖZÜLDÜ/)).toBeTruthy());
  expect(screen.getByText(/الكتابُ/)).toBeTruthy();
});

test("başlıktaki sayaç kayıt sayısını söyler", async () => {
  await saveMistakes([mistake({ id: "m1" }), mistake({ id: "m2" }), mistake({ id: "m3" })]);
  await open();
  await waitFor(() => expect(screen.getByText("3 kayıt")).toBeTruthy());
});
