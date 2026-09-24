/**
 * Kurulum ekranı testi.
 *
 * Uygulamanın tek "bir kez görülen" ekranı ve tam da bu yüzden kusuru en geç
 * fark edilen yeri: bozulduğunda kimse ders ortasında yakalamaz, yeni kurulum
 * yapan kişi doğrudan kapıda kalır. Buradan çıkan dört değerin (ad, anahtar,
 * dil, sağlayıcı) hepsi uygulamanın geri kalanının dayandığı temel; biri
 * yanlış taşınırsa hata kurulumda değil GÜNLER SONRA başka bir ekranda
 * çıkar ve sebebi hiç bulunamaz.
 *
 * Anahtar öneki denetimi de burada önemli: yanlış anahtarla kurulumu
 * bitiren kişi ilk dersinde anlaşılmaz bir ağ hatası görür.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import SetupScreen from "../src/screens/SetupScreen";

type Btn = { text?: string; onPress?: () => void; style?: string };
const alerts: { title?: string; body?: string }[] = [];
function lastAlert() {
  return alerts[alerts.length - 1];
}

const done: { name: string; key: string; lang: string; provider: string; voiceKey?: string }[] = [];

beforeEach(() => {
  alerts.length = 0;
  done.length = 0;
  jest
    .spyOn(Alert, "alert")
    .mockImplementation((title?: string, body?: string, _b?: Btn[]) => {
      alerts.push({ title, body });
    });
});

function open() {
  render(
    <SetupScreen
      onDone={(name, key, lang, provider, voiceKey) =>
        done.push({ name, key, lang, provider, voiceKey })
      }
    />
  );
}

/** Son adıma (bağlantı) kadar ilerler. */
async function toLastStep() {
  open();
  for (let i = 0; i < 3; i += 1) {
    fireEvent.press(screen.getByText("Devam"));
  }
  await waitFor(() => expect(screen.getByPlaceholderText(/örn\. Mehmet/)).toBeTruthy());
}

test("adımlar sırayla ilerler ve GERİ dönülebilir", async () => {
  open();
  expect(screen.queryByText("Geri")).toBeNull(); // ilk adımda geri yok
  fireEvent.press(screen.getByText("Devam"));
  await waitFor(() => expect(screen.getByText("Geri")).toBeTruthy());
  fireEvent.press(screen.getByText("Geri"));
  await waitFor(() => expect(screen.queryByText("Geri")).toBeNull());
});

test("ADSIZ kurulum bitmez", async () => {
  await toLastStep();
  fireEvent.changeText(screen.getByPlaceholderText(/^sk-…$/), "sk-x");
  fireEvent.press(screen.getByText(/Başlayalım/));
  expect(lastAlert()?.title).toMatch(/Eksik bilgi/);
  expect(done).toHaveLength(0);
});

test("ANAHTARSIZ kurulum bitmez", async () => {
  await toLastStep();
  fireEvent.changeText(screen.getByPlaceholderText(/örn\. Mehmet/), "Mehmet");
  fireEvent.press(screen.getByText(/Başlayalım/));
  expect(lastAlert()?.title).toMatch(/Anahtar eksik/);
  expect(done).toHaveLength(0);
});

test("ÖNEKİ tutmayan anahtar kapıda yakalanır — ilk derste değil", async () => {
  await toLastStep();
  fireEvent.changeText(screen.getByPlaceholderText(/örn\. Mehmet/), "Mehmet");
  fireEvent.changeText(screen.getByPlaceholderText(/^sk-…$/), "yanlis");
  fireEvent.press(screen.getByText(/Başlayalım/));
  expect(lastAlert()?.title).toMatch(/hatalı görünüyor/);
  expect(lastAlert()?.body).toMatch(/"sk-"/); // ne beklendiğini de söyler
  expect(done).toHaveLength(0);
});

test("dört değer de OLDUĞU GİBİ dışarı verilir", async () => {
  // Boşluklar kırpılmalı: kopyalanan anahtarın sonundaki boşluk, günler sonra
  // anlaşılmaz bir kimlik hatası olarak geri döner.
  await toLastStep();
  fireEvent.changeText(screen.getByPlaceholderText(/örn\. Mehmet/), "  Mehmet  ");
  fireEvent.changeText(screen.getByPlaceholderText(/^sk-…$/), " sk-abc ");
  fireEvent.press(screen.getByText(/Başlayalım/));

  expect(done).toHaveLength(1);
  expect(done[0].name).toBe("Mehmet");
  expect(done[0].key).toBe("sk-abc");
  expect(done[0].lang).toBe("ar"); // varsayılan dil
  expect(done[0].provider).toBe("deepseek"); // varsayılan beyin: en ucuz
});

test("seçilen DİL kuruluma taşınır", async () => {
  open();
  fireEvent.press(screen.getByText("Devam"));
  fireEvent.press(screen.getByText("Devam"));
  await waitFor(() => expect(screen.getByText(/Rusça/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Rusça/));
  fireEvent.press(screen.getByText("Devam"));

  await waitFor(() => expect(screen.getByPlaceholderText(/örn\. Mehmet/)).toBeTruthy());
  fireEvent.changeText(screen.getByPlaceholderText(/örn\. Mehmet/), "Mehmet");
  fireEvent.changeText(screen.getByPlaceholderText(/^sk-…$/), "sk-abc");
  fireEvent.press(screen.getByText(/Başlayalım/));

  expect(done[0].lang).toBe("ru");
});

test("seçilen SAĞLAYICI kuruluma taşınır ve öneki ona göre denetlenir", async () => {
  await toLastStep();
  fireEvent.press(screen.getByText("Google Gemini"));
  fireEvent.changeText(screen.getByPlaceholderText(/örn\. Mehmet/), "Mehmet");
  // Gemini anahtarlarının öneki yok: sk- ile başlamayan anahtar kabul edilmeli.
  fireEvent.changeText(screen.getByPlaceholderText(/anahtarı yapıştır/), "AIza-bir-anahtar");
  fireEvent.press(screen.getByText(/Başlayalım/));

  expect(done).toHaveLength(1);
  expect(done[0].provider).toBe("gemini");
  expect(done[0].key).toBe("AIza-bir-anahtar");
});

test("ses için OpenAI anahtarı İSTEĞE BAĞLI verilebilir — beyin DeepSeek kalır", async () => {
  // Varsayılan kombinasyon: DeepSeek beyin + OpenAI ses. Kurulumda ikinci
  // anahtar isteğe bağlı; boş bırakan telefon sesiyle başlar.
  await toLastStep();
  fireEvent.changeText(screen.getByPlaceholderText(/örn\. Mehmet/), "Mehmet");
  fireEvent.changeText(screen.getByPlaceholderText(/^sk-…$/), "sk-deepseek");
  fireEvent.changeText(screen.getByPlaceholderText(/telefon sesi/), " sk-openai ");
  fireEvent.press(screen.getByText(/Başlayalım/));
  expect(done[0].provider).toBe("deepseek");
  expect(done[0].key).toBe("sk-deepseek");
  expect(done[0].voiceKey).toBe("sk-openai");
});

test("beyin OpenAI seçilince ayrı ses anahtarı SORULMAZ — aynı anahtar", async () => {
  await toLastStep();
  fireEvent.press(screen.getByText("OpenAI (ChatGPT)"));
  expect(screen.queryByPlaceholderText(/telefon sesi/)).toBeNull();
});
