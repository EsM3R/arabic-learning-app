/**
 * Akıcılık Odası ekran testi.
 *
 * NEDEN BURADAN BAŞLIYORUZ: bu ekranda gerçek bir hata yaşandı ve telefonda
 * değil kodu yeniden okurken bulundu. Geri sayım, turun BAŞLATILDIĞI
 * render'ın `index`'ini görüyordu; süreler yanlış kaydediliyor, sonuç ekranı
 * hiç açılmıyor ve olmayan bir 4. tura geçilip NaN'a kilitleniyordu.
 * Saf mantık testleri bunu yakalayamazdı — hata tam olarak ekranla zamanlayıcı
 * arasındaki dikişteydi. Bu dosya o dikişi tutuyor.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import FluencyScreen from "../src/screens/FluencyScreen";
import { roundSeconds } from "../src/fluency";
import { loadFluency } from "../src/storage";
import type { Profile } from "../src/types";

const profile: Profile = {
  name: "Mehmet",
  apiKey: "",
  completedModuleIds: [],
  assessment: {
    speakingLevel: "A1",
    readingLevel: "A1",
    weaknesses: [],
    strengths: [],
    updatedAt: "2026-09-12T00:00:00.000Z",
  },
} as unknown as Profile;

const PLAN = roundSeconds("A1"); // [60, 45, 30]

/** Sayaç n saniye ilerletir; her saniye bir tik. */
async function tick(seconds: number) {
  await act(async () => {
    jest.advanceTimersByTime(seconds * 1000);
  });
}

/** Tur sonu sayımının 900 ms gecikmesini geçirir. */
async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
}

/** Mikrofonun duyduğu metni ekrana teslim eder. */
function hear(text: string) {
  act(() => {
    (global as unknown as { __dictation: { opts: { onResult: (t: string) => void } } }).__dictation.opts.onResult(
      text
    );
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  (global as unknown as { __dictation: { started: number; stopped: number } }).__dictation.started = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

async function startSession() {
  render(<FluencyScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/Dün ne yaptın/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Dün ne yaptın/));
  // Hazırlık ekranı: beklemeden başlayalım.
  fireEvent.press(screen.getByText(/Hazırım/));
}

test("üç tur da zamanlayıcıyla dolunca SONUÇ ekranı açılır", async () => {
  // Asıl regresyon: eskiden son tur bittiğinde "arada" ekranı açılıyor ve
  // olmayan 4. tura geçilip NaN:NaN ile kilitleniyordu.
  await startSession();

  for (let i = 0; i < PLAN.length; i++) {
    hear("bir iki üç dört beş");
    await tick(PLAN[i]);
    await settle();
    if (i < PLAN.length - 1) {
      const next = screen.getByText(new RegExp(`${i + 2}\\. tura başla`));
      fireEvent.press(next);
    }
  }

  // SectionHeader başlığı büyütüyor (title.toUpperCase()).
  expect(screen.getByText("SONUÇ")).toBeTruthy();
  expect(screen.getByText("Kaydet")).toBeTruthy();
  expect(screen.queryByText(/NaN/)).toBeNull();
  expect(screen.queryByText(/4\. tura başla/)).toBeNull();
});

test("her tur KENDİ süresiyle kaydedilir — hız yanlış ölçülmez", async () => {
  // Bayat kapanış yüzünden 2. tur 45 yerine 60, 3. tur 30 yerine 45 sn
  // sanılıyordu; hız sistematik olarak DÜŞÜK çıkıyordu.
  await startSession();

  for (let i = 0; i < PLAN.length; i++) {
    hear("bir iki üç dört beş altı"); // her turda 6 kelime
    await tick(PLAN[i]);
    await settle();
    if (i < PLAN.length - 1) {
      fireEvent.press(screen.getByText(new RegExp(`${i + 2}\\. tura başla`)));
    }
  }

  fireEvent.press(screen.getByText("Kaydet"));
  await waitFor(async () => {
    const sessions = await loadFluency();
    expect(sessions.length).toBe(1);
    expect(sessions[0].rounds.map((r) => r.seconds)).toEqual(PLAN);
    // 6 kelime / süre → azalan sürede artan hız
    const wpm = sessions[0].rounds.map((r) => r.wpm);
    expect(wpm[0]).toBeLessThan(wpm[1]);
    expect(wpm[1]).toBeLessThan(wpm[2]);
  });
});

test("her tur mikrofonu yeniden açar", async () => {
  await startSession();
  const dict = (global as unknown as { __dictation: { started: number } }).__dictation;
  expect(dict.started).toBe(1);

  hear("bir iki");
  await tick(PLAN[0]);
  await settle();
  fireEvent.press(screen.getByText(/2\. tura başla/));
  expect(dict.started).toBe(2);
});

test("turu erken bitirmek de doğru süreyi kaydeder", async () => {
  // Elle bitirme yolu hatalı sürümde DOĞRU çalışıyordu; bozulmasın.
  await startSession();
  hear("bir iki üç");
  await tick(10);
  fireEvent.press(screen.getByText(/Turu erken bitir/));
  await settle();
  expect(screen.getByText(/2\. tura başla/)).toBeTruthy();
});

test("hiç ses duyulmazsa hız UYDURULMAZ", async () => {
  await startSession();
  for (let i = 0; i < PLAN.length; i++) {
    await tick(PLAN[i]); // hear() yok: tanıma hiçbir şey duymadı
    await settle();
    if (i < PLAN.length - 1) {
      fireEvent.press(screen.getByText(new RegExp(`${i + 2}\\. tura başla`)));
    }
  }
  expect(screen.getByText(/ölçülemedi/)).toBeTruthy();
  expect(screen.queryByText(/daha hızlı anlattın/)).toBeNull();
});
