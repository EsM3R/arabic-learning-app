/**
 * Panel testi.
 *
 * Panel iki şey yapıyor ve ikisi de sessizce bozulabilir.
 *
 * 1) UYANIŞ KONTROLÜ. Uygulama her açıldığında hocaya "öğrencinin durumu bu"
 *    diye bir özet gider ve hoca panele not bırakır. Buranın iki yönlü
 *    kusuru var: gereksiz yere çalışırsa her açılış para harcar; gerektiği
 *    hâlde çalışmazsa hoca öğrencinin sıkıntısını hiç görmez. İkincisi
 *    uygulamanın geçmişte gerçekten yaşadığı kusur: çalışkan ama HİÇ
 *    KONUŞMAYAN öğrenci dürtülmüyordu, çünkü tekrarını aksatmıyordu diye
 *    "dürtecek bir şey yok" sayılıyordu. Asıl dürtülmesi gereken oydu.
 *    Bu yüzden burada hocaya GİDEN ÖZETİN İÇERİĞİ de ölçülüyor.
 *
 * 2) PARA HARCAYAN DÜĞMELER. Müfredat kurulumu ve sınav. İkisinin de boşa
 *    harcanmaması gereken yolları var: onaysız kurulum, boş defterle sınav.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import DashboardScreen from "../src/screens/DashboardScreen";
import { setActiveLanguage } from "../src/languages";
import { recordStats, flushStats } from "../src/statsStore";
import {
  saveVocab,
  saveWakeCheck,
  touchLastActivity,
} from "../src/storage";
import type { Curriculum, Profile, VocabCard } from "../src/types";

const mockChat = jest.fn();
const mockCurriculum = jest.fn();
jest.mock("../src/claude", () => ({
  agenticChat: (...args: unknown[]) => mockChat(...args),
  generateCurriculum: (...args: unknown[]) => mockCurriculum(...args),
}));

let seq = 0;
function card(over: Partial<VocabCard> = {}): VocabCard {
  seq += 1;
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
  return {
    id: `v${seq}`,
    arabic: "بَيْت",
    transliteration: "beyt",
    turkish: "ev",
    track: "okuma",
    addedAt: "2026-09-01T10:00:00.000Z",
    due: future, // varsayılan: tekrarı GELMEMİŞ (uyanış tetiği kapalı)
    intervalDays: 30,
    ease: 2.5,
    reps: 3,
    lapses: 0,
    ...over,
  } as VocabCard;
}

function curriculum(count = 6): Curriculum {
  return {
    generatedAt: "2026-09-01T00:00:00.000Z",
    modules: Array.from({ length: count }, (_, i) => ({
      id: `m${i}`,
      track: i % 2 === 0 ? ("okuma" as const) : ("konusma" as const),
      title: `Modül ${i}`,
      description: "…",
      level: "A1",
      objectives: ["x"],
    })),
  };
}

function profile(over: Partial<Profile> = {}): Profile {
  return {
    name: "Mehmet",
    apiKey: "sk-ant-x",
    completedModuleIds: [],
    assessment: {
      speakingLevel: "A1",
      readingLevel: "A1",
      strengths: [],
      weaknesses: [],
      summary: "",
    },
    curriculum: curriculum(),
    ...over,
  } as unknown as Profile;
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

/** Hocaya giden son durum özeti. */
function lastDigest(): string {
  const messages = mockChat.mock.calls[0][1] as { content: string }[];
  return messages[0].content;
}

const calls: Record<string, number> = {};
const builtCurricula: Curriculum[] = [];
function count(name: string) {
  return () => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
}

beforeEach(async () => {
  seq = 0;
  alerts.length = 0;
  builtCurricula.length = 0;
  for (const k of Object.keys(calls)) delete calls[k];
  mockChat.mockReset();
  mockChat.mockImplementation(async () => ({ text: "Bugün kelimelere bakalım.", actions: [] }));
  mockCurriculum.mockReset();
  mockCurriculum.mockResolvedValue(curriculum(12));
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  jest
    .spyOn(Alert, "alert")
    .mockImplementation((title?: string, body?: string, buttons?: Btn[]) => {
      alerts.push({ title, body, buttons });
    });
});

async function open(p: Profile = profile()) {
  render(
    <DashboardScreen
      profile={p}
      onOpenModule={count("module")}
      onFreeChat={count("freeChat")}
      onQuiz={count("quiz")}
      onOpenReview={count("review")}
      onOpenMistakes={count("mistakes")}
      onOpenPronunciation={count("pronunciation")}
      onOpenReading={count("reading")}
      onOpenShadowing={count("shadowing")}
      onOpenFluency={count("fluency")}
      onOpenConversation={count("conversation")}
      onOpenSentences={count("sentences")}
      onSwitchLanguage={count("switchLanguage")}
      onOpenLevel={count("level")}
      onCurriculumBuilt={(c) => builtCurricula.push(c)}
      onLevelUp={count("levelUp")}
      onOpenSettings={count("settings")}
      onReset={count("reset")}
    />
  );
  await act(async () => {});
}

