/**
 * Seviye Raporu testi.
 *
 * Bu ekran bir düzeltmenin ürünü: hoca güçlü/zayıf yönleri ve özeti her derse
 * hafıza olarak besliyordu ama öğrenci onları HİÇ görmüyordu — panelde
 * yalnızca iki harf vardı. Ekranın tek işi o gizli değerlendirmeyi görünür
 * kılmak; bir alan sessizce düşerse ekran yine "çalışır" görünür ve öğrenci
 * hocanın kendisi hakkında ne düşündüğünü bir daha öğrenemez.
 */
import { render, screen } from "@testing-library/react-native";
import React from "react";
import LevelScreen from "../src/screens/LevelScreen";
import { setActiveLanguage } from "../src/languages";
import type { Assessment, Curriculum, Profile } from "../src/types";

function assessment(over: Partial<Assessment> = {}): Assessment {
  return {
    speakingLevel: "A2",
    readingLevel: "B1",
    strengths: ["Harf tanıma sağlam"],
    weaknesses: ["İ'râb sonları"],
    summary: "Okuman konuşmanın önünde.",
    ...over,
  };
}

function curriculum(): Curriculum {
  return {
    generatedAt: "2026-09-01T00:00:00.000Z",
    modules: [
      { id: "k1", track: "konusma", title: "K1", description: "", level: "A2", objectives: [] },
      { id: "k2", track: "konusma", title: "K2", description: "", level: "A2", objectives: [] },
      { id: "o1", track: "okuma", title: "O1", description: "", level: "B1", objectives: [] },
    ],
  };
}

function profile(over: Partial<Profile> = {}): Profile {
  return {
    name: "Mehmet",
    apiKey: "sk-ant-x",
    completedModuleIds: ["k1"],
    assessment: assessment(),
    curriculum: curriculum(),
    ...over,
  } as unknown as Profile;
}

beforeEach(() => {
  setActiveLanguage("ar");
});

function open(p: Profile = profile()) {
  render(<LevelScreen profile={p} onBack={() => {}} />);
}

test("değerlendirme yokken suçlayıcı değil AÇIKLAYICI mesaj çıkar", () => {
  open(profile({ assessment: undefined } as unknown as Partial<Profile>));
  expect(screen.getByText(/Henüz değerlendirme yok/)).toBeTruthy();
  expect(screen.getByText(/derslerde tanıdıkça/)).toBeTruthy();
});

test("iki parkurun seviyesi AYRI gösterilir", () => {
  // Tek bir "seviye" göstermek yanıltıcı olurdu: okuma ile konuşma bu
  // uygulamada bilerek ayrı ilerliyor.
  open();
  expect(screen.getByText("A2")).toBeTruthy();
  expect(screen.getByText("B1")).toBeTruthy();
});

test("modül ilerlemesi PARKUR BAŞINA sayılır", () => {
  open();
  expect(screen.getByText("1/2 modül")).toBeTruthy(); // konuşma: k1 bitti
  expect(screen.getByText("0/1 modül")).toBeTruthy(); // okuma
});

test("hocanın ÖZETİ öğrenciye gösterilir", () => {
  // Bu metin zaten her derse besleniyordu; görünmemesi asıl kusurdu.
  open();
  expect(screen.getByText(/Okuman konuşmanın önünde/)).toBeTruthy();
});

test("güçlü ve zayıf yönler LİSTELENİR", () => {
  open();
  expect(screen.getByText(/Harf tanıma sağlam/)).toBeTruthy();
  expect(screen.getByText(/İ'râb sonları/)).toBeTruthy();
  expect(screen.getByText(/düzeldikçe/)).toBeTruthy(); // liste kalıcı değil
});

test("boş listeler ve boş özet ekranı ÇÖKERTMEZ", () => {
  // Eski ya da elle düzenlenmiş bir profilde bu alanlar hiç olmayabilir.
  open(
    profile({
      assessment: { speakingLevel: "A1", readingLevel: "A1" } as unknown as Assessment,
    })
  );
  expect(screen.getAllByText("A1")).toHaveLength(2);
});

test("müfredat yokken de rapor açılır", () => {
  open(profile({ curriculum: undefined } as unknown as Partial<Profile>));
  expect(screen.getByText("A2")).toBeTruthy();
  expect(screen.getAllByText("0/0 modül")).toHaveLength(2); // iki parkur da boş
});
