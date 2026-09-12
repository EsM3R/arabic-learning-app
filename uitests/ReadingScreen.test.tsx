/**
 * Okuma Salonu ekran testi.
 *
 * Burada iki ayrı türden zarar mümkün ve ikisi de sessiz:
 *
 * 1) PARA. Metin üretimi uygulamanın API isteği harcayan tek elle tetiklenen
 *    yeri. Onay kutusu kazara çalışmazsa öğrencinin parası, hiçbir uyarı
 *    vermeden, her dokunuşta harcanır. Bu yüzden "vazgeç gerçekten vazgeçer"
 *    ve "ekranı açmak tek başına istek harcamaz" burada teste bağlanmıştır.
 *
 * 2) ÖĞRENME. Metnin değeri çevirinin GİZLİ olmasında: önce anlamaya çalışmak
 *    egzersizin kendisi. Çeviri sızarsa ekran çalışıyor görünür ama iş
 *    yapmaz. Aynı şekilde kilitlenmeyen bir test sorusu, skoru anlamsız
 *    kılar — deneme yanılmayla herkes 3/3 alır.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import ReadingScreen from "../src/screens/ReadingScreen";
import { setActiveLanguage } from "../src/languages";
import { loadReadings, loadVocab, saveReadings, saveVocab } from "../src/storage";
import { flushStats, loadStatsSummary } from "../src/statsStore";
import type { Profile, ReadingText, VocabCard } from "../src/types";

/** Üretimi taklit et: gerçek istek atılmaz, ÇAĞRILDI MI ölçülür. */
const mockGen = jest.fn();
jest.mock("../src/claude", () => ({
  generateReadingText: (...args: unknown[]) => mockGen(...args),
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

let seq = 0;
function text(over: Partial<ReadingText> = {}): ReadingText {
  seq += 1;
  return {
    id: `r${seq}`,
    topic: "kahvaltı",
    level: "A2",
    length: "orta",
    coldStart: false,
    createdAt: "2026-09-10T08:00:00.000Z",
    knownRatio: 0.96,
    complianceRatio: 0.98,
    unplannedUnknown: [],
    reviewCardIds: [],
    addedWordIds: [],
    title: "فِي البَيْت",
    titleTr: "Evde",
    sentences: [
      { target: "البَيْتُ كَبِيرٌ.", translit: "el-beytu kebîrun", tr: "Ev büyüktür." },
      { target: "فِي البَيْتِ بَابٌ.", translit: "fi'l-beyti bâbun", tr: "Evde bir kapı var." },
    ],
    newWords: [
      { word: "نَافِذَة", translit: "nâfize", tr: "pencere", hint: "Duvarda, camlı." },
    ],
    usedReviewWords: ["بَيْت"],
    questions: [
      { q: "Ev nasıl?", choices: ["Küçük", "Büyük", "Eski"], answer: 1 },
    ],
    productionTask: { instruction: "Kendi evini iki cümleyle anlat.", example: "بَيْتِي كَبِيرٌ." },
    ...over,
  } as ReadingText;
}

function vocabCard(over: Partial<VocabCard> = {}): VocabCard {
  return {
    id: "v1",
    arabic: "نافذة",
    transliteration: "nâfize",
    turkish: "pencere",
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

// --- Alert kancası: onay kutusunu testten SÜRÜYORUZ -------------------------
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

beforeEach(async () => {
  seq = 0;
  alerts.length = 0;
  mockGen.mockReset();
  mockGen.mockImplementation(async () => text({ id: "yeni", titleTr: "Yeni metin" }));
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  jest
    .spyOn(Alert, "alert")
    .mockImplementation((title?: string, body?: string, buttons?: Btn[]) => {
      alerts.push({ title, body, buttons });
    });
});

async function openLibrary() {
  render(<ReadingScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.queryByText(/Okuma Salonu/)).toBeTruthy());
}

/** Kütüphaneden ilk metni açar. */
async function openReader(t: ReadingText) {
  await saveReadings([t]);
  await openLibrary();
  await waitFor(() => expect(screen.getByText(t.titleTr)).toBeTruthy());
  fireEvent.press(screen.getByText(t.titleTr));
  await waitFor(() => expect(screen.getByText(/Baştan dinle/)).toBeTruthy());
}

// --- para ------------------------------------------------------------------

test("ekranı AÇMAK tek başına hiçbir API isteği harcamaz", async () => {
  // Kütüphane cihazdan okunur; üretim yalnızca elle tetiklenir.
  await saveReadings([text()]);
  await openLibrary();
  expect(mockGen).not.toHaveBeenCalled();
});

test("üretim ONAY ister ve maliyeti SÖYLER", async () => {
  await openLibrary();
  fireEvent.press(screen.getByText(/Yeni/));
  fireEvent.press(screen.getByText(/Metni hazırla/));
  expect(lastAlert()?.body).toMatch(/API isteği/);
  expect(mockGen).not.toHaveBeenCalled(); // onaydan ÖNCE hiçbir şey olmadı
});

test("VAZGEÇ gerçekten vazgeçer — istek atılmaz", async () => {
  await openLibrary();
  fireEvent.press(screen.getByText(/Yeni/));
  fireEvent.press(screen.getByText(/Metni hazırla/));
  pressAlert(/Vazgeç/);
  await act(async () => {});
  expect(mockGen).not.toHaveBeenCalled();
});

test("onaylanan üretim metni KAYDEDER ve okuyucuyu açar", async () => {
  await openLibrary();
  fireEvent.press(screen.getByText(/Yeni/));
  fireEvent.press(screen.getByText(/Metni hazırla/));
  pressAlert(/Evet/);

  await waitFor(() => expect(mockGen).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByText(/Baştan dinle/)).toBeTruthy());
  // Harcanan istek diske düşmeli: uygulama kapanırsa metin kaybolmamalı.
  await waitFor(async () => expect(await loadReadings()).toHaveLength(1));
});

test("üretim HATA verirse hata gösterilir ve yarım metin kaydedilmez", async () => {
  mockGen.mockRejectedValueOnce(new Error("İnternet yok"));
  await openLibrary();
  fireEvent.press(screen.getByText(/Yeni/));
  fireEvent.press(screen.getByText(/Metni hazırla/));
  pressAlert(/Evet/);

  await waitFor(() => expect(screen.getByText(/İnternet yok/)).toBeTruthy());
  expect(await loadReadings()).toHaveLength(0);
});

// --- okuma ------------------------------------------------------------------

test("çeviri GİZLİ başlar — egzersiz anlamaya çalışmaktır", async () => {
  await openReader(text());
  expect(screen.getByText("البَيْتُ كَبِيرٌ.")).toBeTruthy();
  expect(screen.queryByText(/Ev büyüktür/)).toBeNull();
  expect(screen.getAllByText(/çeviri için dokun/).length).toBeGreaterThan(0);
});

test("cümleye dokununca çeviri açılır, tekrar dokununca KAPANIR", async () => {
  await openReader(text());
  fireEvent.press(screen.getByText("البَيْتُ كَبِيرٌ."));
  await waitFor(() => expect(screen.getByText(/Ev büyüktür/)).toBeTruthy());
  fireEvent.press(screen.getByText("البَيْتُ كَبِيرٌ."));
  await waitFor(() => expect(screen.queryByText(/Ev büyüktür/)).toBeNull());
});

test("dinleme her cümleyi SAYAR ve sonunda takip biter", async () => {
  const Speech = require("expo-speech");
  Speech.speak.mockImplementation((_t: string, o: { onDone?: () => void }) => o.onDone?.());
  await openReader(text());
  fireEvent.press(screen.getByText(/Baştan dinle/));
  await act(async () => {});
  await flushStats();
  const stats = await loadStatsSummary();
  expect(stats.total.readSentence).toBe(2); // iki cümle okundu
  Speech.speak.mockImplementation(() => {});
});

// --- sorular ----------------------------------------------------------------

test("cevap KİLİTLENİR — deneme yanılmayla skor şişirilemez", async () => {
  await openReader(text());
  fireEvent.press(screen.getByText(/Küçük/)); // yanlış
  await waitFor(() => expect(screen.getByText(/✗ Küçük/)).toBeTruthy());
  expect(screen.getByText(/✓ Büyük/)).toBeTruthy(); // doğrusu da gösterilir

  fireEvent.press(screen.getByText(/✓ Büyük/)); // ikinci deneme yok sayılmalı
  await waitFor(() => expect(screen.getByText(/✗ Küçük/)).toBeTruthy());

  // Asıl ölçü ekrandaki işaret değil DİSKE YAZILAN skor: düzeltilebilen bir
  // cevap, tüm anlama ölçümünü değersiz kılardı.
  fireEvent.press(screen.getByText(/Okumayı bitir/));
  await waitFor(async () => expect((await loadReadings())[0].finishedAt).toBeTruthy());
  expect((await loadReadings())[0].quizCorrect).toBe(0);
});

test("sorular bitmeden okuma BİTİRİLEMEZ ve sebebi yazar", async () => {
  await openReader(text());
  const button = screen.getByText(/Önce soruları cevapla/);
  fireEvent.press(button); // devre dışı olmalı: hiçbir şey olmamalı
  await act(async () => {});
  expect((await loadReadings())[0].finishedAt).toBeFalsy();

  fireEvent.press(screen.getByText(/Büyük/));
  await waitFor(() => expect(screen.getByText(/Okumayı bitir/)).toBeTruthy());
});

test("bitirme SKORU diske yazar ve kütüphanede görünür", async () => {
  // Skor kaydedilmezse öğrenci hangi metni bitirdiğini bir daha bilemez.
  await openReader(text());
  fireEvent.press(screen.getByText(/Büyük/)); // doğru
  await waitFor(() => expect(screen.getByText(/Okumayı bitir/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Okumayı bitir/));

  await waitFor(async () => {
    const saved = (await loadReadings())[0];
    expect(saved.finishedAt).toBeTruthy();
    expect(saved.quizCorrect).toBe(1);
    expect(saved.quizTotal).toBe(1);
  });
  await flushStats();
  expect((await loadStatsSummary()).total.readingFinished).toBe(1);

  pressAlert(/Kütüphaneye dön/);
  await waitFor(() => expect(screen.getByText("✅ 1/1")).toBeTruthy());
});

// --- deftere ekleme ---------------------------------------------------------

test("yeni kelime deftere GERÇEKTEN yazılır", async () => {
  await openReader(text());
  fireEvent.press(screen.getByText(/Deftere ekle/));
  await waitFor(async () => {
    const cards = await loadVocab();
    expect(cards).toHaveLength(1);
    expect(cards[0].arabic).toBe("نَافِذَة");
    expect(cards[0].turkish).toBe("pencere");
  });
  await waitFor(() => expect(screen.getByText(/Defterde/)).toBeTruthy());
});

test("zaten defterde olan kelime İKİNCİ KEZ yazılmaz", async () => {
  // Harekesiz/harekeli yazım farkı mükerrer kart üretmemeli.
  await saveVocab([vocabCard()]);
  await openReader(text());
  fireEvent.press(screen.getByText(/Deftere ekle/));
  await waitFor(() => expect(screen.getByText(/Defterde/)).toBeTruthy());
  expect(await loadVocab()).toHaveLength(1);
});

// --- kural uyumu bandı ------------------------------------------------------

test("beklenenden çok yeni kelime varsa UYARI ve yeniden üretme sunulur", async () => {
  await openReader(text({ complianceRatio: 0.5, unplannedUnknown: ["شجرة"] }));
  expect(screen.getByText(/beklenenden çok yeni kelime/)).toBeTruthy();
  fireEvent.press(screen.getByText(/Yeniden üret/));
  expect(lastAlert()?.body).toMatch(/API isteği/); // yeniden üretim de ücretlidir
});

test("başlangıç metninde uyarı çıkmaz — yeni öğrencide yanlış alarm olurdu", async () => {
  await openReader(text({ coldStart: true, complianceRatio: 0.4 }));
  expect(screen.queryByText(/beklenenden çok yeni kelime/)).toBeNull();
  expect(screen.getByText(/Başlangıç metni/)).toBeTruthy();
});

// --- boş kütüphane ----------------------------------------------------------

test("kütüphane boşken ne olduğu anlatılır ve ilk adım gösterilir", async () => {
  await openLibrary();
  await waitFor(() => expect(screen.getByText(/Sana özel okuma metinleri/)).toBeTruthy());
  expect(screen.getByText(/İlk metnini hazırlat/)).toBeTruthy();
});