// --- uyanış kontrolü: gereksiz harcama --------------------------------------

test("tetik yokken uyanış kontrolü API'ye HİÇ gitmez", async () => {
  // Tekrar birikmemiş, bugün çalışılmış, sesli iş var: dürtecek bir şey yok.
  await saveVocab([card(), card()]);
  await touchLastActivity();
  await recordStats(["spoken", "spoken", "reviewed"]);
  await flushStats();
  await open();
  await act(async () => {});
  expect(mockChat).not.toHaveBeenCalled();
});

test("12 saat içinde ikinci açılışta KAYITLI not gösterilir, istek atılmaz", async () => {
  await saveWakeCheck({ at: new Date().toISOString(), message: "Dün bıraktığın yerden." });
  await open();
  await waitFor(() => expect(screen.getByText(/Dün bıraktığın yerden/)).toBeTruthy());
  expect(mockChat).not.toHaveBeenCalled();
});

// --- uyanış kontrolü: görmesi gerekeni görmesi ------------------------------

test("HİÇ KONUŞMAMIŞ çalışkan öğrenci için uyanış kontrolü ÇALIŞIR", async () => {
  // Uygulamanın gerçekten yaşadığı körlük: tekrarını aksatmayan ama
  // mikrofona hiç konuşmamış öğrenci hiç dürtülmüyordu.
  await saveVocab(Array.from({ length: 20 }, () => card()));
  await touchLastActivity();
  await recordStats(["reviewed", "reviewed", "readSentence"]);
  await flushStats();
  await open();

  await waitFor(() => expect(mockChat).toHaveBeenCalledTimes(1));
  expect(lastDigest()).toMatch(/mikrofonla HİÇ konuşmamış/);
});

test("özet ONARIM REFLEKSİNİ de taşır — hoca panelde de görmeli", async () => {
  await saveVocab(Array.from({ length: 30 }, () => card()));
  await touchLastActivity();
  await open();
  await waitFor(() => expect(mockChat).toHaveBeenCalledTimes(1));
  expect(lastDigest()).toMatch(/bir kez bile onarım hamlesi/);
});

test("tekrar birikince uyanış kontrolü çalışır ve not panele yazılır", async () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  await saveVocab(Array.from({ length: 6 }, () => card({ due: past })));
  await touchLastActivity();
  await open();
  await waitFor(() => expect(screen.getByText(/Bugün kelimelere bakalım/)).toBeTruthy());
  expect(lastDigest()).toMatch(/6 kelimenin tekrarı gelmiş/);
});

test("uyanış kontrolü ÇÖKERSE panel yine de çalışır", async () => {
  // Karşılama notu süs değil ama can damarı da değil.
  mockChat.mockRejectedValueOnce(new Error("Ağ yok"));
  const past = new Date(Date.now() - 86_400_000).toISOString();
  await saveVocab(Array.from({ length: 6 }, () => card({ due: past })));
  await open();
  await waitFor(() => expect(mockChat).toHaveBeenCalled());
  expect(screen.getByText("Mehmet")).toBeTruthy();
});

test("müfredatı olmayan öğrenci için uyanış kontrolü çalışmaz", async () => {
  // Daha planı yokken "durumun şu" demek anlamsız ve ücretli.
  const past = new Date(Date.now() - 86_400_000).toISOString();
  await saveVocab(Array.from({ length: 6 }, () => card({ due: past })));
  await open(profile({ curriculum: undefined } as unknown as Partial<Profile>));
  await act(async () => {});
  expect(mockChat).not.toHaveBeenCalled();
});

// --- para harcayan düğmeler -------------------------------------------------

test("müfredat kurulumu ONAY ister; vazgeçilirse istek atılmaz", async () => {
  await open(profile({ curriculum: undefined } as unknown as Partial<Profile>));
  await waitFor(() => expect(screen.getByText(/Müfredatı kur/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Müfredatı kur/));
  expect(lastAlert()?.body).toMatch(/API isteği/);
  pressAlert(/Vazgeç/);
  await act(async () => {});
  expect(mockCurriculum).not.toHaveBeenCalled();
});

test("onaylanan kurulum müfredatı yazar", async () => {
  await open(profile({ curriculum: undefined } as unknown as Partial<Profile>));
  await waitFor(() => expect(screen.getByText(/Müfredatı kur/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Müfredatı kur/));
  pressAlert(/Evet, kursun/);
  await waitFor(() => expect(builtCurricula).toHaveLength(1));
  expect(builtCurricula[0].modules).toHaveLength(12);
});

test("KISA müfredat sessizce kabul edilmez", async () => {
  mockCurriculum.mockResolvedValueOnce(curriculum(2));
  await open(profile({ curriculum: undefined } as unknown as Partial<Profile>));
  await waitFor(() => expect(screen.getByText(/Müfredatı kur/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Müfredatı kur/));
  pressAlert(/Evet, kursun/);
  await waitFor(() => expect(screen.getByText(/beklenenden kısa/)).toBeTruthy());
  expect(builtCurricula).toHaveLength(0);
});

test("defter BOŞKEN sınav açmak istek harcamaz", async () => {
  // Hocanın "tekrar edecek kelime yok" demesi için para ödemek anlamsız.
  await open();
  await waitFor(() => expect(screen.getByText(/ile Tekrar/)).toBeTruthy());
  fireEvent.press(screen.getByText(/ile Tekrar/));
  expect(lastAlert()?.title).toMatch(/Kelime defteri boş/);
  expect(calls.quiz ?? 0).toBe(0);
});

test("defterde kelime VARSA sınav açılır", async () => {
  await saveVocab([card()]);
  await open();
  await waitFor(() => expect(screen.getByText(/ile Tekrar/)).toBeTruthy());
  fireEvent.press(screen.getByText(/ile Tekrar/));
  expect(calls.quiz).toBe(1);
});

// --- fusha göçü (yıkıcı yol) ------------------------------------------------

test("ammice kartlar SESSİZCE silinmez — kaç kart gideceği söylenip onay alınır", async () => {
  await saveVocab([
    card({ track: "konusma" }),
    card({ track: "konusma" }),
    card({ track: "okuma" }),
  ]);
  await open();
  await waitFor(() => expect(screen.getByText(/Fushaya geçiş/)).toBeTruthy());
  expect(screen.getByText(/2 ammice kart · 6 modül/)).toBeTruthy();

  fireEvent.press(screen.getByText(/Temizle ve fushaya geç/));
  expect(lastAlert()?.title).toMatch(/Fushaya geç/);

  pressAlert(/Vazgeç/);
  await act(async () => {});
  const { loadVocab } = require("../src/storage");
  expect(await loadVocab()).toHaveLength(3); // hiçbir kart gitmedi
  expect(builtCurricula).toHaveLength(0);
});

test("onaylanan göç ammice kartları temizler, fusha kartlarına dokunmaz", async () => {
  await saveVocab([card({ track: "konusma" }), card({ track: "okuma", turkish: "ev" })]);
  await open();
  await waitFor(() => expect(screen.getByText(/Temizle ve fushaya geç/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Temizle ve fushaya geç/));
  pressAlert(/Evet, temizle/);

  const { loadVocab } = require("../src/storage");
  await waitFor(async () => {
    const cards = await loadVocab();
    expect(cards).toHaveLength(1);
    expect(cards[0].track).toBe("okuma");
  });
  // Müfredat ammiceye göre kurulmuştu: sıfırlanmalı.
  await waitFor(() => expect(builtCurricula[0]?.modules).toHaveLength(0));
});

// --- hafta özeti ------------------------------------------------------------

test("hafta özeti gün serisi değil ÜRETİM anlatır", async () => {
  // "5 gün üst üste" motive eder ama hiçbir şey söylemez; ne ürettiği söyler.
  await saveVocab([card()]);
  await recordStats(["produced", "produced", "reviewed", "shadowed"]);
  await flushStats();
  await open();
  await waitFor(() => expect(screen.getByText(/Bu hafta:/)).toBeTruthy());
  const line = ([] as unknown[])
    .concat(screen.getByText(/Bu hafta:/).props.children)
    .join("");
  expect(line).toMatch(/2 cümle ürettin/);
  expect(line).toMatch(/1 kelime tekrar ettin/);
  expect(line).toMatch(/1 gölgeleme yaptın/);
});

// --- sıfırlama --------------------------------------------------------------

test("sıfırlama tek dokunuşla olmaz — onay ister", async () => {
  await open();
  await waitFor(() => expect(screen.getByText("Mehmet")).toBeTruthy());
  fireEvent.press(screen.getByText(/⋯|Ayarlar/));
  pressAlert(/Sıfırla/);
  expect(lastAlert()?.body).toMatch(/Emin misin/);
  expect(calls.reset ?? 0).toBe(0);

  pressAlert(/Vazgeç/);
  expect(calls.reset ?? 0).toBe(0);
});
